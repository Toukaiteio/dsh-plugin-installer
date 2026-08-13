import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { normalizeCatalogQuery, sortCatalog } from '../marketplace.js';
import css from './PluginMarketplaceSettingsTab.module.css';
async function api(path, init) {
    const response = await fetch(`/dsh-plugin-installer/api${path}`, {
        ...init,
        headers: { ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }), ...init?.headers },
        credentials: 'same-origin',
    });
    const body = await response.json();
    if (!response.ok)
        throw new Error(body.error?.message ?? `Request failed (${response.status})`);
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
/** Marketplace UI: one toolbar, one inline review panel and a compact repository list. */
export function PluginMarketplaceSettingsTab({ t }) {
    const [snapshot, setSnapshot] = useState(null);
    const [plugins, setPlugins] = useState([]);
    const [query, setQuery] = useState('');
    const [selectedProfile, setSelectedProfile] = useState('');
    const [candidate, setCandidate] = useState(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [allowBuild, setAllowBuild] = useState(false);
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
    const inspect = async (repository) => {
        setWorking(true);
        setCandidate(null);
        setAllowBuild(false);
        setRestartAvailable(false);
        setMessage(null);
        try {
            const result = await api(`/plugin/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`);
            setCandidate(result.plugin);
        }
        catch (error) {
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('installFailed') });
        }
        finally {
            setWorking(false);
        }
    };
    const install = async () => {
        if (candidate === null || !candidate.validBundle)
            return;
        setWorking(true);
        setMessage(null);
        setRestartAvailable(false);
        try {
            const result = await api('/install', {
                method: 'POST',
                body: JSON.stringify({ profile: selectedProfile, owner: candidate.repository.owner, repository: candidate.repository.name, allowBuild }),
            });
            await load(query, true);
            setMessage({ kind: 'success', text: t('installed') });
            setRestartAvailable(result.restartAvailable);
            setCandidate(null);
        }
        catch (error) {
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('installFailed') });
        }
        finally {
            setWorking(false);
        }
    };
    const openProfile = async () => {
        if (selectedSummary?.webCapable !== true)
            return;
        setWorking(true);
        setMessage(null);
        try {
            const result = await api('/switch', { method: 'POST', body: JSON.stringify({ profile: selectedProfile }) });
            window.location.assign(result.url);
        }
        catch (error) {
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('profileFailed') });
            setWorking(false);
        }
    };
    const createProfile = async () => {
        if (newProfile.trim().length === 0)
            return;
        setWorking(true);
        setMessage(null);
        try {
            const result = await api('/profiles', { method: 'POST', body: JSON.stringify({ name: newProfile.trim() }) });
            window.location.assign(result.url);
        }
        catch (error) {
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('profileFailed') });
            setWorking(false);
        }
    };
    const restartDsh = async () => {
        setWorking(true);
        setMessage(null);
        try {
            const result = await api('/restart', { method: 'POST', body: JSON.stringify({ profile: selectedProfile }) });
            window.location.assign(result.url);
        }
        catch (error) {
            setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('profileFailed') });
            setWorking(false);
        }
    };
    const updatePlugin = async (plugin) => {
        setWorking(true);
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
            setWorking(false);
        }
    };
    const removePlugin = async (plugin) => {
        if (!window.confirm(`${t('removeConfirm')}\n\n${plugin.packageName}`))
            return;
        setWorking(true);
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
            setWorking(false);
        }
    };
    const isInstalled = (repository) => {
        if (selectedSummary === undefined)
            return false;
        const fullName = repository.fullName.toLocaleLowerCase();
        return selectedSummary.installedRepositories.includes(fullName);
    };
    return (_jsxs("div", { className: css.root, "aria-busy": loading || working, children: [_jsxs("section", { className: css.profileBar, "aria-label": t('currentProfile'), children: [_jsxs("label", { children: [_jsx("span", { className: css.visuallyHidden, children: t('currentProfile') }), _jsx("select", { value: selectedProfile, onChange: event => setSelectedProfile(event.currentTarget.value), disabled: profiles.length === 0 || working, children: profiles.map(profile => _jsx("option", { value: profile.name, children: profile.name }, profile.name)) })] }), _jsx("button", { type: "button", className: css.secondaryButton, disabled: working || selectedSummary?.webCapable !== true, onClick: () => void openProfile(), children: t('openProfile') }), _jsxs("label", { className: css.newProfile, children: [_jsx("span", { className: css.newProfileLabel, children: t('newProfile') }), _jsx("input", { value: newProfile, placeholder: t('newProfilePlaceholder'), onChange: event => setNewProfile(event.currentTarget.value), disabled: working })] }), _jsx("button", { type: "button", className: css.secondaryButton, disabled: working || newProfile.trim().length === 0, onClick: () => void createProfile(), children: t('createAndOpen') })] }), _jsxs("form", { className: css.search, onSubmit: event => { event.preventDefault(); void load(query, false, true); }, children: [_jsx("input", { value: query, type: "search", placeholder: t('search'), "aria-label": t('search'), onChange: event => setQuery(event.currentTarget.value) }), _jsx("button", { type: "submit", className: css.secondaryButton, disabled: loading || working, children: t('refresh') })] }), plugins.length > 0 ? (_jsxs("div", { className: css.sortBar, children: [_jsxs("label", { className: css.sortLabel, children: [_jsx("span", { children: t('sort') }), _jsxs("select", { value: sortBy, "aria-label": t('sort'), disabled: working, onChange: event => setSortBy(event.currentTarget.value), children: [_jsx("option", { value: "updated", children: t('sortUpdated') }), _jsx("option", { value: "name", children: t('sortName') }), _jsx("option", { value: "stars", children: t('sortStars') })] })] }), _jsx("button", { type: "button", className: css.secondaryButton, disabled: working, onClick: () => setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc'), "aria-label": sortDirection === 'asc' ? t('sortDesc') : t('sortAsc'), "aria-pressed": sortDirection === 'asc', children: sortDirection === 'asc' ? t('sortAsc') : t('sortDesc') })] })) : null, message !== null ? _jsx("p", { className: message.kind === 'error' ? css.error : css.success, role: message.kind === 'error' ? 'alert' : 'status', children: message.text }) : null, message?.kind === 'success' ? (restartAvailable
                ? _jsx("button", { type: "button", className: css.primaryButton, disabled: working, onClick: () => void restartDsh(), children: t('restartNow') })
                : _jsx("p", { className: css.status, children: t('restartUnavailable') })) : null, loading ? _jsx("p", { className: css.status, children: t('loading') }) : null, selectedSummary !== undefined && selectedSummary.installedPlugins.length > 0 ? (_jsxs("section", { className: css.installed, "aria-label": t('installedPlugins'), children: [_jsxs("div", { className: css.sectionHeading, children: [_jsx("h2", { children: t('installedPlugins') }), _jsx("p", { children: t('installedPluginsHint') })] }), _jsx("ul", { className: css.rows, children: selectedSummary.installedPlugins.map(plugin => (_jsxs("li", { className: css.row, children: [_jsxs("div", { className: css.rowMain, children: [_jsx("a", { href: `https://github.com/${plugin.repository}`, target: "_blank", rel: "noreferrer", className: css.repository, children: plugin.repository }), _jsx("span", { children: plugin.installedVersion === null ? plugin.packageName : `${plugin.packageName} · v${plugin.installedVersion}` })] }), _jsxs("div", { className: css.rowActions, children: [plugin.updateStatus === 'available'
                                            ? _jsx("button", { type: "button", className: css.primaryButton, disabled: working, onClick: () => void updatePlugin(plugin), children: working ? t('updating') : t('update') })
                                            : _jsx("span", { className: css.installedTag, children: plugin.updateStatus === 'up-to-date' ? t('upToDate') : t('updateUnknown') }), _jsx("button", { type: "button", className: css.secondaryButton, disabled: working, onClick: () => void removePlugin(plugin), children: working ? t('removing') : t('remove') })] })] }, plugin.packageName))) })] })) : null, candidate !== null ? (_jsxs("section", { className: css.review, "aria-live": "polite", children: [_jsxs("div", { className: css.reviewHeading, children: [_jsxs("div", { children: [_jsx("strong", { children: candidate.repository.fullName }), _jsx("p", { children: candidate.description ?? t('noDescription') })] }), _jsx("button", { type: "button", className: css.textButton, disabled: working, onClick: () => setCandidate(null), children: t('close') })] }), candidate.validBundle ? (_jsxs(_Fragment, { children: [_jsxs("dl", { className: css.details, children: [_jsxs("div", { children: [_jsx("dt", { children: t('bundleVersion') }), _jsx("dd", { children: candidate.version ?? '—' })] }), _jsxs("div", { children: [_jsx("dt", { children: t('source') }), _jsx("dd", { children: t('sourceGithub') })] })] }), candidate.requiresBuildApproval ? (_jsxs("label", { className: css.permission, children: [_jsx("input", { type: "checkbox", checked: allowBuild, onChange: event => setAllowBuild(event.currentTarget.checked), disabled: working }), _jsx("span", { children: t('buildPermission') })] })) : null, _jsxs("div", { className: css.reviewActions, children: [_jsx("button", { type: "button", className: css.primaryButton, disabled: working || (candidate.requiresBuildApproval && !allowBuild) || selectedProfile.length === 0, onClick: () => void install(), children: working ? t('installing') : t('install') }), _jsx("a", { href: candidate.repository.url, target: "_blank", rel: "noreferrer", children: t('viewRepository') })] })] })) : _jsx("p", { className: css.error, children: candidate.reason ?? t('invalidBundle') })] })) : null, !loading && candidate === null && visiblePlugins.length === 0 ? _jsx("p", { className: css.status, children: t('empty') }) : null, candidate === null && visiblePlugins.length > 0 ? (_jsx("section", { className: css.catalog, "aria-label": t('tab'), children: _jsx("ul", { className: css.rows, children: visiblePlugins.map(plugin => (_jsxs("li", { className: css.row, children: [_jsxs("div", { className: css.rowMain, children: [_jsx("a", { href: plugin.url, target: "_blank", rel: "noreferrer", className: css.repository, children: plugin.fullName }), _jsx("p", { children: plugin.description ?? t('noDescription') }), _jsxs("span", { children: [t('stars'), " ", plugin.stars, " \u00B7 ", t('updated'), " ", updated(plugin.updatedAt, t('dateLocale')), plugin.language === null ? '' : ` · ${plugin.language}`] })] }), isInstalled(plugin)
                                ? _jsx("span", { className: css.installedTag, children: t('installedPlugin') })
                                : _jsx("button", { type: "button", className: css.secondaryButton, disabled: working, onClick: () => void inspect(plugin), children: working ? t('inspecting') : t('install') })] }, plugin.fullName))) }) })) : null] }));
}
