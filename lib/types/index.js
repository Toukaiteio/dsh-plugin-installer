import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseDocument } from 'yaml';
import { UserFacingError, githubInstallSpec, githubReleaseArchives, isProfileName, isReleaseTag, isRepositorySegment, normalizeCatalogQuery, parseDshBundleManifest, } from './marketplace.js';
export const name = 'dsh-plugin-installer';
export const inject = ['webServer'];
const ROUTE_PREFIX = '/dsh-plugin-installer';
const API_PREFIX = `${ROUTE_PREFIX}/api`;
/** How long the marketplace catalog stays cached before re-querying GitHub. */
const CATALOG_CACHE_TTL_MS = 12 * 60_000;
/** Bound the number of distinct searches retained by one Web Profile process. */
const CATALOG_CACHE_MAX_ENTRIES = 24;
/** Refuse unexpectedly large release packages before writing them to DSH_HOME. */
const MAX_RELEASE_ARCHIVE_BYTES = 32 * 1024 * 1024;
const SELF_MANIFEST = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
/** Web host half: GitHub discovery, explicit permission gates and profile launch. */
export function apply(ctx) {
    const runtime = new MarketplaceRuntime(ctx);
    ctx.effect(() => ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: async (request, response) => { await runtime.handle(request, response); },
    }), 'dsh-plugin-installer: web API');
}
class MarketplaceRuntime {
    ctx;
    profilesRoot;
    currentProfile;
    searchCache = new Map();
    releaseCache = new Map();
    commitCache = new Map();
    constructor(ctx) {
        this.ctx = ctx;
        this.profilesRoot = join(this.resolveDshHome(), 'profiles');
        this.currentProfile = this.resolveCurrentProfile();
    }
    async handle(request, response) {
        try {
            const url = new URL(request.url ?? '/', 'http://127.0.0.1');
            if (!url.pathname.startsWith(API_PREFIX))
                throw new UserFacingError('not-found', '未找到请求的接口。', 404);
            const tail = url.pathname.slice(API_PREFIX.length) || '/';
            if (request.method === 'GET' && tail === '/state')
                return this.json(response, 200, await this.state());
            if (request.method === 'GET' && tail === '/plugins') {
                return this.json(response, 200, {
                    plugins: await this.search(url.searchParams.get('query') ?? '', url.searchParams.get('refresh') === '1'),
                });
            }
            const match = /^\/plugin\/([^/]+)\/([^/]+)$/.exec(tail);
            if (request.method === 'GET' && match !== null) {
                const [, owner, repository] = match;
                if (owner === undefined || repository === undefined)
                    throw new UserFacingError('invalid-repository', 'GitHub 仓库地址不合法。');
                return this.json(response, 200, { plugin: await this.inspect(owner, repository) });
            }
            const body = request.method === 'POST' ? await readJson(request) : undefined;
            if (request.method === 'POST' && tail === '/install')
                return this.json(response, 200, await this.install(body));
            if (request.method === 'POST' && tail === '/update')
                return this.json(response, 200, await this.update(body));
            if (request.method === 'POST' && tail === '/remove')
                return this.json(response, 200, await this.remove(body));
            if (request.method === 'POST' && tail === '/switch')
                return this.json(response, 200, await this.switchProfile(body));
            if (request.method === 'POST' && tail === '/restart')
                return this.json(response, 200, await this.restartCurrentProfile(body));
            if (request.method === 'POST' && tail === '/profiles')
                return this.json(response, 201, await this.createProfile(body));
            throw new UserFacingError('not-found', '未找到请求的接口。', 404);
        }
        catch (error) {
            const known = error instanceof UserFacingError ? error : new UserFacingError('internal', '操作未完成，请稍后重试。', 500);
            if (!(error instanceof UserFacingError))
                this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
            this.json(response, known.status, { error: { code: known.code, message: known.message } });
        }
    }
    async state() {
        return { currentProfile: this.currentProfile, profiles: await this.listProfiles() };
    }
    async listProfiles() {
        if (!existsSync(this.profilesRoot))
            return [];
        const profiles = readdirSync(this.profilesRoot, { withFileTypes: true })
            .filter(entry => entry.isDirectory() && isProfileName(entry.name))
            .flatMap((entry) => {
            const manifest = this.readProfile(entry.name);
            if (manifest === null)
                return [];
            const bundles = Array.isArray(manifest.dsh?.profile?.bundles)
                ? manifest.dsh.profile.bundles.filter((item) => typeof item === 'string')
                : [];
            const installedRepositories = Object.values(manifest.dependencies ?? {})
                .map(githubRepositoryFromSpecifier)
                .filter((repository) => repository !== null);
            for (const packageName of Object.keys(manifest.dependencies ?? {})) {
                const repository = this.repositoryFromInstalledPackage(entry.name, packageName);
                if (repository !== null)
                    installedRepositories.push(repository);
            }
            return [{
                    name: entry.name,
                    bundles,
                    installedRepositories: [...new Set(installedRepositories)],
                    installedPlugins: this.installedPlugins(entry.name, manifest, bundles),
                    webCapable: bundles.includes('@deepseek-ai/dsh-web-app'),
                }];
        });
        return await Promise.all(profiles.map(async (profile) => ({
            ...profile,
            installedPlugins: await Promise.all(profile.installedPlugins.map(plugin => this.checkForUpdate(profile.name, plugin))),
        }))).then(value => value.sort((a, b) => a.name.localeCompare(b.name)));
    }
    async search(query, bypassCache = false) {
        const normalized = normalizeCatalogQuery(query);
        const cached = this.searchCache.get(normalized);
        if (!bypassCache && cached !== undefined && cached.expiresAt > Date.now())
            return cached.value;
        const words = normalized.length === 0 ? '' : ` ${normalized.replace(/\s+/g, ' ')}`;
        const responses = await Promise.all([
            this.githubJson(`/search/repositories?q=${encodeURIComponent(`topic:dsh-plugin archived:false${words}`)}&sort=updated&order=desc&per_page=30`),
            this.githubJson(`/search/repositories?q=${encodeURIComponent(`topic:dsh archived:false${words}`)}&sort=updated&order=desc&per_page=30`),
        ]);
        const combined = new Map();
        for (const item of responses.flatMap(response => response.items))
            combined.set(item.id, toRepository(item));
        const value = [...combined.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 40);
        this.cacheSearch(normalized, value);
        return value;
    }
    cacheSearch(query, value) {
        const now = Date.now();
        for (const [key, entry] of this.searchCache) {
            if (entry.expiresAt <= now)
                this.searchCache.delete(key);
        }
        if (!this.searchCache.has(query) && this.searchCache.size >= CATALOG_CACHE_MAX_ENTRIES) {
            const oldest = this.searchCache.keys().next().value;
            if (oldest !== undefined)
                this.searchCache.delete(oldest);
        }
        this.searchCache.set(query, { value, expiresAt: now + CATALOG_CACHE_TTL_MS });
    }
    async inspect(owner, repository, releaseTag) {
        if (!isRepositorySegment(owner) || !isRepositorySegment(repository)) {
            throw new UserFacingError('invalid-repository', 'GitHub 仓库地址不合法。');
        }
        const repo = toRepository(await this.githubJson(`/repos/${owner}/${repository}`));
        let parsed = null;
        try {
            const file = await this.githubJson(`/repos/${owner}/${repository}/contents/package.json?ref=${encodeURIComponent(repo.defaultBranch)}`);
            if (file.encoding !== 'base64')
                throw new Error('Unexpected package.json encoding');
            parsed = parseDshBundleManifest(JSON.parse(Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8')));
        }
        catch (error) {
            if (error instanceof UserFacingError && error.status !== 404)
                throw error;
        }
        if (parsed === null) {
            return { repository: repo, packageName: null, version: null, description: null, installSpec: null, release: null, releases: [], installSource: null, validBundle: false, reason: '仓库根目录没有声明 dsh.bundle.patch，不能作为 DSH bundle 安装。', requiresBuildApproval: false };
        }
        const releases = await this.releaseArchives(owner, repository, parsed.name);
        const release = releaseTag === undefined
            ? releases.find(item => item.version === parsed.version && !item.prerelease) ?? releases.find(item => !item.prerelease) ?? releases[0] ?? null
            : releases.find(item => item.tag === releaseTag) ?? null;
        if (release !== null) {
            return {
                repository: repo,
                packageName: parsed.name,
                version: release.version ?? parsed.version,
                description: parsed.description ?? repo.description,
                installSpec: release.downloadUrl,
                release,
                releases,
                installSource: 'release',
                validBundle: true,
                reason: null,
                // A release archive is already built. `prepare` only affects Git installs.
                requiresBuildApproval: false,
            };
        }
        if (releaseTag !== undefined) {
            return { repository: repo, packageName: parsed.name, version: parsed.version, description: parsed.description ?? repo.description, installSpec: null, release: null, releases, installSource: null, validBundle: false, reason: '所选 GitHub Release 版本不可用或缺少匹配的安装包。', requiresBuildApproval: false };
        }
        const commit = await this.latestCommit(owner, repository);
        if (commit === null)
            throw new UserFacingError('github-error', '无法解析该仓库的当前提交。', 502);
        const sourceReady = parsed.entry !== null && await this.sourceEntryExists(owner, repository, commit, parsed.entry);
        if (!sourceReady) {
            const reason = parsed.entry === null
                ? '该仓库没有可安装的 GitHub Release，且 package.json 未声明可验证的 JavaScript 入口文件，无法安全安装。'
                : `该仓库没有可安装的 GitHub Release，且源码提交中缺少入口文件 ${parsed.entry}，无法安全安装。`;
            return { repository: repo, packageName: parsed.name, version: parsed.version, description: parsed.description ?? repo.description, installSpec: null, release: null, releases, installSource: null, validBundle: false, reason, requiresBuildApproval: false };
        }
        return {
            repository: repo,
            packageName: parsed.name,
            version: parsed.version,
            description: parsed.description ?? repo.description,
            installSpec: githubInstallSpec(owner, repository, commit),
            release: null,
            releases,
            installSource: 'source',
            validBundle: true,
            reason: null,
            requiresBuildApproval: parsed.prepareScript !== null,
        };
    }
    async install(body) {
        const input = object(body);
        const profile = input.profile;
        const owner = input.owner;
        const repository = input.repository;
        const releaseTag = input.releaseTag;
        if (!isProfileName(profile) || !this.profileExists(profile))
            throw new UserFacingError('unknown-profile', '请选择一个已有 Profile。');
        if (!isRepositorySegment(owner) || !isRepositorySegment(repository))
            throw new UserFacingError('invalid-repository', 'GitHub 仓库地址不合法。');
        if (releaseTag !== undefined && (typeof releaseTag !== 'string' || !isReleaseTag(releaseTag)))
            throw new UserFacingError('invalid-release', '所选 GitHub Release 版本不合法。');
        const candidate = await this.inspect(owner, repository, releaseTag);
        if (!candidate.validBundle || candidate.installSpec === null)
            throw new UserFacingError('not-a-bundle', candidate.reason ?? '该仓库不是 DSH bundle。');
        if (candidate.requiresBuildApproval && input.allowBuild !== true) {
            throw new UserFacingError('build-approval-required', '该插件含 prepare 安装脚本；勾选执行授权后才能继续。', 409);
        }
        if (candidate.requiresBuildApproval && candidate.packageName !== null)
            this.allowBuild(profile, candidate.packageName);
        const result = await this.runDsh(['plugin', '--profile', profile, 'add', await this.resolveInstallSpec(candidate)]);
        return { installed: candidate, output: result.output, restartAvailable: profile === this.currentProfile && this.profileSupportsWeb(profile) };
    }
    async update(body) {
        const input = object(body);
        const profile = input.profile;
        const packageName = input.packageName;
        const owner = input.owner;
        const repository = input.repository;
        if (!isProfileName(profile) || !this.profileExists(profile))
            throw new UserFacingError('unknown-profile', '请选择一个已有 Profile。');
        if (typeof packageName !== 'string' || !isPackageName(packageName))
            throw new UserFacingError('invalid-plugin', '插件名称不合法。');
        if (typeof owner !== 'string' || typeof repository !== 'string' || !isRepositorySegment(owner) || !isRepositorySegment(repository))
            throw new UserFacingError('invalid-repository', 'GitHub 仓库地址不合法。');
        const installed = this.findInstalledPlugin(profile, packageName);
        if (installed === null || installed.repository !== `${owner}/${repository}`.toLocaleLowerCase()) {
            throw new UserFacingError('unknown-plugin', '该插件不属于所选 Profile。', 404);
        }
        const candidate = await this.inspect(owner, repository);
        if (!candidate.validBundle || candidate.installSpec === null || candidate.packageName !== packageName) {
            throw new UserFacingError('not-a-bundle', '仓库当前版本不再是同名的 DSH bundle，无法更新。');
        }
        const result = await this.runDsh(['plugin', '--profile', profile, 'add', await this.resolveInstallSpec(candidate)]);
        return { updated: candidate, output: result.output, restartAvailable: profile === this.currentProfile && this.profileSupportsWeb(profile) };
    }
    async remove(body) {
        const input = object(body);
        const profile = input.profile;
        const packageName = input.packageName;
        if (!isProfileName(profile) || !this.profileExists(profile))
            throw new UserFacingError('unknown-profile', '请选择一个已有 Profile。');
        if (typeof packageName !== 'string' || !isPackageName(packageName) || this.findInstalledPlugin(profile, packageName) === null) {
            throw new UserFacingError('unknown-plugin', '该插件不属于所选 Profile。', 404);
        }
        const result = await this.runDsh(['plugin', '--profile', profile, 'remove', packageName]);
        return { removed: packageName, output: result.output, restartAvailable: profile === this.currentProfile && this.profileSupportsWeb(profile) };
    }
    async switchProfile(body) {
        const profile = object(body).profile;
        if (!isProfileName(profile) || !this.profileExists(profile))
            throw new UserFacingError('unknown-profile', '请选择一个已有 Profile。');
        if (!this.profileSupportsWeb(profile))
            throw new UserFacingError('not-web-profile', '此 Profile 未安装 Web UI，不能在浏览器中打开。', 409);
        return { url: await this.launchWeb(profile) };
    }
    /** Start a replacement Web process first, then dispose the current DSH process. */
    async restartCurrentProfile(body) {
        const profile = object(body).profile;
        if (profile !== this.currentProfile || !this.profileSupportsWeb(this.currentProfile)) {
            throw new UserFacingError('restart-unavailable', '只能重启当前正在运行的 Web Profile。', 409);
        }
        const url = await this.launchWeb(this.currentProfile);
        // The response carries the successor URL first. Delaying disposal gives the
        // browser a chance to receive it before the old WebServer closes.
        setTimeout(() => {
            void this.ctx.fiber.dispose().catch(error => {
                this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
            });
        }, 750);
        return { url };
    }
    async createProfile(body) {
        const profile = object(body).name;
        if (!isProfileName(profile))
            throw new UserFacingError('invalid-profile', 'Profile 名称只能使用字母、数字、连字符和下划线。');
        if (this.profileExists(profile))
            throw new UserFacingError('profile-exists', '该 Profile 已存在。', 409);
        const source = this.readProfile(this.currentProfile)?.dependencies?.[SELF_MANIFEST.name];
        if (typeof source !== 'string' || source.length === 0) {
            throw new UserFacingError('missing-self-source', '当前 Profile 未记录本插件的安装来源，无法复制到新 Profile。');
        }
        await this.runDsh(['plugin', '--profile', profile, 'add', '@deepseek-ai/dsh-web-app']);
        await this.runDsh(['plugin', '--profile', profile, 'add', source]);
        return { url: await this.launchWeb(profile) };
    }
    allowBuild(profile, packageName) {
        const path = join(this.profilesRoot, profile, 'pnpm-workspace.yaml');
        const document = parseDocument(existsSync(path) ? readFileSync(path, 'utf8') : '');
        if (document.errors.length > 0)
            throw new UserFacingError('invalid-pnpm-config', '该 Profile 的 pnpm-workspace.yaml 无法解析。');
        let allowed = document.get('allowBuilds', true);
        if (allowed === undefined || allowed === null) {
            document.set('allowBuilds', {});
            allowed = document.get('allowBuilds', true);
        }
        if (allowed === null || typeof allowed !== 'object' || !('set' in allowed)) {
            throw new UserFacingError('invalid-pnpm-config', '该 Profile 的 allowBuilds 配置格式不正确。');
        }
        ;
        allowed.set(packageName, true);
        writeFileSync(path, String(document));
    }
    async launchWeb(profile) {
        const child = spawn(process.execPath, [this.cliPath(), '--profile', profile, '--port', '0'], {
            detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: process.env,
        });
        return await new Promise((resolvePromise, reject) => {
            let output = '';
            const done = (callback) => { clearTimeout(timeout); child.stdout?.destroy(); child.stderr?.destroy(); callback(); };
            const receive = (chunk) => {
                output = `${output}${chunk.toString()}`.slice(-16_384);
                const found = /dsh web:\s*(http:\/\/127\.0\.0\.1:\d+)/i.exec(output);
                const address = found?.[1];
                if (address !== undefined)
                    done(() => { child.unref(); resolvePromise(address); });
            };
            child.stdout?.on('data', receive);
            child.stderr?.on('data', receive);
            child.once('error', error => done(() => reject(new UserFacingError('launch-failed', error.message, 500))));
            child.once('exit', () => done(() => reject(new UserFacingError('launch-failed', `Profile 未能启动：${output || '没有输出'}`, 500))));
            const timeout = setTimeout(() => done(() => reject(new UserFacingError('launch-timeout', `等待 Profile 启动超时：${output || '没有输出'}`, 504))), 30_000);
        });
    }
    runDsh(args) {
        return new Promise((resolvePromise, reject) => {
            const child = spawn(process.execPath, [this.cliPath(), ...args], { windowsHide: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
            let output = '';
            const append = (chunk) => { output = `${output}${chunk.toString()}`.slice(-48_000); };
            child.stdout.on('data', append);
            child.stderr.on('data', append);
            child.once('error', error => reject(new UserFacingError('command-failed', error.message, 500)));
            child.once('exit', code => code === 0
                ? resolvePromise({ output })
                : reject(new UserFacingError('command-failed', `DSH 插件操作失败：${output || `退出码 ${code ?? 'unknown'}`}`, 500)));
        });
    }
    cliPath() {
        if (process.argv[1] !== undefined && existsSync(process.argv[1]))
            return process.argv[1];
        const require = createRequire(import.meta.url);
        return join(dirname(require.resolve('@deepseek-ai/dsh/package.json')), 'lib', 'bin.js');
    }
    async githubJson(path) {
        const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-plugin-installer' };
        if (process.env.GITHUB_TOKEN?.trim())
            headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        let response;
        try {
            response = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(15_000) });
        }
        catch {
            throw new UserFacingError('github-unavailable', '无法连接 GitHub，请检查网络后重试。', 502);
        }
        if (!response.ok) {
            if (response.status === 404) {
                throw new UserFacingError('github-not-found', 'GitHub 未找到该仓库或文件。', 404);
            }
            const message = response.status === 403 || response.status === 429 ? 'GitHub 请求频率受限，请稍后重试或配置 GITHUB_TOKEN。' : `GitHub 返回了 ${response.status}。`;
            throw new UserFacingError('github-error', message, 502);
        }
        return await response.json();
    }
    resolveCurrentProfile() {
        if (this.ctx.baseUrl === undefined)
            throw new Error('dsh-plugin-installer requires a DSH profile baseUrl');
        const base = fileURLToPath(this.ctx.baseUrl);
        const path = relative(this.profilesRoot, resolve(base));
        if (!isProfileName(path))
            throw new Error('dsh-plugin-installer must run from a DSH profile directory');
        return path;
    }
    resolveDshHome() {
        const configured = process.env.DSH_HOME;
        if (configured !== undefined && configured.trim().length > 0)
            return resolve(configured);
        if (this.ctx.baseUrl === undefined)
            throw new Error('dsh-plugin-installer requires a DSH profile baseUrl');
        const profileDirectory = resolve(fileURLToPath(this.ctx.baseUrl));
        const profilesDirectory = dirname(profileDirectory);
        if (basename(profilesDirectory) !== 'profiles') {
            throw new Error('dsh-plugin-installer could not resolve DSH_HOME from the active profile');
        }
        return dirname(profilesDirectory);
    }
    profileExists(profile) { return this.readProfile(profile) !== null; }
    profileSupportsWeb(profile) {
        const bundles = this.readProfile(profile)?.dsh?.profile?.bundles;
        return Array.isArray(bundles) && bundles.includes('@deepseek-ai/dsh-web-app');
    }
    readProfile(profile) {
        try {
            return JSON.parse(readFileSync(join(this.profilesRoot, profile, 'package.json'), 'utf8'));
        }
        catch {
            return null;
        }
    }
    repositoryFromInstalledPackage(profile, packageName) {
        const manifest = this.readInstalledPackage(profile, packageName);
        return manifest === null ? null : githubRepositoryFromMetadata(manifest.repository);
    }
    installedPlugins(profile, manifest, bundles) {
        return Object.entries(manifest.dependencies ?? {}).flatMap(([packageName, specifier]) => {
            if (!isPackageName(packageName) || packageName.startsWith('@deepseek-ai/') || packageName === SELF_MANIFEST.name)
                return [];
            const installed = this.readInstalledPackage(profile, packageName);
            const repository = githubRepositoryFromSpecifier(specifier) ?? githubRepositoryFromMetadata(installed?.repository);
            if (repository === null || (!bundles.includes(packageName) && !isBundleManifest(installed)))
                return [];
            const [owner, repositoryName] = repository.split('/');
            if (owner === undefined || repositoryName === undefined)
                return [];
            const plugin = {
                packageName,
                repository,
                owner,
                repositoryName,
                installedVersion: typeof installed?.version === 'string' ? installed.version : null,
                installedCommit: githubCommitFromSpecifier(specifier),
                updateStatus: 'unknown',
            };
            return [plugin];
        }).sort((a, b) => a.repository.localeCompare(b.repository));
    }
    findInstalledPlugin(profile, packageName) {
        const manifest = this.readProfile(profile);
        if (manifest === null)
            return null;
        const bundles = Array.isArray(manifest.dsh?.profile?.bundles)
            ? manifest.dsh.profile.bundles.filter((item) => typeof item === 'string')
            : [];
        return this.installedPlugins(profile, manifest, bundles).find(plugin => plugin.packageName === packageName) ?? null;
    }
    async checkForUpdate(profile, plugin) {
        if (!this.packageEntryExists(profile, plugin))
            return { ...plugin, updateStatus: 'available' };
        const releases = await this.releaseArchives(plugin.owner, plugin.repositoryName, plugin.packageName);
        const latestRelease = releases.find(item => !item.prerelease) ?? releases[0];
        if (latestRelease !== undefined && plugin.installedVersion !== null && latestRelease.version !== null) {
            return { ...plugin, updateStatus: plugin.installedVersion === latestRelease.version ? 'up-to-date' : 'available' };
        }
        if (plugin.installedCommit === null)
            return plugin;
        const latestCommit = await this.latestCommit(plugin.owner, plugin.repositoryName);
        if (latestCommit === null)
            return plugin;
        return { ...plugin, updateStatus: sameCommit(plugin.installedCommit, latestCommit) ? 'up-to-date' : 'available' };
    }
    async releaseArchives(owner, repository, packageName) {
        const key = `${owner}/${repository}/${packageName}`.toLocaleLowerCase();
        const cached = this.releaseCache.get(key);
        if (cached !== undefined && cached.expiresAt > Date.now())
            return await cached.value;
        const value = this.githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/releases?per_page=20`)
            .then(releases => githubReleaseArchives(packageName, releases))
            .catch(() => []);
        this.releaseCache.set(key, { value, expiresAt: Date.now() + 5 * 60_000 });
        return await value;
    }
    async latestCommit(owner, repository) {
        const key = `${owner}/${repository}`.toLocaleLowerCase();
        const cached = this.commitCache.get(key);
        if (cached !== undefined && cached.expiresAt > Date.now())
            return await cached.value;
        const value = this.githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits?per_page=1`)
            .then(commits => typeof commits[0]?.sha === 'string' && /^[0-9a-f]{7,64}$/i.test(commits[0].sha) ? commits[0].sha : null)
            .catch(() => null);
        this.commitCache.set(key, { value, expiresAt: Date.now() + 5 * 60_000 });
        return await value;
    }
    async sourceEntryExists(owner, repository, ref, entry) {
        const path = entry.replace(/^\.\//, '');
        try {
            const file = await this.githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
            return file.type === 'file';
        }
        catch (error) {
            if (error instanceof UserFacingError && error.status === 404)
                return false;
            throw error;
        }
    }
    async resolveInstallSpec(candidate) {
        return candidate.release === null ? candidate.installSpec ?? '' : await this.downloadReleaseArchive(candidate);
    }
    async downloadReleaseArchive(candidate) {
        const release = candidate.release;
        if (release === null || candidate.packageName === null)
            throw new UserFacingError('release-unavailable', '该插件没有可用的 GitHub Release 安装包。', 409);
        if (release.size !== null && release.size > MAX_RELEASE_ARCHIVE_BYTES) {
            throw new UserFacingError('release-too-large', '插件安装包超过允许大小，已取消下载。', 413);
        }
        let response;
        try {
            response = await fetch(release.downloadUrl, { headers: { 'User-Agent': 'dsh-plugin-installer' }, signal: AbortSignal.timeout(60_000) });
        }
        catch {
            throw new UserFacingError('release-unavailable', '无法下载 GitHub Release 安装包，请检查网络后重试。', 502);
        }
        if (!response.ok)
            throw new UserFacingError('release-unavailable', `GitHub Release 安装包下载失败（${response.status}）。`, 502);
        const length = Number(response.headers.get('content-length'));
        if (Number.isFinite(length) && length > MAX_RELEASE_ARCHIVE_BYTES) {
            throw new UserFacingError('release-too-large', '插件安装包超过允许大小，已取消下载。', 413);
        }
        const archive = Buffer.from(await response.arrayBuffer());
        if (archive.length === 0 || archive.length > MAX_RELEASE_ARCHIVE_BYTES) {
            throw new UserFacingError('release-invalid', 'GitHub Release 安装包大小无效。', 502);
        }
        if (release.sha256 !== null) {
            const actual = createHash('sha256').update(archive).digest('hex');
            if (actual !== release.sha256)
                throw new UserFacingError('release-integrity', 'GitHub Release 安装包校验失败，已取消安装。', 502);
        }
        const directory = join(this.resolveDshHome(), 'plugin-archives', candidate.packageName.replace(/^@/, '').replace('/', '-'));
        mkdirSync(directory, { recursive: true });
        const path = join(directory, release.name);
        writeFileSync(path, archive);
        return path;
    }
    packageEntryExists(profile, plugin) {
        const manifest = this.readInstalledPackage(profile, plugin.packageName);
        if (manifest === null || typeof manifest.main !== 'string' || manifest.main.length === 0)
            return true;
        return existsSync(join(this.profilesRoot, profile, 'node_modules', ...plugin.packageName.split('/'), manifest.main));
    }
    readInstalledPackage(profile, packageName) {
        if (!isPackageName(packageName))
            return null;
        try {
            const manifestPath = join(this.profilesRoot, profile, 'node_modules', ...packageName.split('/'), 'package.json');
            return JSON.parse(readFileSync(manifestPath, 'utf8'));
        }
        catch {
            return null;
        }
    }
    json(response, status, body) {
        response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify(body));
    }
}
function toRepository(value) {
    return { id: value.id, fullName: value.full_name, name: value.name, owner: value.owner.login, description: value.description, url: value.html_url, defaultBranch: value.default_branch, stars: value.stargazers_count, updatedAt: value.updated_at, pushedAt: value.pushed_at, topics: value.topics ?? [], language: value.language };
}
/** Recover the GitHub repository identity written by `dsh plugin add github:owner/repo#sha`. */
function githubRepositoryFromSpecifier(specifier) {
    const match = /^github:([^/]+)\/([^#]+?)(?:\.git)?(?:#.*)?$/i.exec(specifier);
    if (match === null)
        return null;
    const [, owner, repository] = match;
    if (!isRepositorySegment(owner) || !isRepositorySegment(repository))
        return null;
    return `${owner}/${repository}`.toLocaleLowerCase();
}
function githubCommitFromSpecifier(specifier) {
    const match = /^github:[^/]+\/[^#]+#([0-9a-f]{7,64})$/i.exec(specifier);
    return match?.[1] ?? null;
}
function sameCommit(left, right) {
    return left.toLocaleLowerCase() === right.toLocaleLowerCase()
        || left.length < right.length && right.toLocaleLowerCase().startsWith(left.toLocaleLowerCase());
}
function isPackageName(value) {
    return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(value);
}
function githubRepositoryFromMetadata(value) {
    const url = typeof value === 'string'
        ? value
        : value !== null && typeof value === 'object' && typeof value.url === 'string'
            ? value.url
            : null;
    if (url === null)
        return null;
    const match = /(?:github\.com[/:]|^github:)([^/\s]+)\/([^/#\s]+?)(?:\.git)?(?:#.*)?$/i.exec(url);
    if (match === null)
        return null;
    const [, owner, repository] = match;
    if (!isRepositorySegment(owner) || !isRepositorySegment(repository))
        return null;
    return `${owner}/${repository}`.toLocaleLowerCase();
}
function isBundleManifest(value) {
    const patch = value?.dsh?.bundle?.patch;
    return typeof patch === 'string' && patch.length > 0;
}
function object(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new UserFacingError('invalid-request', '请求格式不正确。');
    return value;
}
async function readJson(request) {
    let data = '';
    for await (const chunk of request) {
        data += String(chunk);
        if (data.length > 64 * 1024)
            throw new UserFacingError('request-too-large', '请求内容过大。', 413);
    }
    try {
        return JSON.parse(data);
    }
    catch {
        throw new UserFacingError('invalid-json', '请求不是有效 JSON。');
    }
}
