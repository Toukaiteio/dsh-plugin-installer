import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { parseDocument } from 'yaml'
import {
  type GitHubRepository,
  type GitHubReleaseArchive,
  type InstalledPlugin,
  type PluginCandidate,
  type ProfileSummary,
  UserFacingError,
  githubConnectionError,
  githubInstallSpec,
  githubReleaseArchives,
  isMarketplacePluginRepository,
  isProfileName,
  isReleaseTag,
  isRepositorySegment,
  normalizeCatalogQuery,
  parseDshBundleManifest,
  sortCatalog,
  type CatalogSortDirection,
  type CatalogSortKey,
} from './marketplace.js'

export const name = 'dsh-plugin-installer'
export const inject = ['webServer']

const ROUTE_PREFIX = '/dsh-plugin-installer'
const API_PREFIX = `${ROUTE_PREFIX}/api`
/** How long the marketplace catalog stays cached before re-querying GitHub. */
const CATALOG_CACHE_TTL_MS = 12 * 60_000
/** Number of repositories requested from each GitHub topic query per page. */
const CATALOG_PAGE_SIZE = 30
/** GitHub Search API exposes at most 1,000 results for one query. */
const CATALOG_MAX_PAGE = Math.ceil(1_000 / CATALOG_PAGE_SIZE)
/** Bound the number of sort/filter/page combinations retained by one process. */
const CATALOG_CACHE_MAX_ENTRIES = 48
/** Refuse unexpectedly large release packages before writing them to DSH_HOME. */
const MAX_RELEASE_ARCHIVE_BYTES = 32 * 1024 * 1024
const SELF_MANIFEST = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
  name: string
}

interface ProfilePackage {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: unknown } }
}

interface InstalledPackageManifest {
  main?: unknown
  version?: unknown
  repository?: unknown
  dsh?: { bundle?: { patch?: unknown } }
}

interface GitHubRepoResponse {
  id: number
  full_name: string
  name: string
  owner: { login: string }
  description: string | null
  html_url: string
  default_branch: string
  stargazers_count: number
  updated_at: string
  pushed_at: string | null
  topics?: string[]
  language: string | null
}

interface GitHubConfigFile {
  githubToken?: unknown
}

type GitHubTokenSource = 'environment' | 'saved' | 'none'

interface GitHubConfigResponse {
  configured: boolean
  source: GitHubTokenSource
}

interface CatalogSearchResult {
  plugins: GitHubRepository[]
  hasMore: boolean
}

interface CommandResult { readonly output: string }

/** Web host half: GitHub discovery, explicit permission gates and profile launch. */
export function apply(ctx: Context): void {
  const runtime = new MarketplaceRuntime(ctx)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (request, response) => { await runtime.handle(request, response) },
  }), 'dsh-plugin-installer: web API')
}

class MarketplaceRuntime {
  private readonly dshHome: string
  private readonly profilesRoot: string
  private readonly currentProfile: string
  private githubToken: string | null
  private githubTokenSource: GitHubTokenSource
  private readonly searchCache = new Map<string, { expiresAt: number; value: CatalogSearchResult }>()
  private readonly releaseCache = new Map<string, { expiresAt: number; value: Promise<readonly GitHubReleaseArchive[]> }>()
  private readonly commitCache = new Map<string, { expiresAt: number; value: Promise<string | null> }>()

