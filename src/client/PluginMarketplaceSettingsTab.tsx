import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MarketplaceLocaleKey } from './locales.js'
import { normalizeCatalogQuery, sortCatalog, type CatalogSortDirection, type CatalogSortKey } from '../marketplace.js'
import css from './PluginMarketplaceSettingsTab.module.css'

type SettingsProps = PropsRuntime<'settings.plugins.tab'> & PropsLocale<'dsh-plugin-installer'>

interface Profile {
  readonly name: string
  readonly webCapable: boolean
  readonly installedRepositories: readonly string[]
  readonly installedPlugins: readonly InstalledPlugin[]
}

interface StateSnapshot {
  readonly currentProfile: string
  readonly profiles: readonly Profile[]
}

interface GithubConfig {
  readonly configured: boolean
  readonly source: 'environment' | 'saved' | 'none'
}

interface Repository {
  readonly fullName: string
  readonly owner: string
  readonly name: string
  readonly description: string | null
  readonly url: string
  readonly stars: number
  readonly updatedAt: string
  readonly language: string | null
}

interface Candidate {
  readonly repository: Repository
  readonly packageName: string | null
  readonly version: string | null
  readonly description: string | null
  readonly release: ReleaseArchive | null
  readonly releases: readonly ReleaseArchive[]
  readonly installSource: 'release' | 'source' | null
  readonly validBundle: boolean
  readonly reason: string | null
  readonly requiresBuildApproval: boolean
}

interface ReleaseArchive {
  readonly tag: string
  readonly version: string | null
}

interface ReleaseDialogState {
  readonly repository: Repository
  readonly releases: readonly ReleaseArchive[]
  readonly selectedTag: string
}

interface InstallResult {
  readonly installed: Candidate
  readonly restartAvailable: boolean
}

interface InstalledPlugin {
  readonly packageName: string
  readonly repository: string
  readonly owner: string
  readonly repositoryName: string
  readonly installedVersion: string | null
  readonly updateStatus: 'available' | 'up-to-date' | 'unknown'
}

interface PluginActionResult { readonly restartAvailable: boolean }

interface ApiError {
  readonly error?: {
    readonly code?: string
    readonly message?: string
    readonly hint?: string
    readonly command?: string
  }
}

