import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment, useEffect, useMemo, useState } from 'react';
import { normalizeCatalogQuery, sortCatalog } from '../marketplace.js';
import css from './PluginMarketplaceSettingsTab.module.css';
class MarketplaceRequestError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
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
        throw new MarketplaceRequestError(body.error?.code, body.error?.message ?? `Request failed (${response.status})`);
    return body;
}
function updated(value, locale) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}
/** Client-side catalog cache lifetime, kept in sync with the server cache. */
const CATALOG_CACHE_TTL_MS = 12 * 60_000;
const CATALOG_CACHE_MAX_ENTRIES = 24;
const catalogCache = new Map();
function readCatalogCache(query) {
    const normalized = normalizeCatalogQuery(query);
    const entry = catalogCache.get(normalized);
    if (entry === undefined)
        return null;
    if (Date.now() - entry.fetchedAt > CATALOG_CACHE_TTL_MS) {
        catalogCache.delete(normalized);
        return null;
    }
    return entry.plugins;
}
function writeCatalogCache(query, plugins) {
    const now = Date.now();
    const normalized = normalizeCatalogQuery(query);
    for (const [key, entry] of catalogCache) {
        if (now - entry.fetchedAt > CATALOG_CACHE_TTL_MS)
            catalogCache.delete(key);
    }
    if (!catalogCache.has(normalized) && catalogCache.size >= CATALOG_CACHE_MAX_ENTRIES) {
        const oldest = catalogCache.keys().next().value;
        if (oldest !== undefined)
            catalogCache.delete(oldest);
    }
    catalogCache.set(normalized, { fetchedAt: now, plugins });
}
/** Marketplace UI: direct installation from a compact repository list. */
export function PluginMarketplaceSettingsTab({ t }) {
    const [snapshot, setSnapshot] = useState(null);
    const [plugins, setPlugins] = useState([]);
    const [query, setQuery] = useState('');
    const [selectedProfile, setSelectedProfile] = useState('');
    const [selectedRelease, setSelectedRelease] = useState({});
    const [releaseChoices, setReleaseChoices] = useState({});
    const [showReleaseChoices, setShowReleaseChoices] = useState({});
    const [sourceConsent, setSourceConsent] = useState({});
    const [sourceBuildAllowed, setSourceBuildAllowed] = useState({});
    const [loading, setLoading] = useState(true);
    const [action, setAction] = useState(null);
    const [message, setMessage] = useState(null);
    const [restartAvailable, setRestartAvailable] = useState(false);
    const [newProfile, setNewProfile] = useState('');
    const [sortBy, setSortBy] = useState('updated');
    const [sortDirection, setSortDirection] = useState('desc');
    const load = async (search = query, preserveMessage = false, bypassCache = false) => {
        setLoading(true);
        if (!preserveMessage)
            setMessage(null);
        try {
            const normalizedSearch = normalizeCatalogQuery(search);
            const cached = bypassCache ? null : readCatalogCache(normalizedSearch);
            const catalogPromise = cached === null
                ? api(`/plugins?query=${encodeURIComponent(normalizedSearch)}${bypassCache ? '&refresh=1' : ''}`).then(result => {
                    writeCatalogCache(normalizedSearch, result.plugins);
                    return result.plugins;
                })
                : Promise.resolve(cached);
            const [state, catalog] = await Promise.all([api('/state'), catalogPromise]);
            setSnapshot(state);
            setSelectedProfile(current => current || state.currentProfile);
            setPlugins(catalog);
        }
        catch (error) {
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('loadFailed') });
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => { void load(''); }, []);
    const profiles = snapshot?.profiles ?? [];
    const selectedSummary = profiles.find(profile => profile.name === selectedProfile);
    const visiblePlugins = useMemo(() => sortCatalog(plugins, sortBy, sortDirection), [plugins, sortBy, sortDirection]);
    const updatableCount = selectedSummary?.installedPlugins.filter(plugin => plugin.updateStatus === 'available').length ?? 0;
    const actionIs = (value) => action === value;
    const isWorking = action !== null;
    const install = async (repository) => {
        const actionKey = `install:${repository.fullName}`;
        if (action !== null)
            return;
        setAction(actionKey);
        setRestartAvailable(false);
        setMessage(null);
        try {
            const releaseTag = selectedRelease[repository.fullName];
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
                setMessage({ kind: 'error', text });
            }
        }
        finally {
            setAction(null);
        }
    };
    const loadReleaseChoices = async (repository) => {
        const key = repository.fullName;
        if (action !== null)
            return;
        setShowReleaseChoices(current => ({ ...current, [key]: !current[key] }));
        if (releaseChoices[key] !== undefined)
            return;
        const actionKey = `versions:${key}`;
        setAction(actionKey);
        try {
            const result = await api(`/plugin/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`);
            if (!result.plugin.validBundle || result.plugin.installSource !== 'release' || result.plugin.releases.length === 0) {
                setMessage({ kind: 'error', text: result.plugin.reason ?? t('releaseChoicesUnavailable') });
                setReleaseChoices(current => ({ ...current, [key]: [] }));
                return;
            }
            setReleaseChoices(current => ({ ...current, [key]: result.plugin.releases }));
            setSelectedRelease(current => current[key] === undefined && result.plugin.release !== null
                ? { ...current, [key]: result.plugin.release.tag }
                : current);
        }
        catch (error) {
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('releaseChoicesUnavailable') });
        }
        finally {
            setAction(null);
        }
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
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('profileFailed') });
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
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('profileFailed') });
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
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('profileFailed') });
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
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('updateFailed') });
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
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('removeFailed') });
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
    return (_jsxs("div", { className: css.root, "aria-busy": loading || isWorking, children: [_jsxs("section", { className: css.profileBar, "aria-label": t('currentProfile'), children: [_jsxs("label", { children: [_jsx("span", { className: css.visuallyHidden, children: t('currentProfile') }), _jsx("select", { value: selectedProfile, onChange: event => setSelectedProfile(event.currentTarget.value), disabled: profiles.length === 0 || isWorking, children: profiles.map(profile => _jsx("option", { value: profile.name, children: profile.name }, profile.name)) })] }), _jsx("button", { type: "button", className: css.secondaryButton, disabled: isWorking || selectedSummary?.webCapable !== true, onClick: () => void openProfile(), children: actionIs('open-profile') ? t('openingProfile') : t('openProfile') }), _jsxs("label", { className: css.newProfile, children: [_jsx("span", { className: css.newProfileLabel, children: t('newProfile') }), _jsx("input", { value: newProfile, placeholder: t('newProfilePlaceholder'), onChange: event => setNewProfile(event.currentTarget.value), disabled: isWorking })] }), _jsx("button", { type: "button", className: css.secondaryButton, disabled: isWorking || newProfile.trim().length === 0, onClick: () => void createProfile(), children: actionIs('create-profile') ? t('creatingProfile') : t('createAndOpen') })] }), _jsxs("form", { className: css.search, onSubmit: event => { event.preventDefault(); void load(query, false, true); }, children: [_jsx("input", { value: query, type: "search", placeholder: t('search'), "aria-label": t('search'), onChange: event => setQuery(event.currentTarget.value) }), _jsxs("select", { className: css.sortSelect, value: sortBy, "aria-label": t('sort'), title: t('sort'), disabled: isWorking || plugins.length === 0, onChange: event => setSortBy(event.currentTarget.value), children: [_jsx("option", { value: "updated", children: t('sortUpdated') }), _jsx("option", { value: "name", children: t('sortName') }), _jsx("option", { value: "stars", children: t('sortStars') })] }), _jsx("button", { type: "button", className: css.sortDirection, disabled: isWorking || plugins.length === 0, onClick: () => setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc'), "aria-label": sortDirection === 'asc' ? t('sortToggleToDesc') : t('sortToggleToAsc'), title: sortDirection === 'asc' ? t('sortAsc') : t('sortDesc'), children: _jsx("span", { "aria-hidden": "true", children: sortDirection === 'asc' ? '↑' : '↓' }) }), _jsx("button", { type: "submit", className: css.secondaryButton, disabled: loading || isWorking, children: t('refresh') })] }), message !== null ? _jsx("p", { className: message.kind === 'error' ? css.error : css.success, role: message.kind === 'error' ? 'alert' : 'status', children: message.text }) : null, message?.kind === 'success' ? (restartAvailable
                ? _jsx("button", { type: "button", className: css.primaryButton, disabled: isWorking, onClick: () => void restartDsh(), children: actionIs('restart') ? t('restarting') : t('restartNow') })
                : _jsx("p", { className: css.status, children: t('restartUnavailable') })) : null, loading ? _jsx("p", { className: css.status, children: t('loading') }) : null, selectedSummary !== undefined && selectedSummary.installedPlugins.length > 0 ? (_jsxs("details", { className: css.installed, open: updatableCount > 0, children: [_jsxs("summary", { className: css.installedSummary, children: [_jsx("span", { className: css.installedTitle, children: t('installedPlugins') }), _jsxs("span", { className: css.installedBadge, children: [selectedSummary.installedPlugins.length, " ", t('installedCount')] }), updatableCount > 0 ? _jsxs("span", { className: css.updateBadge, children: [updatableCount, " ", t('updateAvailable')] }) : null] }), _jsx("p", { className: css.installedHint, children: t('installedPluginsHint') }), _jsx("ul", { className: css.rows, children: selectedSummary.installedPlugins.map(plugin => (_jsxs("li", { className: css.row, children: [_jsxs("div", { className: css.rowMain, children: [_jsx("a", { href: `https://github.com/${plugin.repository}`, target: "_blank", rel: "noreferrer", className: css.repository, children: plugin.repository }), _jsx("span", { children: plugin.installedVersion === null ? plugin.packageName : `${plugin.packageName} · v${plugin.installedVersion}` })] }), _jsxs("div", { className: css.rowActions, children: [plugin.updateStatus === 'available'
                                            ? _jsx("button", { type: "button", className: css.primaryButton, disabled: isWorking, onClick: () => void updatePlugin(plugin), children: actionIs(`update:${plugin.packageName}`) ? t('updating') : t('update') })
                                            : _jsx("span", { className: css.installedTag, children: plugin.updateStatus === 'up-to-date' ? t('upToDate') : t('updateUnknown') }), _jsx("button", { type: "button", className: css.secondaryButton, disabled: isWorking, onClick: () => void removePlugin(plugin), children: actionIs(`remove:${plugin.packageName}`) ? t('removing') : t('remove') })] })] }, plugin.packageName))) })] })) : null, !loading && visiblePlugins.length === 0 ? _jsx("p", { className: css.status, children: t('empty') }) : null, visiblePlugins.length > 0 ? (_jsx("section", { className: css.catalog, "aria-label": t('tab'), children: _jsx("ul", { className: css.rows, children: visiblePlugins.map(plugin => (_jsxs(Fragment, { children: [_jsxs("li", { className: css.row, children: [_jsxs("div", { className: css.rowMain, children: [_jsx("a", { href: plugin.url, target: "_blank", rel: "noreferrer", className: css.repository, children: plugin.fullName }), _jsx("p", { children: plugin.description ?? t('noDescription') }), _jsxs("span", { children: [t('stars'), " ", plugin.stars, " \u00B7 ", t('updated'), " ", updated(plugin.updatedAt, t('dateLocale')), plugin.language === null ? '' : ` · ${plugin.language}`] })] }), _jsxs("div", { className: css.rowActions, children: [isInstalled(plugin)
                                                ? _jsx("span", { className: css.installedTag, children: t('installedPlugin') })
                                                : _jsx("button", { type: "button", className: css.secondaryButton, disabled: isWorking || selectedProfile.length === 0, onClick: () => void install(plugin), children: actionIs(`install:${plugin.fullName}`) ? t('installing') : t('install') }), !isInstalled(plugin) ? _jsx("button", { type: "button", className: css.textButton, disabled: isWorking, onClick: () => void loadReleaseChoices(plugin), children: actionIs(`versions:${plugin.fullName}`) ? t('loadingVersions') : t('chooseVersion') }) : null] })] }), showReleaseChoices[plugin.fullName] === true ? (_jsx("li", { className: css.versionRow, children: releaseChoices[plugin.fullName] === undefined
                                    ? _jsx("span", { className: css.status, children: t('loadingVersions') })
                                    : (releaseChoices[plugin.fullName]?.length ?? 0) === 0
                                        ? _jsx("span", { className: css.status, children: t('releaseChoicesUnavailable') })
                                        : _jsxs("label", { className: css.versionPicker, children: [_jsx("span", { children: t('installVersion') }), _jsx("select", { value: selectedRelease[plugin.fullName] ?? '', disabled: isWorking, onChange: event => setSelectedRelease(current => ({ ...current, [plugin.fullName]: event.currentTarget.value })), children: (releaseChoices[plugin.fullName] ?? []).map(release => _jsx("option", { value: release.tag, children: release.tag }, release.tag)) })] }) })) : null, sourceConsent[plugin.fullName] === true ? (_jsx("li", { className: css.versionRow, children: _jsxs("label", { className: css.sourceApproval, children: [_jsx("input", { type: "checkbox", checked: sourceBuildAllowed[plugin.fullName] === true, disabled: isWorking, onChange: event => setSourceBuildAllowed(current => ({ ...current, [plugin.fullName]: event.currentTarget.checked })) }), _jsx("span", { children: t('sourceBuildApproval') }), _jsx("button", { type: "button", className: css.primaryButton, disabled: isWorking || sourceBuildAllowed[plugin.fullName] !== true, onClick: () => void install(plugin), children: actionIs(`install:${plugin.fullName}`) ? t('installing') : t('install') })] }) })) : null] }, plugin.fullName))) }) })) : null] }));
}