  constructor(private readonly ctx: Context) {
    this.dshHome = this.resolveDshHome()
    this.profilesRoot = join(this.dshHome, 'profiles')
    const savedToken = this.readSavedGithubToken()
    const environmentToken = this.readEnvironmentGithubToken()
    this.githubToken = savedToken ?? environmentToken
    this.githubTokenSource = savedToken !== null ? 'saved' : environmentToken !== null ? 'environment' : 'none'
    this.currentProfile = this.resolveCurrentProfile()
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (!url.pathname.startsWith(API_PREFIX)) throw new UserFacingError('not-found', '未找到请求的接口。', 404)
      const tail = url.pathname.slice(API_PREFIX.length) || '/'
      if (request.method === 'GET' && tail === '/state') return this.json(response, 200, await this.state())
      if (request.method === 'GET' && tail === '/config') return this.json(response, 200, this.githubConfig())
      if (request.method === 'GET' && tail === '/plugins') {
        const sort = parseCatalogSort(url.searchParams.get('sort'))
        const direction = parseCatalogDirection(url.searchParams.get('order'))
        const page = parseCatalogPage(url.searchParams.get('page'))
        const result = await this.search(url.searchParams.get('query') ?? '', sort, direction, page, url.searchParams.get('refresh') === '1')
        return this.json(response, 200, { ...result, page, sort, direction })
      }
      const match = /^\/plugin\/([^/]+)\/([^/]+)$/.exec(tail)
      if (request.method === 'GET' && match !== null) {
        const [, owner, repository] = match
        if (owner === undefined || repository === undefined) throw new UserFacingError('invalid-repository', 'GitHub 仓库地址不合法。')
        return this.json(response, 200, { plugin: await this.inspect(owner, repository) })
      }
      const body = request.method === 'POST' ? await readJson(request) : undefined
      if (request.method === 'POST' && tail === '/config') return this.json(response, 200, this.configureGithubToken(body))
      if (request.method === 'POST' && tail === '/install') return this.json(response, 200, await this.install(body))
      if (request.method === 'POST' && tail === '/update') return this.json(response, 200, await this.update(body))
      if (request.method === 'POST' && tail === '/remove') return this.json(response, 200, await this.remove(body))
      if (request.method === 'POST' && tail === '/switch') return this.json(response, 200, await this.switchProfile(body))
      if (request.method === 'POST' && tail === '/restart') return this.json(response, 200, await this.restartCurrentProfile(body))
      if (request.method === 'POST' && tail === '/profiles') return this.json(response, 201, await this.createProfile(body))
      throw new UserFacingError('not-found', '未找到请求的接口。', 404)
    } catch (error) {
      const known = error instanceof UserFacingError ? error : new UserFacingError('internal', '操作未完成，请稍后重试。', 500)
      if (!(error instanceof UserFacingError)) this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
      this.json(response, known.status, {
        error: {
          code: known.code,
          message: known.message,
          ...(known.hint === undefined ? {} : { hint: known.hint }),
          ...(known.command === undefined ? {} : { command: known.command }),
        },
      })
    }
  }

  private async state(): Promise<{ currentProfile: string; profiles: ProfileSummary[] }> {
    return { currentProfile: this.currentProfile, profiles: await this.listProfiles() }
  }

  private async listProfiles(): Promise<ProfileSummary[]> {
    if (!existsSync(this.profilesRoot)) return []
    const profiles = readdirSync(this.profilesRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && isProfileName(entry.name))
      .flatMap((entry): ProfileSummary[] => {
        const manifest = this.readProfile(entry.name)
        if (manifest === null) return []
        const bundles = Array.isArray(manifest.dsh?.profile?.bundles)
          ? manifest.dsh!.profile!.bundles.filter((item): item is string => typeof item === 'string')
          : []
        const installedRepositories = Object.values(manifest.dependencies ?? {})
          .map(githubRepositoryFromSpecifier)
          .filter((repository): repository is string => repository !== null)
        for (const packageName of Object.keys(manifest.dependencies ?? {})) {
          const repository = this.repositoryFromInstalledPackage(entry.name, packageName)
          if (repository !== null) installedRepositories.push(repository)
        }
        return [{
          name: entry.name,
          bundles,
          installedRepositories: [...new Set(installedRepositories)],
          installedPlugins: this.installedPlugins(entry.name, manifest, bundles),
          webCapable: bundles.includes('@deepseek-ai/dsh-web-app'),
        }]
      })
    return await Promise.all(profiles.map(async profile => ({
      ...profile,
      installedPlugins: await Promise.all(profile.installedPlugins.map(plugin => this.checkForUpdate(profile.name, plugin))),
    }))).then(value => value.sort((a, b) => a.name.localeCompare(b.name)))
  }

  private async search(query: string, sort: CatalogSortKey, direction: CatalogSortDirection, page: number, bypassCache = false): Promise<CatalogSearchResult> {
    const normalized = normalizeCatalogQuery(query)
    if (bypassCache && page === 1) this.clearSearchCache(normalized, sort, direction)
    const cacheKey = JSON.stringify([normalized, sort, direction, page])
    const cached = this.searchCache.get(cacheKey)
    if (!bypassCache && cached !== undefined && cached.expiresAt > Date.now()) return cached.value
    const words = normalized.length === 0 ? '' : ` ${normalized.replace(/\s+/g, ' ')}`
    const queryOptions = `sort=${sort}&order=${direction}&page=${page}&per_page=${CATALOG_PAGE_SIZE}`
    const responses = await Promise.all([
      this.githubJson<{ items: GitHubRepoResponse[] }>(`/search/repositories?q=${encodeURIComponent(`topic:dsh-plugin archived:false${words}`)}&${queryOptions}`),
      this.githubJson<{ items: GitHubRepoResponse[] }>(`/search/repositories?q=${encodeURIComponent(`topic:dsh archived:false${words}`)}&${queryOptions}`),
    ])
    const combined = new Map<number, GitHubRepository>()
    for (const item of responses.flatMap(response => response.items)) {
      const repository = toRepository(item)
      if (isMarketplacePluginRepository(repository.owner, repository.name)) combined.set(repository.id, repository)
    }
    const value = sortCatalog([...combined.values()], sort, direction).slice(0, CATALOG_PAGE_SIZE * 2)
    const result = {
      plugins: value,
      hasMore: page < CATALOG_MAX_PAGE && responses.some(response => response.items.length === CATALOG_PAGE_SIZE),
    }
    this.cacheSearch(cacheKey, result)
    return result
  }

  private githubConfig(): GitHubConfigResponse {
    return {
      configured: this.githubToken !== null,
      source: this.githubTokenSource,
    }
  }

  private configureGithubToken(body: unknown): GitHubConfigResponse {
    const value = object(body).githubToken
    if (typeof value !== 'string') {
      throw new UserFacingError('invalid-github-token', 'GitHub Token 必须是文本。', 400)
    }
    const token = value.trim()
    const configPath = join(this.dshHome, 'config', 'dsh-plugin-installer.json')
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, `${JSON.stringify(token.length === 0 ? {} : { githubToken: token }, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    try {
      chmodSync(configPath, 0o600)
    } catch {
      // Windows does not expose POSIX file modes; the user profile ACL still applies.
    }
    const environmentToken = this.readEnvironmentGithubToken()
    this.githubToken = token.length === 0 ? environmentToken : token
    this.githubTokenSource = token.length === 0
      ? environmentToken === null ? 'none' : 'environment'
      : 'saved'
    this.searchCache.clear()
    this.releaseCache.clear()
    this.commitCache.clear()
    return this.githubConfig()
  }

  private readSavedGithubToken(): string | null {
    const configPath = join(this.dshHome, 'config', 'dsh-plugin-installer.json')
    if (!existsSync(configPath)) return null
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8')) as GitHubConfigFile
      return typeof config.githubToken === 'string' && config.githubToken.trim().length > 0
        ? config.githubToken.trim()
        : null
    } catch {
      return null
    }
  }

  private readEnvironmentGithubToken(): string | null {
    const token = process.env.GITHUB_TOKEN?.trim()
    return token === undefined || token.length === 0 ? null : token
  }

  private cacheSearch(key: string, value: CatalogSearchResult): void {
    const now = Date.now()
    for (const [key, entry] of this.searchCache) {
      if (entry.expiresAt <= now) this.searchCache.delete(key)
    }
    if (!this.searchCache.has(key) && this.searchCache.size >= CATALOG_CACHE_MAX_ENTRIES) {
      const oldest = this.searchCache.keys().next().value
      if (oldest !== undefined) this.searchCache.delete(oldest)
    }
    this.searchCache.set(key, { value, expiresAt: now + CATALOG_CACHE_TTL_MS })
  }

  private clearSearchCache(query: string, sort: CatalogSortKey, direction: CatalogSortDirection): void {
    const prefix = `${JSON.stringify([query, sort, direction]).slice(0, -1)},`
    for (const key of this.searchCache.keys()) {
      if (key.startsWith(prefix)) this.searchCache.delete(key)
    }
  }

  private async inspect(owner: string, repository: string, releaseTag?: string): Promise<PluginCandidate> {
    if (!isRepositorySegment(owner) || !isRepositorySegment(repository)) {
      throw new UserFacingError('invalid-repository', 'GitHub 仓库地址不合法。')
    }
    if (!isMarketplacePluginRepository(owner, repository)) {
      throw new UserFacingError('not-a-plugin', 'DeepSeek Harness 本体不是可安装的市场插件。', 400)
    }
    const repo = toRepository(await this.githubJson<GitHubRepoResponse>(`/repos/${owner}/${repository}`))
    let parsed: ReturnType<typeof parseDshBundleManifest> = null
    try {
      const file = await this.githubJson<{ content: string; encoding: string }>(`/repos/${owner}/${repository}/contents/package.json?ref=${encodeURIComponent(repo.defaultBranch)}`)
      if (file.encoding !== 'base64') throw new Error('Unexpected package.json encoding')
      parsed = parseDshBundleManifest(JSON.parse(Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8')))
    } catch (error) {
      if (error instanceof UserFacingError && error.status !== 404) throw error
    }
    if (parsed === null) {
      return { repository: repo, packageName: null, version: null, description: null, installSpec: null, release: null, releases: [], installSource: null, validBundle: false, reason: '仓库根目录没有声明 dsh.bundle.patch，不能作为 DSH bundle 安装。', requiresBuildApproval: false }
    }
    const releases = await this.releaseArchives(owner, repository, parsed.name)
    const release = releaseTag === undefined
      ? releases.find(item => item.version === parsed.version && !item.prerelease) ?? releases.find(item => !item.prerelease) ?? releases[0] ?? null
      : releases.find(item => item.tag === releaseTag) ?? null
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
      }
    }
    if (releaseTag !== undefined) {
      return { repository: repo, packageName: parsed.name, version: parsed.version, description: parsed.description ?? repo.description, installSpec: null, release: null, releases, installSource: null, validBundle: false, reason: '所选 GitHub Release 版本不可用或缺少匹配的安装包。', requiresBuildApproval: false }
    }
    const commit = await this.latestCommit(owner, repository)
    if (commit === null) throw new UserFacingError('github-error', '无法解析该仓库的当前提交。', 502)
    const sourceReady = parsed.entry !== null && await this.sourceEntryExists(owner, repository, commit, parsed.entry)
    if (!sourceReady) {
      const reason = parsed.entry === null
        ? '该仓库没有可安装的 GitHub Release，且 package.json 未声明可验证的 JavaScript 入口文件，无法安全安装。'
        : `该仓库没有可安装的 GitHub Release，且源码提交中缺少入口文件 ${parsed.entry}，无法安全安装。`
      return { repository: repo, packageName: parsed.name, version: parsed.version, description: parsed.description ?? repo.description, installSpec: null, release: null, releases, installSource: null, validBundle: false, reason, requiresBuildApproval: false }
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
    }
  }

  private async install(body: unknown): Promise<{ installed: PluginCandidate; output: string; restartAvailable: boolean }> {
    const input = object(body)
    const profile = input.profile
    const owner = input.owner
    const repository = input.repository
    const releaseTag = input.releaseTag
    if (!isProfileName(profile) || !this.profileExists(profile)) throw new UserFacingError('unknown-profile', '请选择一个已有 Profile。')
    if (!isRepositorySegment(owner) || !isRepositorySegment(repository)) throw new UserFacingError('invalid-repository', 'GitHub 仓库地址不合法。')
    if (releaseTag !== undefined && (typeof releaseTag !== 'string' || !isReleaseTag(releaseTag))) throw new UserFacingError('invalid-release', '所选 GitHub Release 版本不合法。')
    const candidate = await this.inspect(owner, repository, releaseTag)
    if (!candidate.validBundle || candidate.installSpec === null) throw new UserFacingError('not-a-bundle', candidate.reason ?? '该仓库不是 DSH bundle。')
    if (candidate.requiresBuildApproval && input.allowBuild !== true) {
      throw new UserFacingError('build-approval-required', '该插件含 prepare 安装脚本；勾选执行授权后才能继续。', 409)
    }
    if (candidate.requiresBuildApproval && candidate.packageName !== null) this.allowBuild(profile, candidate.packageName)
    const result = await this.runDsh(['plugin', '--profile', profile, 'add', await this.resolveInstallSpec(candidate)])
    return { installed: candidate, output: result.output, restartAvailable: profile === this.currentProfile && this.profileSupportsWeb(profile) }
  }

  private async update(body: unknown): Promise<{ updated: PluginCandidate; output: string; restartAvailable: boolean }> {
    const input = object(body)
    const profile = input.profile
    const packageName = input.packageName
    const owner = input.owner
    const repository = input.repository
    if (!isProfileName(profile) || !this.profileExists(profile)) throw new UserFacingError('unknown-profile', '请选择一个已有 Profile。')
    if (typeof packageName !== 'string' || !isPackageName(packageName)) throw new UserFacingError('invalid-plugin', '插件名称不合法。')
    if (typeof owner !== 'string' || typeof repository !== 'string' || !isRepositorySegment(owner) || !isRepositorySegment(repository)) throw new UserFacingError('invalid-repository', 'GitHub 仓库地址不合法。')
    const installed = this.findInstalledPlugin(profile, packageName)
    if (installed === null || installed.repository !== `${owner}/${repository}`.toLocaleLowerCase()) {
      throw new UserFacingError('unknown-plugin', '该插件不属于所选 Profile。', 404)
    }
    const candidate = await this.inspect(owner, repository)
    if (!candidate.validBundle || candidate.installSpec === null || candidate.packageName !== packageName) {
      throw new UserFacingError('not-a-bundle', '仓库当前版本不再是同名的 DSH bundle，无法更新。')
    }
    const result = await this.runDsh(['plugin', '--profile', profile, 'add', await this.resolveInstallSpec(candidate)])
    return { updated: candidate, output: result.output, restartAvailable: profile === this.currentProfile && this.profileSupportsWeb(profile) }
  }

  private async remove(body: unknown): Promise<{ removed: string; output: string; restartAvailable: boolean }> {
    const input = object(body)
    const profile = input.profile
    const packageName = input.packageName
    if (!isProfileName(profile) || !this.profileExists(profile)) throw new UserFacingError('unknown-profile', '请选择一个已有 Profile。')
    if (typeof packageName !== 'string' || !isPackageName(packageName) || this.findInstalledPlugin(profile, packageName) === null) {
      throw new UserFacingError('unknown-plugin', '该插件不属于所选 Profile。', 404)
    }
    const result = await this.runDsh(['plugin', '--profile', profile, 'remove', packageName])
    return { removed: packageName, output: result.output, restartAvailable: profile === this.currentProfile && this.profileSupportsWeb(profile) }
  }

  private async switchProfile(body: unknown): Promise<{ url: string }> {
    const profile = object(body).profile
    if (!isProfileName(profile) || !this.profileExists(profile)) throw new UserFacingError('unknown-profile', '请选择一个已有 Profile。')
    if (!this.profileSupportsWeb(profile)) throw new UserFacingError('not-web-profile', '此 Profile 未安装 Web UI，不能在浏览器中打开。', 409)
    return { url: await this.launchWeb(profile) }
  }

  /** Start a replacement Web process first, then dispose the current DSH process. */
  private async restartCurrentProfile(body: unknown): Promise<{ url: string }> {
    const profile = object(body).profile
    if (profile !== this.currentProfile || !this.profileSupportsWeb(this.currentProfile)) {
      throw new UserFacingError('restart-unavailable', '只能重启当前正在运行的 Web Profile。', 409)
    }
    const url = await this.launchWeb(this.currentProfile)
    // The response carries the successor URL first. Delaying disposal gives the
    // browser a chance to receive it before the old WebServer closes.
    setTimeout(() => {
      void this.ctx.fiber.dispose().catch(error => {
        this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
      })
    }, 750)
    return { url }
  }

  private async createProfile(body: unknown): Promise<{ url: string }> {
    const profile = object(body).name
    if (!isProfileName(profile)) throw new UserFacingError('invalid-profile', 'Profile 名称只能使用字母、数字、连字符和下划线。')
    if (this.profileExists(profile)) throw new UserFacingError('profile-exists', '该 Profile 已存在。', 409)
    const source = this.readProfile(this.currentProfile)?.dependencies?.[SELF_MANIFEST.name]
    if (typeof source !== 'string' || source.length === 0) {
      throw new UserFacingError('missing-self-source', '当前 Profile 未记录本插件的安装来源，无法复制到新 Profile。')
    }
    await this.runDsh(['plugin', '--profile', profile, 'add', '@deepseek-ai/dsh-web-app'])
    await this.runDsh(['plugin', '--profile', profile, 'add', source])
    return { url: await this.launchWeb(profile) }
  }

  private allowBuild(profile: string, packageName: string): void {
    const path = join(this.profilesRoot, profile, 'pnpm-workspace.yaml')
    const document = parseDocument(existsSync(path) ? readFileSync(path, 'utf8') : '')
    if (document.errors.length > 0) throw new UserFacingError('invalid-pnpm-config', '该 Profile 的 pnpm-workspace.yaml 无法解析。')
    let allowed = document.get('allowBuilds', true)
    if (allowed === undefined || allowed === null) {
      document.set('allowBuilds', {})
      allowed = document.get('allowBuilds', true)
    }
    if (allowed === null || typeof allowed !== 'object' || !('set' in allowed)) {
      throw new UserFacingError('invalid-pnpm-config', '该 Profile 的 allowBuilds 配置格式不正确。')
    }
    ;(allowed as { set: (key: string, value: boolean) => void }).set(packageName, true)
    writeFileSync(path, String(document))
  }

  private async launchWeb(profile: string): Promise<string> {
    const child = spawn(process.execPath, [this.cliPath(), '--profile', profile, '--port', '0'], {
      detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: process.env,
    })
    return await new Promise<string>((resolvePromise, reject) => {
      let output = ''
      const done = (callback: () => void): void => { clearTimeout(timeout); child.stdout?.destroy(); child.stderr?.destroy(); callback() }
      const receive = (chunk: Buffer): void => {
        output = `${output}${chunk.toString()}`.slice(-16_384)
        const found = /dsh web:\s*(http:\/\/127\.0\.0\.1:\d+)/i.exec(output)
        const address = found?.[1]
        if (address !== undefined) done(() => { child.unref(); resolvePromise(address) })
      }
      child.stdout?.on('data', receive)
      child.stderr?.on('data', receive)
      child.once('error', error => done(() => reject(new UserFacingError('launch-failed', error.message, 500))))
      child.once('exit', () => done(() => reject(new UserFacingError('launch-failed', `Profile 未能启动：${output || '没有输出'}`, 500))))
      const timeout = setTimeout(() => done(() => reject(new UserFacingError('launch-timeout', `等待 Profile 启动超时：${output || '没有输出'}`, 504))), 30_000)
    })
  }

  private runDsh(args: string[]): Promise<CommandResult> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(process.execPath, [this.cliPath(), ...args], { windowsHide: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
      let output = ''
      const append = (chunk: Buffer): void => { output = `${output}${chunk.toString()}`.slice(-48_000) }
      child.stdout.on('data', append)
      child.stderr.on('data', append)
      child.once('error', error => reject(new UserFacingError('command-failed', error.message, 500)))
      child.once('exit', code => code === 0
        ? resolvePromise({ output })
        : reject(new UserFacingError('command-failed', `DSH 插件操作失败：${output || `退出码 ${code ?? 'unknown'}`}`, 500)))
    })
  }

  private cliPath(): string {
    if (process.argv[1] !== undefined && existsSync(process.argv[1])) return process.argv[1]
    const require = createRequire(import.meta.url)
    return join(dirname(require.resolve('@deepseek-ai/dsh/package.json')), 'lib', 'bin.js')
  }

  private async githubJson<T>(path: string): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-plugin-installer' }
    if (this.githubToken !== null) headers.Authorization = `Bearer ${this.githubToken}`
    let response: Response
    try {
      response = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(15_000) })
    } catch (error) {
      this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
      throw githubConnectionError(error)
    }
    if (!response.ok) {
      if (response.status === 404) {
        throw new UserFacingError('github-not-found', 'GitHub 未找到该仓库或文件。', 404)
      }
      if (response.status === 401) {
        throw new UserFacingError('github-auth-failed', 'GitHub Token 无效或已过期，请更新插件设置。', 502)
      }
      const message = response.status === 403 || response.status === 429 ? 'GitHub 请求频率受限，请稍后重试，或在插件市场的 GitHub 请求设置中配置 Token。' : `GitHub 返回了 ${response.status}。`
      throw new UserFacingError('github-error', message, 502)
    }
    return await response.json() as T
  }

  private resolveCurrentProfile(): string {
    if (this.ctx.baseUrl === undefined) throw new Error('dsh-plugin-installer requires a DSH profile baseUrl')
    const base = fileURLToPath(this.ctx.baseUrl)
    const path = relative(this.profilesRoot, resolve(base))
    if (!isProfileName(path)) throw new Error('dsh-plugin-installer must run from a DSH profile directory')
    return path
  }

  private resolveDshHome(): string {
    const configured = process.env.DSH_HOME
    if (configured !== undefined && configured.trim().length > 0) return resolve(configured)
    if (this.ctx.baseUrl === undefined) throw new Error('dsh-plugin-installer requires a DSH profile baseUrl')
    const profileDirectory = resolve(fileURLToPath(this.ctx.baseUrl))
    const profilesDirectory = dirname(profileDirectory)
    if (basename(profilesDirectory) !== 'profiles') {
      throw new Error('dsh-plugin-installer could not resolve DSH_HOME from the active profile')
    }
    return dirname(profilesDirectory)
  }

  private profileExists(profile: string): boolean { return this.readProfile(profile) !== null }

  private profileSupportsWeb(profile: string): boolean {
    const bundles = this.readProfile(profile)?.dsh?.profile?.bundles
    return Array.isArray(bundles) && bundles.includes('@deepseek-ai/dsh-web-app')
  }

  private readProfile(profile: string): ProfilePackage | null {
    try { return JSON.parse(readFileSync(join(this.profilesRoot, profile, 'package.json'), 'utf8')) as ProfilePackage } catch { return null }
  }

  private repositoryFromInstalledPackage(profile: string, packageName: string): string | null {
    const manifest = this.readInstalledPackage(profile, packageName)
    return manifest === null ? null : githubRepositoryFromMetadata(manifest.repository)
  }

  private installedPlugins(profile: string, manifest: ProfilePackage, bundles: readonly string[]): InstalledPlugin[] {
    return Object.entries(manifest.dependencies ?? {}).flatMap(([packageName, specifier]) => {
      if (!isPackageName(packageName) || packageName.startsWith('@deepseek-ai/') || packageName === SELF_MANIFEST.name) return []
      const installed = this.readInstalledPackage(profile, packageName)
      const repository = githubRepositoryFromSpecifier(specifier) ?? githubRepositoryFromMetadata(installed?.repository)
      if (repository === null || (!bundles.includes(packageName) && !isBundleManifest(installed))) return []
      const [owner, repositoryName] = repository.split('/')
      if (owner === undefined || repositoryName === undefined) return []
      const plugin: InstalledPlugin = {
        packageName,
        repository,
        owner,
        repositoryName,
        installedVersion: typeof installed?.version === 'string' ? installed.version : null,
        installedCommit: githubCommitFromSpecifier(specifier),
        updateStatus: 'unknown',
      }
      return [plugin]
    }).sort((a, b) => a.repository.localeCompare(b.repository))
  }

  private findInstalledPlugin(profile: string, packageName: string): InstalledPlugin | null {
    const manifest = this.readProfile(profile)
    if (manifest === null) return null
    const bundles = Array.isArray(manifest.dsh?.profile?.bundles)
      ? manifest.dsh.profile.bundles.filter((item): item is string => typeof item === 'string')
      : []
    return this.installedPlugins(profile, manifest, bundles).find(plugin => plugin.packageName === packageName) ?? null
  }

  private async checkForUpdate(profile: string, plugin: InstalledPlugin): Promise<InstalledPlugin> {
    if (!this.packageEntryExists(profile, plugin)) return { ...plugin, updateStatus: 'available' }
    const releases = await this.releaseArchives(plugin.owner, plugin.repositoryName, plugin.packageName)
    const latestRelease = releases.find(item => !item.prerelease) ?? releases[0]
    if (latestRelease !== undefined && plugin.installedVersion !== null && latestRelease.version !== null) {
      return { ...plugin, updateStatus: plugin.installedVersion === latestRelease.version ? 'up-to-date' : 'available' }
    }
    if (plugin.installedCommit === null) return plugin
    const latestCommit = await this.latestCommit(plugin.owner, plugin.repositoryName)
    if (latestCommit === null) return plugin
    return { ...plugin, updateStatus: sameCommit(plugin.installedCommit, latestCommit) ? 'up-to-date' : 'available' }
  }

  private async releaseArchives(owner: string, repository: string, packageName: string): Promise<readonly GitHubReleaseArchive[]> {
    const key = `${owner}/${repository}/${packageName}`.toLocaleLowerCase()
    const cached = this.releaseCache.get(key)
    if (cached !== undefined && cached.expiresAt > Date.now()) return await cached.value
    const value = this.githubJson<unknown>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/releases?per_page=20`)
      .then(releases => githubReleaseArchives(packageName, releases))
      .catch(error => {
        if (error instanceof UserFacingError && error.code === 'github-tls-certificate') throw error
        return []
      })
    this.releaseCache.set(key, { value, expiresAt: Date.now() + 5 * 60_000 })
    return await value
  }

  private async latestCommit(owner: string, repository: string): Promise<string | null> {
    const key = `${owner}/${repository}`.toLocaleLowerCase()
    const cached = this.commitCache.get(key)
    if (cached !== undefined && cached.expiresAt > Date.now()) return await cached.value
    const value = this.githubJson<Array<{ sha?: unknown }>>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits?per_page=1`)
      .then(commits => typeof commits[0]?.sha === 'string' && /^[0-9a-f]{7,64}$/i.test(commits[0].sha) ? commits[0].sha : null)
      .catch(error => {
        if (error instanceof UserFacingError && error.code === 'github-tls-certificate') throw error
        return null
      })
    this.commitCache.set(key, { value, expiresAt: Date.now() + 5 * 60_000 })
    return await value
  }

  private async sourceEntryExists(owner: string, repository: string, ref: string, entry: string): Promise<boolean> {
    const path = entry.replace(/^\.\//, '')
    try {
      const file = await this.githubJson<{ type?: unknown }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`)
      return file.type === 'file'
    } catch (error) {
      if (error instanceof UserFacingError && error.status === 404) return false
      throw error
    }
  }

  private async resolveInstallSpec(candidate: PluginCandidate): Promise<string> {
    return candidate.release === null ? candidate.installSpec ?? '' : await this.downloadReleaseArchive(candidate)
  }

  private async downloadReleaseArchive(candidate: PluginCandidate): Promise<string> {
    const release = candidate.release
    if (release === null || candidate.packageName === null) throw new UserFacingError('release-unavailable', '该插件没有可用的 GitHub Release 安装包。', 409)
    if (release.size !== null && release.size > MAX_RELEASE_ARCHIVE_BYTES) {
      throw new UserFacingError('release-too-large', '插件安装包超过允许大小，已取消下载。', 413)
    }
    let response: Response
    try {
      response = await fetch(release.downloadUrl, { headers: { 'User-Agent': 'dsh-plugin-installer' }, signal: AbortSignal.timeout(60_000) })
    } catch (error) {
      this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
      throw githubConnectionError(error)
    }
    if (!response.ok) throw new UserFacingError('release-unavailable', `GitHub Release 安装包下载失败（${response.status}）。`, 502)
    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > MAX_RELEASE_ARCHIVE_BYTES) {
      throw new UserFacingError('release-too-large', '插件安装包超过允许大小，已取消下载。', 413)
    }
    const archive = Buffer.from(await response.arrayBuffer())
    if (archive.length === 0 || archive.length > MAX_RELEASE_ARCHIVE_BYTES) {
      throw new UserFacingError('release-invalid', 'GitHub Release 安装包大小无效。', 502)
    }
    if (release.sha256 !== null) {
      const actual = createHash('sha256').update(archive).digest('hex')
      if (actual !== release.sha256) throw new UserFacingError('release-integrity', 'GitHub Release 安装包校验失败，已取消安装。', 502)
    }
    const directory = join(this.resolveDshHome(), 'plugin-archives', candidate.packageName.replace(/^@/, '').replace('/', '-'))
    mkdirSync(directory, { recursive: true })
    const path = join(directory, release.name)
    writeFileSync(path, archive)
    return path
  }

  private packageEntryExists(profile: string, plugin: InstalledPlugin): boolean {
    const manifest = this.readInstalledPackage(profile, plugin.packageName)
    if (manifest === null || typeof manifest.main !== 'string' || manifest.main.length === 0) return true
    return existsSync(join(this.profilesRoot, profile, 'node_modules', ...plugin.packageName.split('/'), manifest.main))
  }

  private readInstalledPackage(profile: string, packageName: string): InstalledPackageManifest | null {
    if (!isPackageName(packageName)) return null
    try {
      const manifestPath = join(this.profilesRoot, profile, 'node_modules', ...packageName.split('/'), 'package.json')
      return JSON.parse(readFileSync(manifestPath, 'utf8')) as InstalledPackageManifest
    } catch {
      return null
    }
  }

  private json(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    response.end(JSON.stringify(body))
  }
}