class MarketplaceRequestError extends Error {
  constructor(readonly code: string | undefined, message: string, readonly hint?: string, readonly command?: string) {
    super(message)
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/dsh-plugin-installer/api${path}`, {
    ...init,
    headers: { ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }), ...init?.headers },
    credentials: 'same-origin',
  })
  const body = await response.json() as T & ApiError
  if (!response.ok) throw new MarketplaceRequestError(body.error?.code, body.error?.message ?? `Request failed (${response.status})`, body.error?.hint, body.error?.command)
  return body
}

interface Message {
  readonly kind: 'error' | 'success'
  readonly text: string
  readonly hint?: string
  readonly command?: string
}

function errorMessage(error: unknown, fallback: string): Omit<Message, 'kind'> {
  if (error instanceof MarketplaceRequestError) return { text: error.message, hint: error.hint, command: error.command }
  return { text: error instanceof Error ? error.message : fallback }
}

function updated(value: string, locale: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

/** Client-side catalog cache lifetime, kept in sync with the server cache. */
const CATALOG_CACHE_TTL_MS = 12 * 60_000
const CATALOG_CACHE_MAX_ENTRIES = 48

interface CatalogPage {
  readonly plugins: Repository[]
  readonly hasMore: boolean
}

interface CatalogCacheEntry {
  readonly fetchedAt: number
  readonly page: CatalogPage
}

const catalogCache = new Map<string, CatalogCacheEntry>()

function catalogCacheKey(query: string, sort: CatalogSortKey, direction: CatalogSortDirection, page: number): string {
  return `${sort}:${direction}:${page}:${encodeURIComponent(normalizeCatalogQuery(query))}`
}

function readCatalogCache(query: string, sort: CatalogSortKey, direction: CatalogSortDirection, page: number): CatalogPage | null {
  const entry = catalogCache.get(catalogCacheKey(query, sort, direction, page))
  if (entry === undefined) return null
  if (Date.now() - entry.fetchedAt > CATALOG_CACHE_TTL_MS) {
    catalogCache.delete(catalogCacheKey(query, sort, direction, page))
    return null
  }
  return entry.page
}

function writeCatalogCache(query: string, sort: CatalogSortKey, direction: CatalogSortDirection, page: number, value: CatalogPage): void {
  const now = Date.now()
  const key = catalogCacheKey(query, sort, direction, page)
  for (const [key, entry] of catalogCache) {
    if (now - entry.fetchedAt > CATALOG_CACHE_TTL_MS) catalogCache.delete(key)
  }
  if (!catalogCache.has(key) && catalogCache.size >= CATALOG_CACHE_MAX_ENTRIES) {
    const oldest = catalogCache.keys().next().value
    if (oldest !== undefined) catalogCache.delete(oldest)
  }
  catalogCache.set(key, { fetchedAt: now, page: value })
}

function clearCatalogCache(query: string, sort: CatalogSortKey, direction: CatalogSortDirection): void {
  const suffix = `:${encodeURIComponent(normalizeCatalogQuery(query))}`
  const prefix = `${sort}:${direction}:`
  for (const key of catalogCache.keys()) {
    if (key.startsWith(prefix) && key.endsWith(suffix)) catalogCache.delete(key)
  }
}

function mergeCatalog(current: readonly Repository[], next: readonly Repository[]): Repository[] {
  const seen = new Set(current.map(plugin => plugin.fullName.toLocaleLowerCase()))
  return [...current, ...next.filter(plugin => {
    const key = plugin.fullName.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })]
}

/** Marketplace UI: direct installation from a compact repository list. */
export function PluginMarketplaceSettingsTab({ t }: SettingsProps): ReactNode {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null)
  const [githubConfig, setGithubConfig] = useState<GithubConfig | null>(null)
  const [githubToken, setGithubToken] = useState('')
  const [plugins, setPlugins] = useState<readonly Repository[]>([])
  const [query, setQuery] = useState('')
  const [selectedProfile, setSelectedProfile] = useState('')
  const [releaseDialog, setReleaseDialog] = useState<ReleaseDialogState | null>(null)
  const [sourceConsent, setSourceConsent] = useState<Record<string, boolean>>({})
  const [sourceBuildAllowed, setSourceBuildAllowed] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [catalogPage, setCatalogPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadMoreFailed, setLoadMoreFailed] = useState(false)
  const [action, setAction] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [restartAvailable, setRestartAvailable] = useState(false)
  const [newProfile, setNewProfile] = useState('')
  const [sortBy, setSortBy] = useState<CatalogSortKey>('updated')
  const [sortDirection, setSortDirection] = useState<CatalogSortDirection>('desc')
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const load = async (
    search = query,
    preserveMessage = false,
    bypassCache = false,
    page = 1,
    requestedSort = sortBy,
    requestedDirection = sortDirection,
  ): Promise<void> => {
    if (page === 1) {
      setLoading(true)
      setCatalogPage(0)
      setHasMore(false)
      setLoadMoreFailed(false)
    } else {
      setLoadingMore(true)
      setLoadMoreFailed(false)
    }
    if (!preserveMessage) setMessage(null)
    try {
      const normalizedSearch = normalizeCatalogQuery(search)
      if (bypassCache && page === 1) clearCatalogCache(normalizedSearch, requestedSort, requestedDirection)
      const cached = bypassCache ? null : readCatalogCache(normalizedSearch, requestedSort, requestedDirection, page)
      const catalogPromise = cached === null
        ? api<CatalogPage>(`/plugins?query=${encodeURIComponent(normalizedSearch)}&sort=${requestedSort}&order=${requestedDirection}&page=${page}${bypassCache ? '&refresh=1' : ''}`).then(result => {
            writeCatalogCache(normalizedSearch, requestedSort, requestedDirection, page, result)
            return result
          })
        : Promise.resolve(cached)
      const [state, catalog] = await Promise.all([page === 1 ? api<StateSnapshot>('/state') : Promise.resolve(null), catalogPromise])
      if (state !== null) {
        setSnapshot(state)
        setSelectedProfile(current => current || state.currentProfile)
      }
      setPlugins(current => page === 1 ? catalog.plugins : mergeCatalog(current, catalog.plugins))
      setCatalogPage(page)
      setHasMore(catalog.hasMore)
    } catch (error) {
      setMessage({ kind: 'error', ...errorMessage(error, t('loadFailed')) })
      if (page > 1) {
        setHasMore(false)
        setLoadMoreFailed(true)
      }
    } finally {
      if (page === 1) setLoading(false)
      else setLoadingMore(false)
    }
  }

  const loadGithubConfig = async (): Promise<void> => {
    try {
      setGithubConfig(await api<GithubConfig>('/config'))
    } catch {
      // The marketplace remains usable when an older backend does not expose this optional endpoint.
    }
  }

  useEffect(() => {
    void load('')
    void loadGithubConfig()
  }, [])

  const profiles = snapshot?.profiles ?? []
  const selectedSummary = profiles.find(profile => profile.name === selectedProfile)
  const visiblePlugins = useMemo(() => sortCatalog(plugins, sortBy, sortDirection), [plugins, sortBy, sortDirection])
  const updatableCount = selectedSummary?.installedPlugins.filter(plugin => plugin.updateStatus === 'available').length ?? 0

  const loadNextPage = (): void => {
    if (loading || loadingMore || !hasMore) return
    void load(query, true, false, catalogPage + 1)
  }

  useEffect(() => {
    const target = loadMoreRef.current
    if (target === null || !hasMore) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) loadNextPage()
    }, { rootMargin: '480px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [catalogPage, hasMore, loading, loadingMore, query, sortBy, sortDirection])

  const actionIs = (value: string): boolean => action === value
  const isWorking = action !== null

  const saveGithubToken = async (): Promise<void> => {
    if (action !== null) return
    setAction('github-config')
    setMessage(null)
    setRestartAvailable(false)
    try {
      const result = await api<GithubConfig>('/config', {
        method: 'POST',
        body: JSON.stringify({ githubToken }),
      })
      setGithubConfig(result)
      setGithubToken('')
      setMessage({ kind: 'success', text: t('githubTokenSaved') })
    } catch (error) {
      setMessage({ kind: 'error', ...errorMessage(error, t('githubTokenSaveFailed')) })
    } finally {
      setAction(null)
    }
  }

  const performInstall = async (repository: Repository, releaseTag?: string): Promise<void> => {
    const actionKey = `install:${repository.fullName}`
    setAction(actionKey)
    setRestartAvailable(false)
    setMessage(null)
    try {
      const result = await api<InstallResult>('/install', {
        method: 'POST',
        body: JSON.stringify({
          profile: selectedProfile,
          owner: repository.owner,
          repository: repository.name,
          ...releaseTag === undefined ? {} : { releaseTag },
          ...sourceBuildAllowed[repository.fullName] === true ? { allowBuild: true } : {},
        }),
      })
      await load(query, true)
      setMessage({ kind: 'success', text: result.installed.installSource === 'source' ? t('installedFromSource') : t('installed') })
      setRestartAvailable(result.restartAvailable)
    } catch (error) {
      const text = error instanceof Error ? error.message : t('installFailed')
      if (error instanceof MarketplaceRequestError && error.code === 'build-approval-required') {
        setMessage(null)
        setSourceConsent(current => ({ ...current, [repository.fullName]: true }))
      } else {
        setMessage({ kind: 'error', ...errorMessage(error, text) })
      }
    } finally {
      setAction(null)
    }
  }

  const beginInstall = async (repository: Repository): Promise<void> => {
    if (action !== null) return
    setAction(`inspect:${repository.fullName}`)
    setMessage(null)
    try {
      const result = await api<{ plugin: Candidate }>(`/plugin/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`)
      if (!result.plugin.validBundle) {
        throw new MarketplaceRequestError('not-a-bundle', result.plugin.reason ?? t('releaseChoicesUnavailable'))
      }
      if (result.plugin.installSource === 'release' && result.plugin.releases.length > 1) {
        const selectedTag = result.plugin.release?.tag ?? result.plugin.releases[0]?.tag
        if (selectedTag === undefined) throw new MarketplaceRequestError('release-unavailable', t('releaseChoicesUnavailable'))
        setReleaseDialog({ repository, releases: result.plugin.releases, selectedTag })
        return
      }
      await performInstall(repository, result.plugin.installSource === 'release' ? result.plugin.release?.tag ?? undefined : undefined)
    } catch (error) {
      if (error instanceof MarketplaceRequestError && error.code === 'build-approval-required') {
        setSourceConsent(current => ({ ...current, [repository.fullName]: true }))
      } else {
        setMessage({ kind: 'error', ...errorMessage(error, t('installFailed')) })
      }
    } finally {
      setAction(null)
    }
  }

  const confirmReleaseInstall = (): void => {
    if (releaseDialog === null) return
    const { repository, selectedTag } = releaseDialog
    setReleaseDialog(null)
    void performInstall(repository, selectedTag)
  }

  const openProfile = async (): Promise<void> => {
    if (selectedSummary?.webCapable !== true) return
    setAction('open-profile')
    setMessage(null)
    try {
      const result = await api<{ url: string }>('/switch', { method: 'POST', body: JSON.stringify({ profile: selectedProfile }) })
      window.location.assign(result.url)
    } catch (error) {
      setMessage({ kind: 'error', ...errorMessage(error, t('profileFailed')) })
      setAction(null)
    }
  }

  const createProfile = async (): Promise<void> => {
    if (newProfile.trim().length === 0) return
    setAction('create-profile')
    setMessage(null)
    try {
      const result = await api<{ url: string }>('/profiles', { method: 'POST', body: JSON.stringify({ name: newProfile.trim() }) })
      window.location.assign(result.url)
    } catch (error) {
      setMessage({ kind: 'error', ...errorMessage(error, t('profileFailed')) })
      setAction(null)
    }
  }

  const restartDsh = async (): Promise<void> => {
    setAction('restart')
    setMessage(null)
    try {
      const result = await api<{ url: string }>('/restart', { method: 'POST', body: JSON.stringify({ profile: selectedProfile }) })
      window.location.assign(result.url)
    } catch (error) {
      setMessage({ kind: 'error', ...errorMessage(error, t('profileFailed')) })
      setAction(null)
    }
  }

  const updatePlugin = async (plugin: InstalledPlugin): Promise<void> => {
    const actionKey = `update:${plugin.packageName}`
    if (action !== null) return
    setAction(actionKey)
    setMessage(null)
    setRestartAvailable(false)
    try {
      const result = await api<PluginActionResult>('/update', {
        method: 'POST',
        body: JSON.stringify({ profile: selectedProfile, packageName: plugin.packageName, owner: plugin.owner, repository: plugin.repositoryName }),
      })
      await load(query, true)
      setMessage({ kind: 'success', text: t('updatedPlugin') })
      setRestartAvailable(result.restartAvailable)
    } catch (error) {
      setMessage({ kind: 'error', ...errorMessage(error, t('updateFailed')) })
    } finally {
      setAction(null)
    }
  }

  const removePlugin = async (plugin: InstalledPlugin): Promise<void> => {
    if (!window.confirm(`${t('removeConfirm')}\n\n${plugin.packageName}`)) return
    const actionKey = `remove:${plugin.packageName}`
    if (action !== null) return
    setAction(actionKey)
    setMessage(null)
    setRestartAvailable(false)
    try {
      const result = await api<PluginActionResult>('/remove', {
        method: 'POST',
        body: JSON.stringify({ profile: selectedProfile, packageName: plugin.packageName }),
      })
      await load(query, true)
      setMessage({ kind: 'success', text: t('removedPlugin') })
      setRestartAvailable(result.restartAvailable)
    } catch (error) {
      setMessage({ kind: 'error', ...errorMessage(error, t('removeFailed')) })
    } finally {
      setAction(null)
    }
  }

  const isInstalled = (repository: Repository): boolean => {
    if (selectedSummary === undefined) return false
    const fullName = repository.fullName.toLocaleLowerCase()
    return selectedSummary.installedRepositories.includes(fullName)
  }

  return (
    <div className={css.root} aria-busy={loading || loadingMore || isWorking}>
      <section className={css.profileBar} aria-label={t('currentProfile')}>
        <label>
          <span className={css.visuallyHidden}>{t('currentProfile')}</span>
          <select value={selectedProfile} onChange={event => setSelectedProfile(event.currentTarget.value)} disabled={profiles.length === 0 || isWorking}>
            {profiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name}</option>)}
          </select>
        </label>
        <button type="button" className={css.secondaryButton} disabled={isWorking || selectedSummary?.webCapable !== true} onClick={() => void openProfile()}>{actionIs('open-profile') ? t('openingProfile') : t('openProfile')}</button>
        <label className={css.newProfile}>
          <span className={css.newProfileLabel}>{t('newProfile')}</span>
          <input value={newProfile} placeholder={t('newProfilePlaceholder')} onChange={event => setNewProfile(event.currentTarget.value)} disabled={isWorking} />
        </label>
        <button type="button" className={css.secondaryButton} disabled={isWorking || newProfile.trim().length === 0} onClick={() => void createProfile()}>{actionIs('create-profile') ? t('creatingProfile') : t('createAndOpen')}</button>
      </section>

      <form className={css.search} onSubmit={event => { event.preventDefault(); void load(query, false, true) }}>
        <input value={query} type="search" placeholder={t('search')} aria-label={t('search')} onChange={event => setQuery(event.currentTarget.value)} />
        <select
          className={css.sortSelect}
          value={sortBy}
          aria-label={t('sort')}
          title={t('sort')}
          disabled={isWorking || loading || loadingMore}
          onChange={event => {
            const nextSort = event.currentTarget.value as CatalogSortKey
            if (nextSort === sortBy) return
            setSortBy(nextSort)
            setCatalogPage(0)
            setHasMore(false)
            void load(query, false, false, 1, nextSort, sortDirection)
          }}
        >
          <option value="updated">{t('sortUpdated')}</option>
          <option value="stars">{t('sortStars')}</option>
        </select>
        <button
          type="button"
          className={css.sortDirection}
          disabled={isWorking || loading || loadingMore}
          onClick={() => {
            const nextDirection = sortDirection === 'asc' ? 'desc' : 'asc'
            setSortDirection(nextDirection)
            setCatalogPage(0)
            setHasMore(false)
            void load(query, false, false, 1, sortBy, nextDirection)
          }}
          aria-label={sortDirection === 'asc' ? t('sortToggleToDesc') : t('sortToggleToAsc')}
          title={sortDirection === 'asc' ? t('sortAsc') : t('sortDesc')}
        >
          <span aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>
        </button>
        <button type="submit" className={css.secondaryButton} disabled={loading || loadingMore || isWorking}>{t('refresh')}</button>
      </form>

      <details className={css.githubSettings}>
        <summary className={css.githubSettingsSummary}>
          <span>{t('githubSettings')}</span>
          <span className={css.githubTokenStatus}>
            {githubConfig === null
              ? t('loading')
              : githubConfig.source === 'saved'
                ? t('githubTokenStatusSaved')
                : githubConfig.source === 'environment'
                  ? t('githubTokenStatusEnvironment')
                  : t('githubTokenStatusMissing')}
          </span>
        </summary>
        <div className={css.githubSettingsBody}>
          <p className={css.status}>{t('githubSettingsHint')}</p>
          <label className={css.githubTokenField}>
            <span>{t('githubTokenLabel')}</span>
            <input
              type="password"
              value={githubToken}
              autoComplete="off"
              placeholder={t('githubTokenPlaceholder')}
              disabled={isWorking}
              onChange={event => setGithubToken(event.currentTarget.value)}
            />
          </label>
          <button type="button" className={css.secondaryButton} disabled={isWorking} onClick={() => void saveGithubToken()}>
            {actionIs('github-config') ? t('saving') : t('save')}
          </button>
        </div>
      </details>

      {message !== null ? (
        <div className={message.kind === 'error' ? css.error : css.success} role={message.kind === 'error' ? 'alert' : 'status'}>
          <span>{message.text}</span>
          {message.hint === undefined ? null : <span className={css.errorHint}>{message.hint}</span>}
          {message.command === undefined ? null : <code className={css.errorCommand}>{message.command}</code>}
        </div>
      ) : null}
      {message?.kind === 'success' ? (
        restartAvailable
          ? <button type="button" className={css.primaryButton} disabled={isWorking} onClick={() => void restartDsh()}>{actionIs('restart') ? t('restarting') : t('restartNow')}</button>
          : <p className={css.status}>{t('restartUnavailable')}</p>
      ) : null}
      {loading ? <p className={css.status}>{t('loading')}</p> : null}

      {/* Collapsed by default; opens itself only when updates are waiting. */}
      {selectedSummary !== undefined && selectedSummary.installedPlugins.length > 0 ? (
        <details className={css.installed} open={updatableCount > 0}>
          <summary className={css.installedSummary}>
            <span className={css.installedTitle}>{t('installedPlugins')}</span>
            <span className={css.installedBadge}>
              {selectedSummary.installedPlugins.length} {t('installedCount')}
            </span>
            {updatableCount > 0 ? <span className={css.updateBadge}>{updatableCount} {t('updateAvailable')}</span> : null}
          </summary>
          <p className={css.installedHint}>{t('installedPluginsHint')}</p>
          <ul className={css.rows}>
            {selectedSummary.installedPlugins.map(plugin => (
              <li key={plugin.packageName} className={css.row}>
                <div className={css.rowMain}>
                  <a href={`https://github.com/${plugin.repository}`} target="_blank" rel="noreferrer" className={css.repository}>{plugin.repository}</a>
                  <span>{plugin.installedVersion === null ? plugin.packageName : `${plugin.packageName} · v${plugin.installedVersion}`}</span>
                </div>
                <div className={css.rowActions}>
                  {plugin.updateStatus === 'available'
                    ? <button type="button" className={css.primaryButton} disabled={isWorking} onClick={() => void updatePlugin(plugin)}>{actionIs(`update:${plugin.packageName}`) ? t('updating') : t('update')}</button>
                    : <span className={css.installedTag}>{plugin.updateStatus === 'up-to-date' ? t('upToDate') : t('updateUnknown')}</span>}
                  <button type="button" className={css.secondaryButton} disabled={isWorking} onClick={() => void removePlugin(plugin)}>{actionIs(`remove:${plugin.packageName}`) ? t('removing') : t('remove')}</button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!loading && visiblePlugins.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
      {visiblePlugins.length > 0 ? (
        <section className={css.catalog} aria-label={t('tab')}>
          <ul className={css.rows}>
            {visiblePlugins.map(plugin => (
              <Fragment key={plugin.fullName}>
                <li className={css.row}>
                  <div className={css.rowMain}>
                    <a href={plugin.url} target="_blank" rel="noreferrer" className={css.repository}>{plugin.fullName}</a>
                    <p>{plugin.description ?? t('noDescription')}</p>
                    <span>{t('stars')} {plugin.stars} · {t('updated')} {updated(plugin.updatedAt, t('dateLocale'))}{plugin.language === null ? '' : ` · ${plugin.language}`}</span>
                  </div>
                  <div className={css.rowActions}>
                    {isInstalled(plugin)
                      ? <span className={css.installedTag}>{t('installedPlugin')}</span>
                      : null}
                    {!isInstalled(plugin) ? <button type="button" className={css.secondaryButton} disabled={isWorking || selectedProfile.length === 0} onClick={() => void beginInstall(plugin)}>{actionIs(`inspect:${plugin.fullName}`) ? t('checkingVersions') : actionIs(`install:${plugin.fullName}`) ? t('installing') : t('install')}</button> : null}
                  </div>
                </li>
                {sourceConsent[plugin.fullName] === true ? (
                  <li className={css.versionRow}>
                    <div className={css.sourceApproval}>
                      <input type="checkbox" checked={sourceBuildAllowed[plugin.fullName] === true} disabled={isWorking} onChange={event => setSourceBuildAllowed(current => ({ ...current, [plugin.fullName]: event.currentTarget.checked }))} />
                      <span>{t('sourceBuildApproval')}</span>
                      <button type="button" className={css.primaryButton} disabled={isWorking || sourceBuildAllowed[plugin.fullName] !== true} onClick={() => void performInstall(plugin)}>{actionIs(`install:${plugin.fullName}`) ? t('installing') : t('install')}</button>
                    </div>
                  </li>
                ) : null}
              </Fragment>
            ))}
          </ul>
          <div ref={loadMoreRef} className={css.loadMore} aria-live="polite">
            {loadingMore
              ? <span className={css.status}>{t('loadingMore')}</span>
              : loadMoreFailed
                ? <span className={css.status}>{t('loadMoreFailed')}</span>
                : !hasMore
                  ? <span className={css.status}>{t('catalogComplete')}</span>
                  : null}
          </div>
        </section>
      ) : null}
      {releaseDialog !== null ? (
        <div className={css.dialogBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) setReleaseDialog(null) }}>
          <div className={css.releaseDialog} role="dialog" aria-modal="true" aria-labelledby="dsh-plugin-release-dialog-title">
            <h2 id="dsh-plugin-release-dialog-title">{t('releaseDialogTitle')}</h2>
            <p>{t('releaseDialogDescription')}</p>
            <label className={css.dialogField}>
              <span>{t('installVersion')}</span>
              <select value={releaseDialog.selectedTag} onChange={event => setReleaseDialog(current => current === null ? current : { ...current, selectedTag: event.currentTarget.value })}>
                {releaseDialog.releases.map(release => <option key={release.tag} value={release.tag}>{release.tag}</option>)}
              </select>
            </label>
            <div className={css.dialogActions}>
              <button type="button" className={css.secondaryButton} onClick={() => setReleaseDialog(null)}>{t('cancel')}</button>
              <button type="button" className={css.primaryButton} onClick={confirmReleaseInstall}>{t('install')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
