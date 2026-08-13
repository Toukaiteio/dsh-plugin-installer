import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
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

interface ApiError { readonly error?: { readonly code?: string; readonly message?: string } }

class MarketplaceRequestError extends Error {
  constructor(readonly code: string | undefined, message: string) {
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
  if (!response.ok) throw new MarketplaceRequestError(body.error?.code, body.error?.message ?? `Request failed (${response.status})`)
  return body
}

function updated(value: string, locale: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

/** Client-side catalog cache lifetime, kept in sync with the server cache. */
const CATALOG_CACHE_TTL_MS = 12 * 60_000
const CATALOG_CACHE_MAX_ENTRIES = 24

interface CatalogCacheEntry {
  readonly fetchedAt: number
  readonly plugins: Repository[]
}

const catalogCache = new Map<string, CatalogCacheEntry>()

function readCatalogCache(query: string): Repository[] | null {
  const normalized = normalizeCatalogQuery(query)
  const entry = catalogCache.get(normalized)
  if (entry === undefined) return null
  if (Date.now() - entry.fetchedAt > CATALOG_CACHE_TTL_MS) {
    catalogCache.delete(normalized)
    return null
  }
  return entry.plugins
}

function writeCatalogCache(query: string, plugins: Repository[]): void {
  const now = Date.now()
  const normalized = normalizeCatalogQuery(query)
  for (const [key, entry] of catalogCache) {
    if (now - entry.fetchedAt > CATALOG_CACHE_TTL_MS) catalogCache.delete(key)
  }
  if (!catalogCache.has(normalized) && catalogCache.size >= CATALOG_CACHE_MAX_ENTRIES) {
    const oldest = catalogCache.keys().next().value
    if (oldest !== undefined) catalogCache.delete(oldest)
  }
  catalogCache.set(normalized, { fetchedAt: now, plugins })
}

/** Marketplace UI: direct installation from a compact repository list. */
export function PluginMarketplaceSettingsTab({ t }: SettingsProps): ReactNode {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null)
  const [plugins, setPlugins] = useState<readonly Repository[]>([])
  const [query, setQuery] = useState('')
  const [selectedProfile, setSelectedProfile] = useState('')
  const [selectedRelease, setSelectedRelease] = useState<Record<string, string>>({})
  const [releaseChoices, setReleaseChoices] = useState<Record<string, readonly ReleaseArchive[]>>({})
  const [showReleaseChoices, setShowReleaseChoices] = useState<Record<string, boolean>>({})
  const [sourceConsent, setSourceConsent] = useState<Record<string, boolean>>({})
  const [sourceBuildAllowed, setSourceBuildAllowed] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [restartAvailable, setRestartAvailable] = useState(false)
  const [newProfile, setNewProfile] = useState('')
  const [sortBy, setSortBy] = useState<CatalogSortKey>('updated')
  const [sortDirection, setSortDirection] = useState<CatalogSortDirection>('desc')

  const load = async (search = query, preserveMessage = false, bypassCache = false): Promise<void> => {
    setLoading(true)
    if (!preserveMessage) setMessage(null)
    try {
      const normalizedSearch = normalizeCatalogQuery(search)
      const cached = bypassCache ? null : readCatalogCache(normalizedSearch)
      const catalogPromise = cached === null
        ? api<{ plugins: Repository[] }>(`/plugins?query=${encodeURIComponent(normalizedSearch)}${bypassCache ? '&refresh=1' : ''}`).then(result => {
            writeCatalogCache(normalizedSearch, result.plugins)
            return result.plugins
          })
        : Promise.resolve(cached)
      const [state, catalog] = await Promise.all([api<StateSnapshot>('/state'), catalogPromise])
      setSnapshot(state)
      setSelectedProfile(current => current || state.currentProfile)
      setPlugins(catalog)
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('loadFailed') })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load('') }, [])

  const profiles = snapshot?.profiles ?? []
  const selectedSummary = profiles.find(profile => profile.name === selectedProfile)
  const visiblePlugins = useMemo(() => sortCatalog(plugins, sortBy, sortDirection), [plugins, sortBy, sortDirection])
  const updatableCount = selectedSummary?.installedPlugins.filter(plugin => plugin.updateStatus === 'available').length ?? 0

  const actionIs = (value: string): boolean => action === value
  const isWorking = action !== null

  const install = async (repository: Repository): Promise<void> => {
    const actionKey = `install:${repository.fullName}`
    if (action !== null) return
    setAction(actionKey)
    setRestartAvailable(false)
    setMessage(null)
    try {
      const releaseTag = selectedRelease[repository.fullName]
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
        setMessage({ kind: 'error', text })
      }
    } finally {
      setAction(null)
    }
  }

  const loadReleaseChoices = async (repository: Repository): Promise<void> => {
    const key = repository.fullName
    if (action !== null) return
    setShowReleaseChoices(current => ({ ...current, [key]: !current[key] }))
    if (releaseChoices[key] !== undefined) return
    const actionKey = `versions:${key}`
    setAction(actionKey)
    try {
      const result = await api<{ plugin: Candidate }>(`/plugin/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`)
      if (!result.plugin.validBundle || result.plugin.installSource !== 'release' || result.plugin.releases.length === 0) {
        setMessage({ kind: 'error', text: result.plugin.reason ?? t('releaseChoicesUnavailable') })
        setReleaseChoices(current => ({ ...current, [key]: [] }))
        return
      }
      setReleaseChoices(current => ({ ...current, [key]: result.plugin.releases }))
      setSelectedRelease(current => current[key] === undefined && result.plugin.release !== null
        ? { ...current, [key]: result.plugin.release.tag }
        : current)
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('releaseChoicesUnavailable') })
    } finally {
      setAction(null)
    }
  }

  const openProfile = async (): Promise<void> => {
    if (selectedSummary?.webCapable !== true) return
    setAction('open-profile')
    setMessage(null)
    try {
      const result = await api<{ url: string }>('/switch', { method: 'POST', body: JSON.stringify({ profile: selectedProfile }) })
      window.location.assign(result.url)
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('profileFailed') })
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
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('profileFailed') })
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
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('profileFailed') })
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
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('updateFailed') })
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
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('removeFailed') })
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
    <div className={css.root} aria-busy={loading || isWorking}>
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
          disabled={isWorking || plugins.length === 0}
          onChange={event => setSortBy(event.currentTarget.value as CatalogSortKey)}
        >
          <option value="updated">{t('sortUpdated')}</option>
          <option value="name">{t('sortName')}</option>
          <option value="stars">{t('sortStars')}</option>
        </select>
        <button
          type="button"
          className={css.sortDirection}
          disabled={isWorking || plugins.length === 0}
          onClick={() => setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc')}
          aria-label={sortDirection === 'asc' ? t('sortToggleToDesc') : t('sortToggleToAsc')}
          title={sortDirection === 'asc' ? t('sortAsc') : t('sortDesc')}
        >
          <span aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>
        </button>
        <button type="submit" className={css.secondaryButton} disabled={loading || isWorking}>{t('refresh')}</button>
      </form>

      {message !== null ? <p className={message.kind === 'error' ? css.error : css.success} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p> : null}
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
                      : <button type="button" className={css.secondaryButton} disabled={isWorking || selectedProfile.length === 0} onClick={() => void install(plugin)}>{actionIs(`install:${plugin.fullName}`) ? t('installing') : t('install')}</button>}
                    {!isInstalled(plugin) ? <button type="button" className={css.textButton} disabled={isWorking} onClick={() => void loadReleaseChoices(plugin)}>{actionIs(`versions:${plugin.fullName}`) ? t('loadingVersions') : t('chooseVersion')}</button> : null}
                  </div>
                </li>
                {showReleaseChoices[plugin.fullName] === true ? (
                  <li className={css.versionRow}>
                    {releaseChoices[plugin.fullName] === undefined
                      ? <span className={css.status}>{t('loadingVersions')}</span>
                    : (releaseChoices[plugin.fullName]?.length ?? 0) === 0
                        ? <span className={css.status}>{t('releaseChoicesUnavailable')}</span>
                        : <label className={css.versionPicker}>
                            <span>{t('installVersion')}</span>
                            <select value={selectedRelease[plugin.fullName] ?? ''} disabled={isWorking} onChange={event => setSelectedRelease(current => ({ ...current, [plugin.fullName]: event.currentTarget.value }))}>
                              {(releaseChoices[plugin.fullName] ?? []).map(release => <option key={release.tag} value={release.tag}>{release.tag}</option>)}
                            </select>
                          </label>}
                  </li>
                ) : null}
                {sourceConsent[plugin.fullName] === true ? (
                  <li className={css.versionRow}>
                    <label className={css.sourceApproval}>
                      <input type="checkbox" checked={sourceBuildAllowed[plugin.fullName] === true} disabled={isWorking} onChange={event => setSourceBuildAllowed(current => ({ ...current, [plugin.fullName]: event.currentTarget.checked }))} />
                      <span>{t('sourceBuildApproval')}</span>
                      <button type="button" className={css.primaryButton} disabled={isWorking || sourceBuildAllowed[plugin.fullName] !== true} onClick={() => void install(plugin)}>{actionIs(`install:${plugin.fullName}`) ? t('installing') : t('install')}</button>
                    </label>
                  </li>
                ) : null}
              </Fragment>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
