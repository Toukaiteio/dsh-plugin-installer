import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

//#region src/marketplace.ts
var UserFacingError = class extends Error {
	constructor(code, message, status = 400, hint, command) {
		super(message);
		this.code = code;
		this.status = status;
		this.hint = hint;
		this.command = command;
	}
};
const TLS_CERTIFICATE_CODES = new Set([
	"CERT_UNTRUSTED",
	"DEPTH_ZERO_SELF_SIGNED_CERT",
	"SELF_SIGNED_CERT_IN_CHAIN",
	"UNABLE_TO_GET_ISSUER_CERT",
	"UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
	"UNABLE_TO_VERIFY_LEAF_SIGNATURE"
]);
const NETWORK_TIMEOUT_CODES = new Set([
	"ETIMEDOUT",
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_HEADERS_TIMEOUT"
]);
/** Convert Node/undici connection failures into safe, actionable API errors. */
function githubConnectionError(error) {
	if (errorChainHas(error, (value) => typeof value.code === "string" && TLS_CERTIFICATE_CODES.has(value.code))) return new UserFacingError("github-tls-certificate", "无法验证 GitHub 的 TLS 证书。", 502, "若使用 FastGitHub、steamcommunity_302 等本地 HTTPS 加速器或代理，请完全退出 DSH 后，在 Windows CMD 中重新启动：", "set \"NODE_OPTIONS=%NODE_OPTIONS% --use-system-ca\" && npx @deepseek-ai/dsh web");
	if (errorChainHas(error, (value) => value.name === "TimeoutError" || typeof value.code === "string" && NETWORK_TIMEOUT_CODES.has(value.code))) return new UserFacingError("github-timeout", "连接 GitHub 超时，请检查网络、代理或防火墙后重试。", 504);
	return new UserFacingError("github-unavailable", "无法连接 GitHub，请检查网络、代理或防火墙后重试。", 502);
}
function errorChainHas(error, predicate) {
	const seen = /* @__PURE__ */ new Set();
	let current = error;
	while (current !== null && typeof current === "object") {
		if (seen.has(current)) return false;
		seen.add(current);
		const value = current;
		if (predicate(value)) return true;
		current = value.cause;
	}
	return false;
}
/** DeepSeek Harness itself is a host application, not a marketplace plugin. */
const EXCLUDED_MARKETPLACE_REPOSITORIES = new Set(["deepseek-ai/deepseek-harness"]);
function isMarketplacePluginRepository(owner, repository) {
	return !EXCLUDED_MARKETPLACE_REPOSITORIES.has(`${owner}/${repository}`.toLocaleLowerCase());
}
function isProfileName(value) {
	return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}
