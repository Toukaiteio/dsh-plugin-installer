import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
  readonly validBundle: boolean
  readonly reason: string | null
  readonly requiresBuildApproval: boolean
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

interface ApiError { readonly error?: { readonly message?: string } }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/dsh-plugin-installer/api${path}`, {
    ...init,
    headers: { ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }), ...init?.headers },
    credentials: 'same-origin',
  })
  const body = await response.json() as T & ApiError
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status})`)
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

/** Marketplace UI: one toolbar, one inline review panel and a compact repository list. */
export function PluginMarketplaceSettingsTab({ t }: SettingsProps): ReactNode {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null)
  const [plugins, setPlugins] = useState<readonly Repository[]>([])
  const [query, setQuery] = useState('')
  const [selectedProfile, setSelectedProfile] = useState('')
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [allowBuild, setAllowBuild] = useState(false)
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

  const inspect = async (repository: Repository): Promise<void> => {
    setWorking(true)
    setCandidate(null)
    setAllowBuild(false)
    setRestartAvailable(false)
    setMessage(null)
    try {
      const result = await api<{ plugin: Candidate }>(`/plugin/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`)
      setCandidate(result.plugin)
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('installFailed') })
    } finally {
      setWorking(false)
    }
  }

  const install = async (): Promise<void> => {
    if (candidate === null || !candidate.validBundle) return
    setWorking(true)
    setMessage(null)
    setRestartAvailable(false)
    try {
      const result = await api<InstallResult>('/install', {
        method: 'POST',
        body: JSON.stringify({ profile: selectedProfile, owner: candidate.repository.owner, repository: candidate.repository.name, allowBuild }),
      })
      await load(query, true)
      setMessage({ kind: 'success', text: t('installed') })
      setRestartAvailable(result.restartAvailable)
      setCandidate(null)
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('installFailed') })
    } finally {
      setWorking(false)
    }
  }

  const openProfile = async (): Promise<void> => {
    if (selectedSummary?.webCapable !== true) return
    setWorking(true)
    setMessage(null)
    try {
      const result = await api<{ url: string }>('/switch', { method: 'POST', body: JSON.stringify({ profile: selectedProfile }) })
      window.location.assign(result.url)
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('profileFailed') })
      setWorking(false)
    }
  }

  const createProfile = async (): Promise<void> => {
    if (newProfile.trim().length === 0) return
    setWorking(true)
    setMessage(null)
    try {
      const result = await api<{ url: string }>('/profiles', { method: 'POST', body: JSON.stringify({ name: newProfile.trim() }) })
      window.location.assign(result.url)
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('profileFailed') })
      setWorking(false)
    }
  }

  const restartDsh = async (): Promise<void> => {
    setWorking(true)
    setMessage(null)
    try {
      const result = await api<{ url: string }>('/restart', { method: 'POST', body: JSON.stringify({ profile: selectedProfile }) })
      window.location.assign(result.url)
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('profileFailed') })
      setWorking(false)
    }
  }

  const updatePlugin = async (plugin: InstalledPlugin): Promise<void> => {
    setWorking(true)
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
      setWorking(false)
    }
  }

  const removePlugin = async (plugin: InstalledPlugin): Promise<void> => {
    if (!window.confirm(`${t('removeConfirm')}\n\n${plugin.packageName}`)) return
    setWorking(true)
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
      setWorking(false)
    }
  }

  const isInstalled = (repository: Repository): boolean => {
    if (selectedSummary === undefined) return false
    const fullName = repository.fullName.toLocaleLowerCase()
    return selectedSummary.installedRepositories.includes(fullName)
  }

  return (
    <div className={css.root} aria-busy={loading || working}>
      <section className={css.profileBar} aria-label={t('currentProfile')}>
        <label>
          <span className={css.visuallyHidden}>{t('currentProfile')}</span>
          <select value={selectedProfile} onChange={event => setSelectedProfile(event.currentTarget.value)} disabled={profiles.length === 0 || working}>
            {profiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name}</option>)}
          </select>
        </label>
        <button type="button" className={css.secondaryButton} disabled={working || selectedSummary?.webCapable !== true} onClick={() => void openProfile()}>{t('openProfile')}</button>
        <label className={css.newProfile}>
          <span className={css.newProfileLabel}>{t('newProfile')}</span>
          <input value={newProfile} placeholder={t('newProfilePlaceholder')} onChange={event => setNewProfile(event.currentTarget.value)} disabled={working} />
        </label>
        <button type="button" className={css.secondaryButton} disabled={working || newProfile.trim().length === 0} onClick={() => void createProfile()}>{t('createAndOpen')}</button>
      </section>

      <form className={css.search} onSubmit={event => { event.preventDefault(); void load(query, false, true) }}>
        <input value={query} type="search" placeholder={t('search')} aria-label={t('search')} onChange={event => setQuery(event.currentTarget.value)} />
        <select
          className={css.sortSelect}
          value={sortBy}
          aria-label={t('sort')}
          title={t('sort')}
          disabled={working || plugins.length === 0}
          onChange={event => setSortBy(event.currentTarget.value as CatalogSortKey)}
        >
          <option value="updated">{t('sortUpdated')}</option>
          <option value="name">{t('sortName')}</option>
          <option value="stars">{t('sortStars')}</option>
        </select>
        <button
          type="button"
          className={css.sortDirection}
          disabled={working || plugins.length === 0}
          onClick={() => setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc')}
          aria-label={sortDirection === 'asc' ? t('sortToggleToDesc') : t('sortToggleToAsc')}
          title={sortDirection === 'asc' ? t('sortAsc') : t('sortDesc')}
        >
          <span aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>
        </button>
        <button type="submit" className={css.secondaryButton} disabled={loading || working}>{t('refresh')}</button>
      </form>

      {message !== null ? <p className={message.kind === 'error' ? css.error : css.success} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p> : null}
      {message?.kind === 'success' ? (
        restartAvailable
          ? <button type="button" className={css.primaryButton} disabled={working} onClick={() => void restartDsh()}>{t('restartNow')}</button>
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
                    ? <button type="button" className={css.primaryButton} disabled={working} onClick={() => void updatePlugin(plugin)}>{working ? t('updating') : t('update')}</button>
                    : <span className={css.installedTag}>{plugin.updateStatus === 'up-to-date' ? t('upToDate') : t('updateUnknown')}</span>}
                  <button type="button" className={css.secondaryButton} disabled={working} onClick={() => void removePlugin(plugin)}>{working ? t('removing') : t('remove')}</button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {candidate !== null ? (
        <section className={css.review} aria-live="polite">
          <div className={css.reviewHeading}>
            <div>
              <strong>{candidate.repository.fullName}</strong>
              <p>{candidate.description ?? t('noDescription')}</p>
            </div>
            <button type="button" className={css.textButton} disabled={working} onClick={() => setCandidate(null)}>{t('close')}</button>
          </div>
          {candidate.validBundle ? (
            <>
              <dl className={css.details}>
                <div><dt>{t('bundleVersion')}</dt><dd>{candidate.version ?? '—'}</dd></div>
                <div><dt>{t('source')}</dt><dd>{t('sourceGithub')}</dd></div>
              </dl>
              {candidate.requiresBuildApproval ? (
                <label className={css.permission}><input type="checkbox" checked={allowBuild} onChange={event => setAllowBuild(event.currentTarget.checked)} disabled={working} /><span>{t('buildPermission')}</span></label>
              ) : null}
              <div className={css.reviewActions}>
                <button type="button" className={css.primaryButton} disabled={working || (candidate.requiresBuildApproval && !allowBuild) || selectedProfile.length === 0} onClick={() => void install()}>{working ? t('installing') : t('install')}</button>
                <a href={candidate.repository.url} target="_blank" rel="noreferrer">{t('viewRepository')}</a>
              </div>
            </>
          ) : <p className={css.error}>{candidate.reason ?? t('invalidBundle')}</p>}
        </section>
      ) : null}

      {!loading && candidate === null && visiblePlugins.length === 0 ? <p className={css.status}>{t('empty')}</p> : null}
      {candidate === null && visiblePlugins.length > 0 ? (
        <section className={css.catalog} aria-label={t('tab')}>
          <ul className={css.rows}>
            {visiblePlugins.map(plugin => (
              <li key={plugin.fullName} className={css.row}>
                <div className={css.rowMain}>
                  <a href={plugin.url} target="_blank" rel="noreferrer" className={css.repository}>{plugin.fullName}</a>
                  <p>{plugin.description ?? t('noDescription')}</p>
                  <span>{t('stars')} {plugin.stars} · {t('updated')} {updated(plugin.updatedAt, t('dateLocale'))}{plugin.language === null ? '' : ` · ${plugin.language}`}</span>
                </div>
                {isInstalled(plugin)
                  ? <span className={css.installedTag}>{t('installedPlugin')}</span>
                  : <button type="button" className={css.secondaryButton} disabled={working} onClick={() => void inspect(plugin)}>{working ? t('inspecting') : t('install')}</button>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