function parseCatalogSort(value: string | null): CatalogSortKey {
  return value === 'stars' ? 'stars' : 'updated'
}

function parseCatalogDirection(value: string | null): CatalogSortDirection {
  return value === 'asc' ? 'asc' : 'desc'
}

function parseCatalogPage(value: string | null): number {
  if (value === null || !/^\d+$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page >= 1 && page <= CATALOG_MAX_PAGE ? page : 1
}

function toRepository(value: GitHubRepoResponse): GitHubRepository {
  return { id: value.id, fullName: value.full_name, name: value.name, owner: value.owner.login, description: value.description, url: value.html_url, defaultBranch: value.default_branch, stars: value.stargazers_count, updatedAt: value.updated_at, pushedAt: value.pushed_at, topics: value.topics ?? [], language: value.language }
}

/** Recover the GitHub repository identity written by `dsh plugin add github:owner/repo#sha`. */
function githubRepositoryFromSpecifier(specifier: string): string | null {
  const match = /^github:([^/]+)\/([^#]+?)(?:\.git)?(?:#.*)?$/i.exec(specifier)
  if (match === null) return null
  const [, owner, repository] = match
  if (!isRepositorySegment(owner) || !isRepositorySegment(repository)) return null
  return `${owner}/${repository}`.toLocaleLowerCase()
}

function githubCommitFromSpecifier(specifier: string): string | null {
  const match = /^github:[^/]+\/[^#]+#([0-9a-f]{7,64})$/i.exec(specifier)
  return match?.[1] ?? null
}

function sameCommit(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase()
    || left.length < right.length && right.toLocaleLowerCase().startsWith(left.toLocaleLowerCase())
}

function isPackageName(value: string): boolean {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(value)
}

function githubRepositoryFromMetadata(value: unknown): string | null {
  const url = typeof value === 'string'
    ? value
    : value !== null && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string'
      ? (value as { url: string }).url
      : null
  if (url === null) return null
  const match = /(?:github\.com[/:]|^github:)([^/\s]+)\/([^/#\s]+?)(?:\.git)?(?:#.*)?$/i.exec(url)
  if (match === null) return null
  const [, owner, repository] = match
  if (!isRepositorySegment(owner) || !isRepositorySegment(repository)) return null
  return `${owner}/${repository}`.toLocaleLowerCase()
}

function isBundleManifest(value: InstalledPackageManifest | null): boolean {
  const patch = value?.dsh?.bundle?.patch
  return typeof patch === 'string' && patch.length > 0
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new UserFacingError('invalid-request', '请求格式不正确。')
  return value as Record<string, unknown>
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let data = ''
  for await (const chunk of request) {
    data += String(chunk)
    if (data.length > 64 * 1024) throw new UserFacingError('request-too-large', '请求内容过大。', 413)
  }
  try { return JSON.parse(data) } catch { throw new UserFacingError('invalid-json', '请求不是有效 JSON。') }
}