function isRepositorySegment(value) {
	return typeof value === "string" && /^[A-Za-z0-9_.-]+$/.test(value);
}
/** Extract only the fields that make a root package a DSH bundle. */
function parseDshBundleManifest(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
	const manifest = value;
	const name$1 = manifest.name;
	const dsh = manifest.dsh;
	if (typeof name$1 !== "string" || name$1.length === 0 || dsh === null || typeof dsh !== "object") return null;
	const bundle = dsh.bundle;
	const patch = bundle !== null && typeof bundle === "object" ? bundle.patch : void 0;
	if (typeof patch !== "string" || patch.length === 0) return null;
	const scripts = manifest.scripts;
	const prepare = scripts !== null && typeof scripts === "object" ? scripts.prepare : void 0;
	const main = manifest.main;
	return {
		name: name$1,
		version: typeof manifest.version === "string" ? manifest.version : null,
		description: typeof manifest.description === "string" ? manifest.description : null,
		patch,
		entry: typeof main === "string" && isPackageEntryPath(main) ? main : null,
		prepareScript: typeof prepare === "string" && prepare.trim().length > 0 ? prepare : null
	};
}
function githubInstallSpec(owner, repository, sha) {
	if (!isRepositorySegment(owner) || !isRepositorySegment(repository) || !/^[0-9a-f]{7,64}$/i.test(sha)) throw new UserFacingError("invalid-repository", "GitHub 仓库或提交标识不合法。");
	return `github:${owner}/${repository}#${sha}`;
}
/**
* Select the package archive for a bundle from a GitHub Release response.
* The marketplace installs release archives, never an unbuilt source checkout.
*/
function githubReleaseArchive(packageName, value) {
	if (!isPackageName$1(packageName) || value === null || typeof value !== "object" || Array.isArray(value)) return null;
	const release = value;
	const tag = release.tag_name;
	const releasePrerelease = release.prerelease === true;
	const assets = release.assets;
	if (typeof tag !== "string" || !isReleaseTag(tag) || !Array.isArray(assets)) return null;
	const version = tag.startsWith("v") ? tag.slice(1) : tag;
	const expectedName = `${packageName.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
	const candidates = assets.flatMap((value$1) => {
		if (value$1 === null || typeof value$1 !== "object" || Array.isArray(value$1)) return [];
		const asset = value$1;
		const name$1 = asset.name;
		const downloadUrl = asset.browser_download_url;
		if (typeof name$1 !== "string" || typeof downloadUrl !== "string" || name$1 !== expectedName || !isHttpsUrl(downloadUrl)) return [];
		return [{
			tag,
			version,
			name: name$1,
			downloadUrl,
			sha256: typeof asset.digest === "string" && /^sha256:[0-9a-f]{64}$/i.test(asset.digest) ? asset.digest.slice(7).toLowerCase() : null,
			size: typeof asset.size === "number" && Number.isSafeInteger(asset.size) && asset.size >= 0 ? asset.size : null,
			prerelease: asset.prerelease === true || releasePrerelease
		}];
	});
	return candidates.length === 1 ? candidates[0] ?? null : null;
}
/** Preserve GitHub's release order while retaining only installable package archives. */
function githubReleaseArchives(packageName, value) {
	if (!Array.isArray(value)) return [];
	const tags = /* @__PURE__ */ new Set();
	return value.flatMap((release) => {
		if (release !== null && typeof release === "object" && !Array.isArray(release) && release.draft === true) return [];
		const archive = githubReleaseArchive(packageName, release);
		if (archive === null || tags.has(archive.tag)) return [];
		tags.add(archive.tag);
		return [archive];
	});
}
function isReleaseTag(value) {
	return /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}
function isHttpsUrl(value) {
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
}
function isPackageName$1(value) {
	return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(value);
}
/** Accept only a package-relative JavaScript entry that can be checked in GitHub Contents. */
function isPackageEntryPath(value) {
	return /^(?:\.\/)?(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.m?js$/.test(value);
}
/** Normalize a catalog query so clients and the host share the same cache key. */
function normalizeCatalogQuery(query) {
	return query.trim().replace(/\s+/g, " ").slice(0, 120);
}
/**
* Return a new catalog sorted by the chosen key without mutating the source.
* `updated` orders by the repository update timestamp and `stars` by the star
* count. Both keys map directly to GitHub's supported repository search sort
* options.
*/
function sortCatalog(entries, key, direction) {
	const factor = direction === "asc" ? 1 : -1;
	return [...entries].sort((a, b) => {
		const compared = key === "stars" ? a.stars - b.stars : a.updatedAt.localeCompare(b.updatedAt);
		if (compared !== 0) return factor * compared;
		return a.fullName.localeCompare(b.fullName, void 0, {
			numeric: true,
			sensitivity: "variant"
		});
	});
}

//#endregion
//#region src/index.ts
const name = "dsh-plugin-installer";
const inject = ["webServer"];
const ROUTE_PREFIX = "/dsh-plugin-installer";
const API_PREFIX = `${ROUTE_PREFIX}/api`;
/** How long the marketplace catalog stays cached before re-querying GitHub. */
const CATALOG_CACHE_TTL_MS = 12 * 6e4;
/** Number of repositories requested from each GitHub topic query per page. */
const CATALOG_PAGE_SIZE = 30;
/** GitHub Search API exposes at most 1,000 results for one query. */
const CATALOG_MAX_PAGE = Math.ceil(1e3 / CATALOG_PAGE_SIZE);
/** Bound the number of sort/filter/page combinations retained by one process. */
const CATALOG_CACHE_MAX_ENTRIES = 48;
/** Refuse unexpectedly large release packages before writing them to DSH_HOME. */
const MAX_RELEASE_ARCHIVE_BYTES = 32 * 1024 * 1024;
const SELF_MANIFEST = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));
/** Web host half: GitHub discovery, explicit permission gates and profile launch. */
function apply(ctx) {
	const runtime = new MarketplaceRuntime(ctx);
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: ROUTE_PREFIX,
		handler: async (request, response) => {
			await runtime.handle(request, response);
		}
	}), "dsh-plugin-installer: web API");
}
var MarketplaceRuntime = class {
	dshHome;
	profilesRoot;
	currentProfile;
	githubToken;
	githubTokenSource;
	searchCache = /* @__PURE__ */ new Map();
	releaseCache = /* @__PURE__ */ new Map();
	commitCache = /* @__PURE__ */ new Map();
	constructor(ctx) {
		this.ctx = ctx;
		this.dshHome = this.resolveDshHome();
		this.profilesRoot = join(this.dshHome, "profiles");
		const savedToken = this.readSavedGithubToken();
		const environmentToken = this.readEnvironmentGithubToken();
		this.githubToken = savedToken ?? environmentToken;
		this.githubTokenSource = savedToken !== null ? "saved" : environmentToken !== null ? "environment" : "none";
		this.currentProfile = this.resolveCurrentProfile();
	}
	async handle(request, response) {
		try {
			const url = new URL(request.url ?? "/", "http://127.0.0.1");
			if (!url.pathname.startsWith(API_PREFIX)) throw new UserFacingError("not-found", "未找到请求的接口。", 404);
			const tail = url.pathname.slice(API_PREFIX.length) || "/";
			if (request.method === "GET" && tail === "/state") return this.json(response, 200, await this.state());
			if (request.method === "GET" && tail === "/config") return this.json(response, 200, this.githubConfig());
			if (request.method === "GET" && tail === "/plugins") {
				const sort = parseCatalogSort(url.searchParams.get("sort"));
				const direction = parseCatalogDirection(url.searchParams.get("order"));
				const page = parseCatalogPage(url.searchParams.get("page"));
				const result = await this.search(url.searchParams.get("query") ?? "", sort, direction, page, url.searchParams.get("refresh") === "1");
				return this.json(response, 200, {
					...result,
					page,
					sort,
					direction
				});
			}
			const match = /^\/plugin\/([^/]+)\/([^/]+)$/.exec(tail);
			if (request.method === "GET" && match !== null) {
				const [, owner, repository] = match;
				if (owner === void 0 || repository === void 0) throw new UserFacingError("invalid-repository", "GitHub 仓库地址不合法。");
				return this.json(response, 200, { plugin: await this.inspect(owner, repository) });
			}
			const body = request.method === "POST" ? await readJson(request) : void 0;
			if (request.method === "POST" && tail === "/config") return this.json(response, 200, this.configureGithubToken(body));
			if (request.method === "POST" && tail === "/install") return this.json(response, 200, await this.install(body));
			if (request.method === "POST" && tail === "/update") return this.json(response, 200, await this.update(body));
			if (request.method === "POST" && tail === "/remove") return this.json(response, 200, await this.remove(body));
			if (request.method === "POST" && tail === "/switch") return this.json(response, 200, await this.switchProfile(body));
			if (request.method === "POST" && tail === "/restart") return this.json(response, 200, await this.restartCurrentProfile(body));
			if (request.method === "POST" && tail === "/profiles") return this.json(response, 201, await this.createProfile(body));
			throw new UserFacingError("not-found", "未找到请求的接口。", 404);
		} catch (error) {
			const known = error instanceof UserFacingError ? error : new UserFacingError("internal", "操作未完成，请稍后重试。", 500);
			if (!(error instanceof UserFacingError)) this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
			this.json(response, known.status, { error: {
				code: known.code,
				message: known.message,
				...known.hint === void 0 ? {} : { hint: known.hint },
				...known.command === void 0 ? {} : { command: known.command }
			} });
		}
	}
	async state() {
		return {
			currentProfile: this.currentProfile,
			profiles: await this.listProfiles()
		};
	}
	async listProfiles() {
		if (!existsSync(this.profilesRoot)) return [];
		const profiles = readdirSync(this.profilesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && isProfileName(entry.name)).flatMap((entry) => {
			const manifest = this.readProfile(entry.name);
			if (manifest === null) return [];
			const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles.filter((item) => typeof item === "string") : [];
			const installedRepositories = Object.values(manifest.dependencies ?? {}).map(githubRepositoryFromSpecifier).filter((repository) => repository !== null);
			for (const packageName of Object.keys(manifest.dependencies ?? {})) {
				const repository = this.repositoryFromInstalledPackage(entry.name, packageName);
				if (repository !== null) installedRepositories.push(repository);
			}
			return [{
				name: entry.name,
				bundles,
				installedRepositories: [...new Set(installedRepositories)],
				installedPlugins: this.installedPlugins(entry.name, manifest, bundles),
				webCapable: bundles.includes("@deepseek-ai/dsh-web-app")
			}];
		});
		return await Promise.all(profiles.map(async (profile) => ({
			...profile,
			installedPlugins: await Promise.all(profile.installedPlugins.map((plugin) => this.checkForUpdate(profile.name, plugin)))
		}))).then((value) => value.sort((a, b) => a.name.localeCompare(b.name)));
	}
	async search(query, sort, direction, page, bypassCache = false) {
		const normalized = normalizeCatalogQuery(query);
		if (bypassCache && page === 1) this.clearSearchCache(normalized, sort, direction);
		const cacheKey = JSON.stringify([
			normalized,
			sort,
			direction,
			page
		]);
		const cached = this.searchCache.get(cacheKey);
		if (!bypassCache && cached !== void 0 && cached.expiresAt > Date.now()) return cached.value;
		const words = normalized.length === 0 ? "" : ` ${normalized.replace(/\s+/g, " ")}`;
		const queryOptions = `sort=${sort}&order=${direction}&page=${page}&per_page=${CATALOG_PAGE_SIZE}`;
		const responses = await Promise.all([this.githubJson(`/search/repositories?q=${encodeURIComponent(`topic:dsh-plugin archived:false${words}`)}&${queryOptions}`), this.githubJson(`/search/repositories?q=${encodeURIComponent(`topic:dsh archived:false${words}`)}&${queryOptions}`)]);
		const combined = /* @__PURE__ */ new Map();
		for (const item of responses.flatMap((response) => response.items)) {
			const repository = toRepository(item);
			if (isMarketplacePluginRepository(repository.owner, repository.name)) combined.set(repository.id, repository);
		}
		const result = {
			plugins: sortCatalog([...combined.values()], sort, direction).slice(0, CATALOG_PAGE_SIZE * 2),
			hasMore: page < CATALOG_MAX_PAGE && responses.some((response) => response.items.length === CATALOG_PAGE_SIZE)
		};
		this.cacheSearch(cacheKey, result);
		return result;
	}
	githubConfig() {
		return {
			configured: this.githubToken !== null,
			source: this.githubTokenSource
		};
	}
	configureGithubToken(body) {
		const value = object(body).githubToken;
		if (typeof value !== "string") throw new UserFacingError("invalid-github-token", "GitHub Token 必须是文本。", 400);
		const token = value.trim();
		const configPath = join(this.dshHome, "config", "dsh-plugin-installer.json");
		mkdirSync(dirname(configPath), { recursive: true });
		writeFileSync(configPath, `${JSON.stringify(token.length === 0 ? {} : { githubToken: token }, null, 2)}\n`, {
			encoding: "utf8",
			mode: 384
		});
		try {
			chmodSync(configPath, 384);
		} catch {}
		const environmentToken = this.readEnvironmentGithubToken();
		this.githubToken = token.length === 0 ? environmentToken : token;
		this.githubTokenSource = token.length === 0 ? environmentToken === null ? "none" : "environment" : "saved";
		this.searchCache.clear();
		this.releaseCache.clear();
		this.commitCache.clear();
		return this.githubConfig();
	}
	readSavedGithubToken() {
		const configPath = join(this.dshHome, "config", "dsh-plugin-installer.json");
		if (!existsSync(configPath)) return null;
		try {
			const config = JSON.parse(readFileSync(configPath, "utf8"));
			return typeof config.githubToken === "string" && config.githubToken.trim().length > 0 ? config.githubToken.trim() : null;
		} catch {
			return null;
		}
	}
	readEnvironmentGithubToken() {
		const token = process.env.GITHUB_TOKEN?.trim();
		return token === void 0 || token.length === 0 ? null : token;
	}
	cacheSearch(key, value) {
		const now = Date.now();
		for (const [key$1, entry] of this.searchCache) if (entry.expiresAt <= now) this.searchCache.delete(key$1);
		if (!this.searchCache.has(key) && this.searchCache.size >= CATALOG_CACHE_MAX_ENTRIES) {
			const oldest = this.searchCache.keys().next().value;
			if (oldest !== void 0) this.searchCache.delete(oldest);
		}
		this.searchCache.set(key, {
			value,
			expiresAt: now + CATALOG_CACHE_TTL_MS
		});
	}
	clearSearchCache(query, sort, direction) {
		const prefix = `${JSON.stringify([
			query,
			sort,
			direction
		]).slice(0, -1)},`;
		for (const key of this.searchCache.keys()) if (key.startsWith(prefix)) this.searchCache.delete(key);
	}
	async inspect(owner, repository, releaseTag) {
		if (!isRepositorySegment(owner) || !isRepositorySegment(repository)) throw new UserFacingError("invalid-repository", "GitHub 仓库地址不合法。");
		if (!isMarketplacePluginRepository(owner, repository)) throw new UserFacingError("not-a-plugin", "DeepSeek Harness 本体不是可安装的市场插件。", 400);
		const repo = toRepository(await this.githubJson(`/repos/${owner}/${repository}`));
		let parsed = null;
		try {
			const file = await this.githubJson(`/repos/${owner}/${repository}/contents/package.json?ref=${encodeURIComponent(repo.defaultBranch)}`);
			if (file.encoding !== "base64") throw new Error("Unexpected package.json encoding");
			parsed = parseDshBundleManifest(JSON.parse(Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8")));
		} catch (error) {
			if (error instanceof UserFacingError && error.status !== 404) throw error;
		}
		if (parsed === null) return {
			repository: repo,
			packageName: null,
			version: null,
			description: null,
			installSpec: null,
			release: null,
			releases: [],
			installSource: null,
			validBundle: false,
			reason: "仓库根目录没有声明 dsh.bundle.patch，不能作为 DSH bundle 安装。",
			requiresBuildApproval: false
		};
		const releases = await this.releaseArchives(owner, repository, parsed.name);
		const release = releaseTag === void 0 ? releases.find((item) => item.version === parsed.version && !item.prerelease) ?? releases.find((item) => !item.prerelease) ?? releases[0] ?? null : releases.find((item) => item.tag === releaseTag) ?? null;
		if (release !== null) return {
			repository: repo,
			packageName: parsed.name,
			version: release.version ?? parsed.version,
			description: parsed.description ?? repo.description,
			installSpec: release.downloadUrl,
			release,
			releases,
			installSource: "release",
			validBundle: true,
			reason: null,
			requiresBuildApproval: false
		};
		if (releaseTag !== void 0) return {
			repository: repo,
			packageName: parsed.name,
			version: parsed.version,
			description: parsed.description ?? repo.description,
			installSpec: null,
			release: null,
			releases,
			installSource: null,
			validBundle: false,
			reason: "所选 GitHub Release 版本不可用或缺少匹配的安装包。",
			requiresBuildApproval: false
		};
		const commit = await this.latestCommit(owner, repository);
		if (commit === null) throw new UserFacingError("github-error", "无法解析该仓库的当前提交。", 502);
		if (!(parsed.entry !== null && await this.sourceEntryExists(owner, repository, commit, parsed.entry))) {
			const reason = parsed.entry === null ? "该仓库没有可安装的 GitHub Release，且 package.json 未声明可验证的 JavaScript 入口文件，无法安全安装。" : `该仓库没有可安装的 GitHub Release，且源码提交中缺少入口文件 ${parsed.entry}，无法安全安装。`;
			return {
				repository: repo,
				packageName: parsed.name,
				version: parsed.version,
				description: parsed.description ?? repo.description,
				installSpec: null,
				release: null,
				releases,
				installSource: null,
				validBundle: false,
				reason,
				requiresBuildApproval: false
			};
		}
		return {
			repository: repo,
			packageName: parsed.name,
			version: parsed.version,
			description: parsed.description ?? repo.description,
			installSpec: githubInstallSpec(owner, repository, commit),
			release: null,
			releases,
			installSource: "source",
			validBundle: true,
			reason: null,
			requiresBuildApproval: parsed.prepareScript !== null
		};
	}
	async install(body) {
		const input = object(body);
		const profile = input.profile;
		const owner = input.owner;
		const repository = input.repository;
		const releaseTag = input.releaseTag;
		if (!isProfileName(profile) || !this.profileExists(profile)) throw new UserFacingError("unknown-profile", "请选择一个已有 Profile。");
		if (!isRepositorySegment(owner) || !isRepositorySegment(repository)) throw new UserFacingError("invalid-repository", "GitHub 仓库地址不合法。");
		if (releaseTag !== void 0 && (typeof releaseTag !== "string" || !isReleaseTag(releaseTag))) throw new UserFacingError("invalid-release", "所选 GitHub Release 版本不合法。");
		const candidate = await this.inspect(owner, repository, releaseTag);
		if (!candidate.validBundle || candidate.installSpec === null) throw new UserFacingError("not-a-bundle", candidate.reason ?? "该仓库不是 DSH bundle。");
		if (candidate.requiresBuildApproval && input.allowBuild !== true) throw new UserFacingError("build-approval-required", "该插件含 prepare 安装脚本；勾选执行授权后才能继续。", 409);
		if (candidate.requiresBuildApproval && candidate.packageName !== null) this.allowBuild(profile, candidate.packageName);
		return {
			installed: candidate,
			output: (await this.runDsh([
				"plugin",
				"--profile",
				profile,
				"add",
				await this.resolveInstallSpec(candidate)
			])).output,
			restartAvailable: profile === this.currentProfile && this.profileSupportsWeb(profile)
		};
	}
	async update(body) {
		const input = object(body);
		const profile = input.profile;
		const packageName = input.packageName;
		const owner = input.owner;
		const repository = input.repository;
		if (!isProfileName(profile) || !this.profileExists(profile)) throw new UserFacingError("unknown-profile", "请选择一个已有 Profile。");
		if (typeof packageName !== "string" || !isPackageName(packageName)) throw new UserFacingError("invalid-plugin", "插件名称不合法。");
		if (typeof owner !== "string" || typeof repository !== "string" || !isRepositorySegment(owner) || !isRepositorySegment(repository)) throw new UserFacingError("invalid-repository", "GitHub 仓库地址不合法。");
		const installed = this.findInstalledPlugin(profile, packageName);
		if (installed === null || installed.repository !== `${owner}/${repository}`.toLocaleLowerCase()) throw new UserFacingError("unknown-plugin", "该插件不属于所选 Profile。", 404);
		const candidate = await this.inspect(owner, repository);
		if (!candidate.validBundle || candidate.installSpec === null || candidate.packageName !== packageName) throw new UserFacingError("not-a-bundle", "仓库当前版本不再是同名的 DSH bundle，无法更新。");
		return {
			updated: candidate,
			output: (await this.runDsh([
				"plugin",
				"--profile",
				profile,
				"add",
				await this.resolveInstallSpec(candidate)
			])).output,
			restartAvailable: profile === this.currentProfile && this.profileSupportsWeb(profile)
		};
	}
	async remove(body) {
		const input = object(body);
		const profile = input.profile;
		const packageName = input.packageName;
		if (!isProfileName(profile) || !this.profileExists(profile)) throw new UserFacingError("unknown-profile", "请选择一个已有 Profile。");
		if (typeof packageName !== "string" || !isPackageName(packageName) || this.findInstalledPlugin(profile, packageName) === null) throw new UserFacingError("unknown-plugin", "该插件不属于所选 Profile。", 404);
		return {
			removed: packageName,
			output: (await this.runDsh([
				"plugin",
				"--profile",
				profile,
				"remove",
				packageName
			])).output,
			restartAvailable: profile === this.currentProfile && this.profileSupportsWeb(profile)
		};
	}
	async switchProfile(body) {
		const profile = object(body).profile;
		if (!isProfileName(profile) || !this.profileExists(profile)) throw new UserFacingError("unknown-profile", "请选择一个已有 Profile。");
		if (!this.profileSupportsWeb(profile)) throw new UserFacingError("not-web-profile", "此 Profile 未安装 Web UI，不能在浏览器中打开。", 409);
		return { url: await this.launchWeb(profile) };
	}
	/** Start a replacement Web process first, then dispose the current DSH process. */
	async restartCurrentProfile(body) {
		if (object(body).profile !== this.currentProfile || !this.profileSupportsWeb(this.currentProfile)) throw new UserFacingError("restart-unavailable", "只能重启当前正在运行的 Web Profile。", 409);
		const url = await this.launchWeb(this.currentProfile);
		setTimeout(() => {
			this.ctx.fiber.dispose().catch((error) => {
				this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
			});
		}, 750);
		return { url };
	}
	async createProfile(body) {
		const profile = object(body).name;
		if (!isProfileName(profile)) throw new UserFacingError("invalid-profile", "Profile 名称只能使用字母、数字、连字符和下划线。");
		if (this.profileExists(profile)) throw new UserFacingError("profile-exists", "该 Profile 已存在。", 409);
		const source = this.readProfile(this.currentProfile)?.dependencies?.[SELF_MANIFEST.name];
		if (typeof source !== "string" || source.length === 0) throw new UserFacingError("missing-self-source", "当前 Profile 未记录本插件的安装来源，无法复制到新 Profile。");
		await this.runDsh([
			"plugin",
			"--profile",
			profile,
			"add",
			"@deepseek-ai/dsh-web-app"
		]);
		await this.runDsh([
			"plugin",
			"--profile",
			profile,
			"add",
			source
		]);
		return { url: await this.launchWeb(profile) };
	}
	allowBuild(profile, packageName) {
		const path = join(this.profilesRoot, profile, "pnpm-workspace.yaml");
		const document = parseDocument(existsSync(path) ? readFileSync(path, "utf8") : "");
		if (document.errors.length > 0) throw new UserFacingError("invalid-pnpm-config", "该 Profile 的 pnpm-workspace.yaml 无法解析。");
		let allowed = document.get("allowBuilds", true);
		if (allowed === void 0 || allowed === null) {
			document.set("allowBuilds", {});
			allowed = document.get("allowBuilds", true);
		}
		if (allowed === null || typeof allowed !== "object" || !("set" in allowed)) throw new UserFacingError("invalid-pnpm-config", "该 Profile 的 allowBuilds 配置格式不正确。");
		allowed.set(packageName, true);
		writeFileSync(path, String(document));
	}
	async launchWeb(profile) {
		const child = spawn(process.execPath, [
			this.cliPath(),
			"--profile",
			profile,
			"--port",
			"0"
		], {
			detached: true,
			windowsHide: true,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			],
			env: process.env
		});
		return await new Promise((resolvePromise, reject) => {
			let output = "";
			const done = (callback) => {
				clearTimeout(timeout);
				child.stdout?.destroy();
				child.stderr?.destroy();
				callback();
			};
			const receive = (chunk) => {
				output = `${output}${chunk.toString()}`.slice(-16384);
				const address = /dsh web:\s*(http:\/\/127\.0\.0\.1:\d+)/i.exec(output)?.[1];
				if (address !== void 0) done(() => {
					child.unref();
					resolvePromise(address);
				});
			};
			child.stdout?.on("data", receive);
			child.stderr?.on("data", receive);
			child.once("error", (error) => done(() => reject(new UserFacingError("launch-failed", error.message, 500))));
			child.once("exit", () => done(() => reject(new UserFacingError("launch-failed", `Profile 未能启动：${output || "没有输出"}`, 500))));
			const timeout = setTimeout(() => done(() => reject(new UserFacingError("launch-timeout", `等待 Profile 启动超时：${output || "没有输出"}`, 504))), 3e4);
		});
	}
	runDsh(args) {
		return new Promise((resolvePromise, reject) => {
			const child = spawn(process.execPath, [this.cliPath(), ...args], {
				windowsHide: true,
				env: process.env,
				stdio: [
					"ignore",
					"pipe",
					"pipe"
				]
			});
			let output = "";
			const append = (chunk) => {
				output = `${output}${chunk.toString()}`.slice(-48e3);
			};
			child.stdout.on("data", append);
			child.stderr.on("data", append);
			child.once("error", (error) => reject(new UserFacingError("command-failed", error.message, 500)));
			child.once("exit", (code) => code === 0 ? resolvePromise({ output }) : reject(new UserFacingError("command-failed", `DSH 插件操作失败：${output || `退出码 ${code ?? "unknown"}`}`, 500)));
		});
	}
	cliPath() {
		if (process.argv[1] !== void 0 && existsSync(process.argv[1])) return process.argv[1];
		return join(dirname(createRequire(import.meta.url).resolve("@deepseek-ai/dsh/package.json")), "lib", "bin.js");
	}
	async githubJson(path) {
		const headers = {
			Accept: "application/vnd.github+json",
			"User-Agent": "dsh-plugin-installer"
		};
		if (this.githubToken !== null) headers.Authorization = `Bearer ${this.githubToken}`;
		let response;
		try {
			response = await fetch(`https://api.github.com${path}`, {
				headers,
				signal: AbortSignal.timeout(15e3)
			});
		} catch (error) {
			this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
			throw githubConnectionError(error);
		}
		if (!response.ok) {
			if (response.status === 404) throw new UserFacingError("github-not-found", "GitHub 未找到该仓库或文件。", 404);
			if (response.status === 401) throw new UserFacingError("github-auth-failed", "GitHub Token 无效或已过期，请更新插件设置。", 502);
			throw new UserFacingError("github-error", response.status === 403 || response.status === 429 ? "GitHub 请求频率受限，请稍后重试，或在插件市场的 GitHub 请求设置中配置 Token。" : `GitHub 返回了 ${response.status}。`, 502);
		}
		return await response.json();
	}
	resolveCurrentProfile() {
		if (this.ctx.baseUrl === void 0) throw new Error("dsh-plugin-installer requires a DSH profile baseUrl");
		const base = fileURLToPath(this.ctx.baseUrl);
		const path = relative(this.profilesRoot, resolve(base));
		if (!isProfileName(path)) throw new Error("dsh-plugin-installer must run from a DSH profile directory");
		return path;
	}
	resolveDshHome() {
		const configured = process.env.DSH_HOME;
		if (configured !== void 0 && configured.trim().length > 0) return resolve(configured);
		if (this.ctx.baseUrl === void 0) throw new Error("dsh-plugin-installer requires a DSH profile baseUrl");
		const profilesDirectory = dirname(resolve(fileURLToPath(this.ctx.baseUrl)));
		if (basename(profilesDirectory) !== "profiles") throw new Error("dsh-plugin-installer could not resolve DSH_HOME from the active profile");
		return dirname(profilesDirectory);
	}
	profileExists(profile) {
		return this.readProfile(profile) !== null;
	}
	profileSupportsWeb(profile) {
		const bundles = this.readProfile(profile)?.dsh?.profile?.bundles;
		return Array.isArray(bundles) && bundles.includes("@deepseek-ai/dsh-web-app");
	}
	readProfile(profile) {
		try {
			return JSON.parse(readFileSync(join(this.profilesRoot, profile, "package.json"), "utf8"));
		} catch {
			return null;
		}
	}
	repositoryFromInstalledPackage(profile, packageName) {
		const manifest = this.readInstalledPackage(profile, packageName);
		return manifest === null ? null : githubRepositoryFromMetadata(manifest.repository);
	}
	installedPlugins(profile, manifest, bundles) {
		return Object.entries(manifest.dependencies ?? {}).flatMap(([packageName, specifier]) => {
			if (!isPackageName(packageName) || packageName.startsWith("@deepseek-ai/") || packageName === SELF_MANIFEST.name) return [];
			const installed = this.readInstalledPackage(profile, packageName);
			const repository = githubRepositoryFromSpecifier(specifier) ?? githubRepositoryFromMetadata(installed?.repository);
			if (repository === null || !bundles.includes(packageName) && !isBundleManifest(installed)) return [];
			const [owner, repositoryName] = repository.split("/");
			if (owner === void 0 || repositoryName === void 0) return [];
			return [{
				packageName,
				repository,
				owner,
				repositoryName,
				installedVersion: typeof installed?.version === "string" ? installed.version : null,
				installedCommit: githubCommitFromSpecifier(specifier),
				updateStatus: "unknown"
			}];
		}).sort((a, b) => a.repository.localeCompare(b.repository));
	}
	findInstalledPlugin(profile, packageName) {
		const manifest = this.readProfile(profile);
		if (manifest === null) return null;
		const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles.filter((item) => typeof item === "string") : [];
		return this.installedPlugins(profile, manifest, bundles).find((plugin) => plugin.packageName === packageName) ?? null;
	}
	async checkForUpdate(profile, plugin) {
		if (!this.packageEntryExists(profile, plugin)) return {
			...plugin,
			updateStatus: "available"
		};
		const releases = await this.releaseArchives(plugin.owner, plugin.repositoryName, plugin.packageName);
		const latestRelease = releases.find((item) => !item.prerelease) ?? releases[0];
		if (latestRelease !== void 0 && plugin.installedVersion !== null && latestRelease.version !== null) return {
			...plugin,
			updateStatus: plugin.installedVersion === latestRelease.version ? "up-to-date" : "available"
		};
		if (plugin.installedCommit === null) return plugin;
		const latestCommit = await this.latestCommit(plugin.owner, plugin.repositoryName);
		if (latestCommit === null) return plugin;
		return {
			...plugin,
			updateStatus: sameCommit(plugin.installedCommit, latestCommit) ? "up-to-date" : "available"
		};
	}
	async releaseArchives(owner, repository, packageName) {
		const key = `${owner}/${repository}/${packageName}`.toLocaleLowerCase();
		const cached = this.releaseCache.get(key);
		if (cached !== void 0 && cached.expiresAt > Date.now()) return await cached.value;
		const value = this.githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/releases?per_page=20`).then((releases) => githubReleaseArchives(packageName, releases)).catch((error) => {
			if (error instanceof UserFacingError && error.code === "github-tls-certificate") throw error;
			return [];
		});
		this.releaseCache.set(key, {
			value,
			expiresAt: Date.now() + 5 * 6e4
		});
		return await value;
	}
	async latestCommit(owner, repository) {
		const key = `${owner}/${repository}`.toLocaleLowerCase();
		const cached = this.commitCache.get(key);
		if (cached !== void 0 && cached.expiresAt > Date.now()) return await cached.value;
		const value = this.githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits?per_page=1`).then((commits) => typeof commits[0]?.sha === "string" && /^[0-9a-f]{7,64}$/i.test(commits[0].sha) ? commits[0].sha : null).catch((error) => {
			if (error instanceof UserFacingError && error.code === "github-tls-certificate") throw error;
			return null;
		});
		this.commitCache.set(key, {
			value,
			expiresAt: Date.now() + 5 * 6e4
		});
		return await value;
	}
	async sourceEntryExists(owner, repository, ref, entry) {
		const path = entry.replace(/^\.\//, "");
		try {
			return (await this.githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`)).type === "file";
		} catch (error) {
			if (error instanceof UserFacingError && error.status === 404) return false;
			throw error;
		}
	}
	async resolveInstallSpec(candidate) {
		return candidate.release === null ? candidate.installSpec ?? "" : await this.downloadReleaseArchive(candidate);
	}
	async downloadReleaseArchive(candidate) {
		const release = candidate.release;
		if (release === null || candidate.packageName === null) throw new UserFacingError("release-unavailable", "该插件没有可用的 GitHub Release 安装包。", 409);
		if (release.size !== null && release.size > MAX_RELEASE_ARCHIVE_BYTES) throw new UserFacingError("release-too-large", "插件安装包超过允许大小，已取消下载。", 413);
		let response;
		try {
			response = await fetch(release.downloadUrl, {
				headers: { "User-Agent": "dsh-plugin-installer" },
				signal: AbortSignal.timeout(6e4)
			});
		} catch (error) {
			this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
			throw githubConnectionError(error);
		}
		if (!response.ok) throw new UserFacingError("release-unavailable", `GitHub Release 安装包下载失败（${response.status}）。`, 502);
		const length = Number(response.headers.get("content-length"));
		if (Number.isFinite(length) && length > MAX_RELEASE_ARCHIVE_BYTES) throw new UserFacingError("release-too-large", "插件安装包超过允许大小，已取消下载。", 413);
		const archive = Buffer.from(await response.arrayBuffer());
		if (archive.length === 0 || archive.length > MAX_RELEASE_ARCHIVE_BYTES) throw new UserFacingError("release-invalid", "GitHub Release 安装包大小无效。", 502);
		if (release.sha256 !== null) {
			if (createHash("sha256").update(archive).digest("hex") !== release.sha256) throw new UserFacingError("release-integrity", "GitHub Release 安装包校验失败，已取消安装。", 502);
		}
		const directory = join(this.resolveDshHome(), "plugin-archives", candidate.packageName.replace(/^@/, "").replace("/", "-"));
		mkdirSync(directory, { recursive: true });
		const path = join(directory, release.name);
		writeFileSync(path, archive);
		return path;
	}
	packageEntryExists(profile, plugin) {
		const manifest = this.readInstalledPackage(profile, plugin.packageName);
		if (manifest === null || typeof manifest.main !== "string" || manifest.main.length === 0) return true;
		return existsSync(join(this.profilesRoot, profile, "node_modules", ...plugin.packageName.split("/"), manifest.main));
	}
	readInstalledPackage(profile, packageName) {
		if (!isPackageName(packageName)) return null;
		try {
			const manifestPath = join(this.profilesRoot, profile, "node_modules", ...packageName.split("/"), "package.json");
			return JSON.parse(readFileSync(manifestPath, "utf8"));
		} catch {
			return null;
		}
	}
	json(response, status, body) {
		response.writeHead(status, {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store"
		});
		response.end(JSON.stringify(body));
	}
};
function parseCatalogSort(value) {
	return value === "stars" ? "stars" : "updated";
}
function parseCatalogDirection(value) {
	return value === "asc" ? "asc" : "desc";
}
function parseCatalogPage(value) {
	if (value === null || !/^\d+$/.test(value)) return 1;
	const page = Number(value);
	return Number.isSafeInteger(page) && page >= 1 && page <= CATALOG_MAX_PAGE ? page : 1;
}
function toRepository(value) {
	return {
		id: value.id,
		fullName: value.full_name,
		name: value.name,
		owner: value.owner.login,
		description: value.description,
		url: value.html_url,
		defaultBranch: value.default_branch,
		stars: value.stargazers_count,
		updatedAt: value.updated_at,
		pushedAt: value.pushed_at,
		topics: value.topics ?? [],
		language: value.language
	};
}
/** Recover the GitHub repository identity written by `dsh plugin add github:owner/repo#sha`. */
function githubRepositoryFromSpecifier(specifier) {
	const match = /^github:([^/]+)\/([^#]+?)(?:\.git)?(?:#.*)?$/i.exec(specifier);
	if (match === null) return null;
	const [, owner, repository] = match;
	if (!isRepositorySegment(owner) || !isRepositorySegment(repository)) return null;
	return `${owner}/${repository}`.toLocaleLowerCase();
}
function githubCommitFromSpecifier(specifier) {
	return /^github:[^/]+\/[^#]+#([0-9a-f]{7,64})$/i.exec(specifier)?.[1] ?? null;
}
function sameCommit(left, right) {
	return left.toLocaleLowerCase() === right.toLocaleLowerCase() || left.length < right.length && right.toLocaleLowerCase().startsWith(left.toLocaleLowerCase());
}
function isPackageName(value) {
	return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(value);
}
function githubRepositoryFromMetadata(value) {
	const url = typeof value === "string" ? value : value !== null && typeof value === "object" && typeof value.url === "string" ? value.url : null;
	if (url === null) return null;
	const match = /(?:github\.com[/:]|^github:)([^/\s]+)\/([^/#\s]+?)(?:\.git)?(?:#.*)?$/i.exec(url);
	if (match === null) return null;
	const [, owner, repository] = match;
	if (!isRepositorySegment(owner) || !isRepositorySegment(repository)) return null;
	return `${owner}/${repository}`.toLocaleLowerCase();
}
function isBundleManifest(value) {
	const patch = value?.dsh?.bundle?.patch;
	return typeof patch === "string" && patch.length > 0;
}
function object(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new UserFacingError("invalid-request", "请求格式不正确。");
	return value;
}
async function readJson(request) {
	let data = "";
	for await (const chunk of request) {
		data += String(chunk);
		if (data.length > 64 * 1024) throw new UserFacingError("request-too-large", "请求内容过大。", 413);
	}
	try {
		return JSON.parse(data);
	} catch {
		throw new UserFacingError("invalid-json", "请求不是有效 JSON。");
	}
}

//#endregion
export { apply, inject, name };