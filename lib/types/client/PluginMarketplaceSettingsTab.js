import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeCatalogQuery, sortCatalog } from '../marketplace.js';
import css from './PluginMarketplaceSettingsTab.module.css';
class MarketplaceRequestError extends Error {
    code;
    hint;
    command;
    constructor(code, message, hint, command) {
        super(message);
        this.code = code;
        this.hint = hint;
        this.command = command;
    }
}
async function api(path, init) {
    const response = await fetch(`/dsh-plugin-installer/api${path}`, {
        ...init,
        headers: { ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }), ...init?.headers },
        credentials: 'same-origin',
    });
    const body = await response.json();
    if (!response.ok)
        throw new MarketplaceRequestError(body.error?.code, body.error?.message ?? `Request failed (${response.status})`, body.error?.hint, body.error?.command);
    return body;
}
function errorMessage(error, fallback) {
    if (error instanceof MarketplaceRequestError)
        return { text: error.message, hint: error.hint, command: error.command };
    return { text: error instanceof Error ? error.message : fallback };
}
function updated(value, locale) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}
/** Client-side catalog cache lifetime, kept in sync with the server cache. */
const CATALOG_CACHE_TTL_MS = 12 * 60_000;
const CATALOG_CACHE_MAX_ENTRIES = 48;
const catalogCache = new Map();
function catalogCacheKey(query, sort, direction, page) {
    return `${sort}:${direction}:${page}:${encodeURIComponent(normalizeCatalogQuery(query))}`;
}
function readCatalogCache(query, sort, direction, page) {
    const entry = catalogCache.get(catalogCacheKey(query, sort, direction, page));
    if (entry === undefined)
        return null;
    if (Date.now() - entry.fetchedAt > CATALOG_CACHE_TTL_MS) {
        catalogCache.delete(catalogCacheKey(query, sort, direction, page));
        return null;
    }
    return entry.page;
}
function writeCatalogCache(query, sort, direction, page, value) {
    const now = Date.now();
    const key = catalogCacheKey(query, sort, direction, page);
    for (const [key, entry] of catalogCache) {
        if (now - entry.fetchedAt > CATALOG_CACHE_TTL_MS)
            catalogCache.delete(key);
    }
    if (!catalogCache.has(key) && catalogCache.size >= CATALOG_CACHE_MAX_ENTRIES) {
        const oldest = catalogCache.keys().next().value;
        if (oldest !== undefined)
            catalogCache.delete(oldest);
    }
    catalogCache.set(key, { fetchedAt: now, page: value });
}
function clearCatalogCache(query, sort, direction) {
    const suffix = `:${encodeURIComponent(normalizeCatalogQuery(query))}`;
    const prefix = `${sort}:${direction}:`;
    for (const key of catalogCache.keys()) {
        if (key.startsWith(prefix) && key.endsWith(suffix))
            catalogCache.delete(key);
    }
}
function mergeCatalog(current, next) {
    const seen = new Set(current.map(plugin => plugin.fullName.toLocaleLowerCase()));
    return [...current, ...next.filter(plugin => {
            const key = plugin.fullName.toLocaleLowerCase();
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        })];
}
/** Marketplace UI: direct installation from a compact repository list. */
export function PluginMarketplaceSettingsTab({ t }) {
    const [snapshot, setSnapshot] = useState(null);
    const [githubConfig, setGithubConfig] = useState(null);
    const [githubToken, setGithubToken] = useState('');
    const [plugins, setPlugins] = useState([]);
    const [query, setQuery] = useState('');
    const [selectedProfile, setSelectedProfile] = useState('');
    const [releaseDialog, setReleaseDialog] = useState(null);
    const [sourceConsent, setSourceConsent] = useState({});
    const [sourceBuildAllowed, setSourceBuildAllowed] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [catalogPage, setCatalogPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loadMoreFailed, setLoadMoreFailed] = useState(false);
    const [action, setAction] = useState(null);
    const [message, setMessage] = useState(null);
    const [restartAvailable, setRestartAvailable] = useState(false);
    const [newProfile, setNewProfile] = useState('');
    const [sortBy, setSortBy] = useState('updated');
    const [sortDirection, setSortDirection] = useState('desc');
    const loadMoreRef = useRef(null);
    const load = async (search = query, preserveMessage = false, bypassCache = false, page = 1, requestedSort = sortBy, requestedDirection = sortDirection) => {
        if (page === 1) {
            setLoading(true);
            setCatalogPage(0);
            setHasMore(false);
            setLoadMoreFailed(false);
        }
        else {
            setLoadingMore(true);
            setLoadMoreFailed(false);
        }
        if (!preserveMessage)
            setMessage(null);
        try {
            const normalizedSearch = normalizeCatalogQuery(search);
            if (bypassCache && page === 1)
                clearCatalogCache(normalizedSearch, requestedSort, requestedDirection);
            const cached = bypassCache ? null : readCatalogCache(normalizedSearch, requestedSort, requestedDirection, page);
            const catalogPromise = cached === null
                ? api(`/plugins?query=${encodeURIComponent(normalizedSearch)}&sort=${requestedSort}&order=${requestedDirection}&page=${page}${bypassCache ? '&refresh=1' : ''}`).then(result => {
                    writeCatalogCache(normalizedSearch, requestedSort, requestedDirection, page, result);
                    return result;
                })
                : Promise.resolve(cached);
            const [state, catalog] = await Promise.all([page === 1 ? api('/state') : Promise.resolve(null), catalogPromise]);
            if (state !== null) {
                setSnapshot(state);
                setSelectedProfile(current => current || state.currentProfile);
            }
            setPlugins(current => page === 1 ? catalog.plugins : mergeCatalog(current, catalog.plugins));
            setCatalogPage(page);
            setHasMore(catalog.hasMore);
        }
        catch (error) {
            setMessage({ kind: 'error', ...errorMessage(error, t('loadFailed')) });
            if (page > 1) {
                setHasMore(false);
                setLoadMoreFailed(true);
            }
        }
        finally {
            if (page === 1)
                setLoading(false);
            else
                setLoadingMore(false);
        }
    };
    const loadGithubConfig = async () => {
        try {
            setGithubConfig(await api('/config'));
        }
        catch {
            // The marketplace remains usable when an older backend does not expose this optional endpoint.
        }
    };
    useEffect(() => {
        void load('');
        void loadGithubConfig();
    }, []);
    const profiles = snapshot?.profiles ?? [];
    const selectedSummary = profiles.find(profile => profile.name === selectedProfile);
    const visiblePlugins = useMemo(() => sortCatalog(plugins, sortBy, sortDirection), [plugins, sortBy, sortDirection]);
    const updatableCount = selectedSummary?.installedPlugins.filter(plugin => plugin.updateStatus === 'available').length ?? 0;
    const loadNextPage = () => {
        if (loading || loadingMore || !hasMore)
            return;
        void load(query, true, false, catalogPage + 1);
    };
    useEffect(() => {
        const target = loadMoreRef.current;
        if (target === null || !hasMore)
            return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting))
                loadNextPage();
        }, { rootMargin: '480px 0px' });
        observer.observe(target);
        return () => observer.disconnect();
    }, [catalogPage, hasMore, loading, loadingMore, query, sortBy, sortDirection]);
    const actionIs = (value) => action === value;
    const isWorking = action !== null;
    const saveGithubToken = async () => {
        if (action !== null)
            return;
        setAction('github-config');
        setMessage(null);
        setRestartAvailable(false);
        try {
            const result = await api('/config', {
                method: 'POST',
                body: JSON.stringify({ githubToken }),
            });
            setGithubConfig(result);
            setGithubToken('');
            setMessage({ kind: 'success', text: t('githubTokenSaved') });
        }
        catch (error) {
            setMessage({ kind: 'error', ...errorMessage(error, t('githubTokenSaveFailed')) });
        }
        finally {
            setAction(null);
        }
    };
    const performInstall = async (repository, releaseTag) => {
        const actionKey = `install:${repository.fullName}`;
        setAction(actionKey);
        setRestartAvailable(false);
        setMessage(null);
        try {
            const result = await api('/install', {
                method: 'POST',
                body: JSON.stringify({
                    profile: selectedProfile,
                    owner: repository.owner,
                    repository: repository.name,
                    ...releaseTag === undefined ? {} : { releaseTag },
                    ...sourceBuildAllowed[repository.fullName] === true ? { allowBuild: true } : {},
                }),
            });
            await load(query, true);
            setMessage({ kind: 'success', text: result.installed.installSource === 'source' ? t('installedFromSource') : t('installed') });
            setRestartAvailable(result.restartAvailable);
        }
        catch (error) {
            const text = error instanceof Error ? error.message : t('installFailed');
            if (error instanceof MarketplaceRequestError && error.code === 'build-approval-required') {
                setMessage(null);
                setSourceConsent(current => ({ ...current, [repository.fullName]: true }));
            }
            else {
                setMessage({ kind: 'error', ...errorMessage(error, text) });
            }
        }
        finally {
            setAction(null);
        }
    };
    const beginInstall = async (repository) => {
        if (action !== null)
            return;
        setAction(`inspect:${repository.fullName}`);
        setMessage(null);
        try {
            const result = await api(`/plugin/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`);
            if (!result.plugin.validBundle) {
                throw new MarketplaceRequestError('not-a-bundle', result.plugin.reason ?? t('releaseChoicesUnavailable'));
            }
            if (result.plugin.installSource === 'release' && result.plugin.releases.length > 1) {
                const selectedTag = result.plugin.release?.tag ?? result.plugin.releases[0]?.tag;
                if (selectedTag === undefined)
                    throw new MarketplaceRequestError('release-unavailable', t('releaseChoicesUnavailable'));
                setReleaseDialog({ repository, releases: result.plugin.releases, selectedTag });
                return;
            }
            await performInstall(repository, result.plugin.installSource === 'release' ? result.plugin.release?.tag ?? undefined : undefined);
        }
        catch (error) {
            if (error instanceof MarketplaceRequestError && error.code === 'build-approval-required') {
                setSourceConsent(current => ({ ...current, [repository.fullName]: true }));
            }
            else {
                setMessage({ kind: 'error', ...errorMessage(error, t('installFailed')) });
            }
        }
        finally {
            setAction(null);
        }
    };
    const confirmReleaseInstall = () => {
        if (releaseDialog === null)
            return;
        const { repository, selectedTag } = releaseDialog;
        setReleaseDialog(null);
        void performInstall(repository, selectedTag);
    };
    const openProfile = async () => {
        if (selectedSummary?.webCapable !== true)
            return;
        setAction('open-profile');
        setMessage(null);
        try {
            const result = await api('/switch', { method: 'POST', body: JSON.stringify({ profile: selectedProfile }) });
            window.location.assign(result.url);
        }
        catch (error) {
            setMessage({ kind: 'error', ...errorMessage(error, t('profileFailed')) });
            setAction(null);
        }
    };
    const createProfile = async () => {
        if (newProfile.trim().length === 0)
            return;
        setAction('create-profile');
        setMessage(null);
        try {
            const result = await api('/profiles', { method: 'POST', body: JSON.stringify({ name: newProfile.trim() }) });
            window.location.assign(result.url);
        }
        catch (error) {
            setMessage({ kind: 'error', ...errorMessage(error, t('profileFailed')) });
            setAction(null);
        }
    };
    const restartDsh = async () => {
        setAction('restart');
        setMessage(null);
        try {
            const result = await api('/restart', { method: 'POST', body: JSON.stringify({ profile: selectedProfile }) });
            window.location.assign(result.url);
        }
        catch (error) {
            setMessage({ kind: 'error', ...errorMessage(error, t('profileFailed')) });
            setAction(null);
        }
    };
    const updatePlugin = async (plugin) => {
        const actionKey = `update:${plugin.packageName}`;
        if (action !== null)
            return;
        setAction(actionKey);
        setMessage(null);
        setRestartAvailable(false);
        try {
            const result = await api('/update', {
                method: 'POST',
                body: JSON.stringify({ profile: selectedProfile, packageName: plugin.packageName, owner: plugin.owner, repository: plugin.repositoryName }),
            });
            await load(query, true);
            setMessage({ kind: 'success', text: t('updatedPlugin') });
            setRestartAvailable(result.restartAvailable);
        }
        catch (error) {
            setMessage({ kind: 'error', ...errorMessage(error, t('updateFailed')) });
        }
        finally {
            setAction(null);
        }
    };
    const removePlugin = async (plugin) => {
        if (!window.confirm(`${t('removeConfirm')}\n\n${plugin.packageName}`))
            return;
        const actionKey = `remove:${plugin.packageName}`;
        if (action !== null)
            return;
        setAction(actionKey);
        setMessage(null);
        setRestartAvailable(false);
        try {
            const result = await api('/remove', {
                method: 'POST',
                body: JSON.stringify({ profile: selectedProfile, packageName: plugin.packageName }),
            });
            await load(query, true);
            setMessage({ kind: 'success', text: t('removedPlugin') });
            setRestartAvailable(result.restartAvailable);
        }
        catch (error) {
            setMessage({ kind: 'error', ...errorMessage(error, t('removeFailed')) });
        }
        finally {
            setAction(null);
        }
    };
    const isInstalled = (repository) => {
        if (selectedSummary === undefined)
            return false;
        const fullName = repository.fullName.toLocaleLowerCase();
        return selectedSummary.installedRepositories.includes(fullName);
    };
    return (_jsxs("div", { className: css.root, "aria-busy": loading || loadingMore || isWorking, children: [_jsxs("section", { className: css.profileBar, "aria-label": t('currentProfile'), children: [_jsxs("label", { children: [_jsx("span", { className: css.visuallyHidden, children: t('currentProfile') }), _jsx("select", { value: selectedProfile, onChange: event => setSelectedProfile(event.currentTarget.value), disabled: profiles.length === 0 || isWorking, children: profiles.map(profile => _jsx("option", { value: profile.name, children: profile.name }, profile.name)) })] }), _jsx("button", { type: "button", className: css.secondaryButton, disabled: isWorking || selectedSummary?.webCapable !== true, onClick: () => void openProfile(), children: actionIs('open-profile') ? t('openingProfile') : t('openProfile') }), _jsxs("label", { className: css.newProfile, children: [_jsx("span", { className: css.newProfileLabel, children: t('newProfile') }), _jsx("input", { value: newProfile, placeholder: t('newProfilePlaceholder'), onChange: event => setNewProfile(event.currentTarget.value), disabled: isWorking })] }), _jsx("button", { type: "button", className: css.secondaryButton, disabled: isWorking || newProfile.trim().length === 0, onClick: () => void createProfile(), children: actionIs('create-profile') ? t('creatingProfile') : t('createAndOpen') })] }), _jsxs("form", { className: css.search, onSubmit: event => { event.preventDefault(); void load(query, false, true); }, children: [_jsx("input", { value: query, type: "search", placeholder: t('search'), "aria-label": t('search'), onChange: event => setQuery(event.currentTarget.value) }), _jsxs("select", { className: css.sortSelect, value: sortBy, "aria-label": t('sort'), title: t('sort'), disabled: isWorking || loading || loadingMore, onChange: event => {
                            const nextSort = event.currentTarget.value;
                            if (nextSort === sortBy)
                                return;
                            setSortBy(nextSort);
                            setCatalogPage(0);
                            setHasMore(false);
                            void load(query, false, false, 1, nextSort, sortDirection);
                        }, children: [_jsx("option", { value: "updated", children: t('sortUpdated') }), _jsx("option", { value: "stars", children: t('sortStars') })] }), _jsx("button", { type: "button", className: css.sortDirection, disabled: isWorking || loading || loadingMore, onClick: () => {
                            const nextDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                            setSortDirection(nextDirection);
                            setCatalogPage(0);
                            setHasMore(false);
                            void load(query, false, false, 1, sortBy, nextDirection);
                        }, "aria-label": sortDirection === 'asc' ? t('sortToggleToDesc') : t('sortToggleToAsc'), title: sortDirection === 'asc' ? t('sortAsc') : t('sortDesc'), children: _jsx("span", { "aria-hidden": "true", children: sortDirection === 'asc' ? '↑' : '↓' }) }), _jsx("button", { type: "submit", className: css.secondaryButton, disabled: loading || loadingMore || isWorking, children: t('refresh') })] }), _jsxs("details", { className: css.githubSettings, children: [_jsxs("summary", { className: css.githubSettingsSummary, children: [_jsx("span", { children: t('githubSettings') }), _jsx("span", { className: css.githubTokenStatus, children: githubConfig === null
                                    ? t('loading')
                                    : githubConfig.source === 'saved'
                                        ? t('githubTokenStatusSaved')
                                        : githubConfig.source === 'environment'
                                            ? t('githubTokenStatusEnvironment')
                                            : t('githubTokenStatusMissing') })] }), _jsxs("div", { className: css.githubSettingsBody, children: [_jsx("p", { className: css.status, children: t('githubSettingsHint') }), _jsxs("label", { className: css.githubTokenField, children: [_jsx("span", { children: t('githubTokenLabel') }), _jsx("input", { type: "password", value: githubToken, autoComplete: "off", placeholder: t('githubTokenPlaceholder'), disabled: isWorking, onChange: event => setGithubToken(event.currentTarget.value) })] }), _jsx("button", { type: "button", className: css.secondaryButton, disabled: isWorking, onClick: () => void saveGithubToken(), children: actionIs('github-config') ? t('saving') : t('save') })] })] }), message !== null ? (_jsxs("div", { className: message.kind === 'error' ? css.error : css.success, role: message.kind === 'error' ? 'alert' : 'status', children: [_jsx("span", { children: message.text }), message.hint === undefined ? null : _jsx("span", { className: css.errorHint, children: message.hint }), message.command === undefined ? null : _jsx("code", { className: css.errorCommand, children: message.command })] })) : null, message?.kind === 'success' ? (restartAvailable
                ? _jsx("button", { type: "button", className: css.primaryButton, disabled: isWorking, onClick: () => void restartDsh(), children: actionIs('restart') ? t('restarting') : t('restartNow') })
                : _jsx("p", { className: css.status, children: t('restartUnavailable') })) : null, loading ? _jsx("p", { className: css.status, children: t('loading') }) : null, selectedSummary !== undefined && selectedSummary.installedPlugins.length > 0 ? (_jsxs("details", { className: css.installed, open: updatableCount > 0, children: [_jsxs("summary", { className: css.installedSummary, children: [_jsx("span", { className: css.installedTitle, children: t('installedPlugins') }), _jsxs("span", { className: css.installedBadge, children: [selectedSummary.installedPlugins.length, " ", t('installedCount')] }), updatableCount > 0 ? _jsxs("span", { className: css.updateBadge, children: [updatableCount, " ", t('updateAvailable')] }) : null] }), _jsx("p", { className: css.installedHint, children: t('installedPluginsHint') }), _jsx("ul", { className: css.rows, children: selectedSummary.installedPlugins.map(plugin => (_jsxs("li", { className: css.row, children: [_jsxs("div", { className: css.rowMain, children: [_jsx("a", { href: `https://github.com/${plugin.repository}`, target: "_blank", rel: "noreferrer", className: css.repository, children: plugin.repository }), _jsx("span", { children: plugin.installedVersion === null ? plugin.packageName : `${plugin.packageName} · v${plugin.installedVersion}` })] }), _jsxs("div", { className: css.rowActions, children: [plugin.updateStatus === 'available'
                                            ? _jsx("button", { type: "button", className: css.primaryButton, disabled: isWorking, onClick: () => void updatePlugin(plugin), children: actionIs(`update:${plugin.packageName}`) ? t('updating') : t('update') })
                                            : _jsx("span", { className: css.installedTag, children: plugin.updateStatus === 'up-to-date' ? t('upToDate') : t('updateUnknown') }), _jsx("button", { type: "button", className: css.secondaryButton, disabled: isWorking, onClick: () => void removePlugin(plugin), children: actionIs(`remove:${plugin.packageName}`) ? t('removing') : t('remove') })] })] }, plugin.packageName))) })] })) : null, !loading && visiblePlugins.length === 0 ? _jsx("p", { className: css.status, children: t('empty') }) : null, visiblePlugins.length > 0 ? (_jsxs("section", { className: css.catalog, "aria-label": t('tab'), children: [_jsx("ul", { className: css.rows, children: visiblePlugins.map(plugin => (_jsxs(Fragment, { children: [_jsxs("li", { className: css.row, children: [_jsxs("div", { className: css.rowMain, children: [_jsx("a", { href: plugin.url, target: "_blank", rel: "noreferrer", className: css.repository, children: plugin.fullName }), _jsx("p", { children: plugin.description ?? t('noDescription') }), _jsxs("span", { children: [t('stars'), " ", plugin.stars, " \u00B7 ", t('updated'), " ", updated(plugin.updatedAt, t('dateLocale')), plugin.language === null ? '' : ` · ${plugin.language}`] })] }), _jsxs("div", { className: css.rowActions, children: [isInstalled(plugin)
                                                    ? _jsx("span", { className: css.installedTag, children: t('installedPlugin') })
                                                    : null, !isInstalled(plugin) ? _jsx("button", { type: "button", className: css.secondaryButton, disabled: isWorking || selectedProfile.length === 0, onClick: () => void beginInstall(plugin), children: actionIs(`inspect:${plugin.fullName}`) ? t('checkingVersions') : actionIs(`install:${plugin.fullName}`) ? t('installing') : t('install') }) : null] })] }), sourceConsent[plugin.fullName] === true ? (_jsx("li", { className: css.versionRow, children: _jsxs("div", { className: css.sourceApproval, children: [_jsx("input", { type: "checkbox", checked: sourceBuildAllowed[plugin.fullName] === true, disabled: isWorking, onChange: event => setSourceBuildAllowed(current => ({ ...current, [plugin.fullName]: event.currentTarget.checked })) }), _jsx("span", { children: t('sourceBuildApproval') }), _jsx("button", { type: "button", className: css.primaryButton, disabled: isWorking || sourceBuildAllowed[plugin.fullName] !== true, onClick: () => void performInstall(plugin), children: actionIs(`install:${plugin.fullName}`) ? t('installing') : t('install') })] }) })) : null] }, plugin.fullName))) }), _jsx("div", { ref: loadMoreRef, className: css.loadMore, "aria-live": "polite", children: loadingMore
                            ? _jsx("span", { className: css.status, children: t('loadingMore') })
                            : loadMoreFailed
                                ? _jsx("span", { className: css.status, children: t('loadMoreFailed') })
                                : !hasMore
                                    ? _jsx("span", { className: css.status, children: t('catalogComplete') })
                                    : null })] })) : null, releaseDialog !== null ? (_jsx("div", { className: css.dialogBackdrop, onMouseDown: event => { if (event.target === event.currentTarget)
                    setReleaseDialog(null); }, children: _jsxs("div", { className: css.releaseDialog, role: "dialog", "aria-modal": "true", "aria-labelledby": "dsh-plugin-release-dialog-title", children: [_jsx("h2", { id: "dsh-plugin-release-dialog-title", children: t('releaseDialogTitle') }), _jsx("p", { children: t('releaseDialogDescription') }), _jsxs("label", { className: css.dialogField, children: [_jsx("span", { children: t('installVersion') }), _jsx("select", { value: releaseDialog.selectedTag, onChange: event => setReleaseDialog(current => current === null ? current : { ...current, selectedTag: event.currentTarget.value }), children: releaseDialog.releases.map(release => _jsx("option", { value: release.tag, children: release.tag }, release.tag)) })] }), _jsxs("div", { className: css.dialogActions, children: [_jsx("button", { type: "button", className: css.secondaryButton, onClick: () => setReleaseDialog(null), children: t('cancel') }), _jsx("button", { type: "button", className: css.primaryButton, onClick: confirmReleaseInstall, children: t('install') })] })] }) })) : null] }));
}
