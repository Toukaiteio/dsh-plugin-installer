window.__ModuleLoader__.load({ id: "dsh-plugin-installer", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");

//#region src/marketplace.ts
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
//#region \0dsh-plugin-installer-css:E:\pj2\dsh-plugin-installer\src\client\PluginMarketplaceSettingsTab.module.css.mjs
const css = ".Vb6T7a_root{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:16px;display:flex}.Vb6T7a_row p,.Vb6T7a_review p,.Vb6T7a_status,.Vb6T7a_error,.Vb6T7a_success{margin:0}.Vb6T7a_status{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.Vb6T7a_profileBar,.Vb6T7a_search,.Vb6T7a_reviewActions,.Vb6T7a_rowActions,.Vb6T7a_row,.Vb6T7a_reviewHeading{align-items:center;gap:10px;display:flex}.Vb6T7a_profileBar{flex-wrap:nowrap;min-width:0}.Vb6T7a_profileBar label,.Vb6T7a_newProfile{color:var(--dsw-alias-label-secondary);align-items:center;gap:7px;font-size:12px;line-height:18px;display:inline-flex}.Vb6T7a_profileBar select,.Vb6T7a_profileBar input,.Vb6T7a_search input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);height:34px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:7px;outline:none;padding:0 10px;font-size:13px}.Vb6T7a_profileBar input{width:128px}.Vb6T7a_newProfile{margin-left:auto}.Vb6T7a_newProfileLabel{white-space:nowrap}.Vb6T7a_search input{flex:1;min-width:0;height:36px}.Vb6T7a_githubSettings{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:9px}.Vb6T7a_githubSettingsSummary{color:var(--dsw-alias-label-primary);cursor:pointer;align-items:center;gap:8px;padding:10px 12px;font-size:13px;line-height:20px;list-style:none;display:flex}.Vb6T7a_githubSettingsSummary::-webkit-details-marker{display:none}.Vb6T7a_githubSettingsSummary:before{content:\"\";border-right:1.5px solid var(--dsw-alias-label-tertiary);border-bottom:1.5px solid var(--dsw-alias-label-tertiary);flex:none;width:6px;height:6px;transition:transform .15s;transform:rotate(-45deg)}.Vb6T7a_githubSettings[open] .Vb6T7a_githubSettingsSummary:before{transform:rotate(45deg)}.Vb6T7a_githubTokenStatus{color:var(--dsw-alias-label-tertiary);margin-left:auto;font-size:12px}.Vb6T7a_githubSettingsBody{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:10px;padding:10px 12px 12px;display:flex}.Vb6T7a_githubTokenField{color:var(--dsw-alias-label-secondary);flex-direction:column;gap:6px;font-size:12px;line-height:18px;display:flex}.Vb6T7a_githubTokenField input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:100%;height:34px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:7px;outline:none;padding:0 10px;font-size:13px}.Vb6T7a_githubTokenField input:focus-visible,.Vb6T7a_githubSettingsSummary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.Vb6T7a_githubSettingsBody .Vb6T7a_secondaryButton{align-self:flex-end}.Vb6T7a_profileBar select:focus-visible,.Vb6T7a_profileBar input:focus-visible,.Vb6T7a_search input:focus-visible,.Vb6T7a_secondaryButton:focus-visible,.Vb6T7a_primaryButton:focus-visible,.Vb6T7a_textButton:focus-visible,.Vb6T7a_row a:focus-visible,.Vb6T7a_review a:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.Vb6T7a_secondaryButton,.Vb6T7a_primaryButton,.Vb6T7a_textButton,.Vb6T7a_installedTag{font:inherit;cursor:pointer;border:0;border-radius:7px;font-size:13px;line-height:20px}.Vb6T7a_secondaryButton{border:1px solid var(--dsw-alias-border-l2);min-height:34px;color:var(--dsw-alias-label-primary);white-space:nowrap;background:0 0;padding:6px 11px}.Vb6T7a_secondaryButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.Vb6T7a_primaryButton{background:var(--dsw-alias-label-primary);min-height:36px;color:var(--dsw-alias-bg-layer-1);padding:7px 12px}.Vb6T7a_primaryButton:hover:not(:disabled){opacity:.9}.Vb6T7a_textButton{color:var(--dsw-alias-label-secondary);background:0 0;padding:4px}.Vb6T7a_installedTag{box-sizing:border-box;min-height:34px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;align-items:center;padding:6px 11px;display:inline-flex}.Vb6T7a_textButton:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.Vb6T7a_secondaryButton:disabled,.Vb6T7a_primaryButton:disabled,.Vb6T7a_textButton:disabled{opacity:.48;cursor:not-allowed}.Vb6T7a_error,.Vb6T7a_success{border-radius:7px;padding:9px 11px;font-size:13px;line-height:20px}.Vb6T7a_error{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent);color:var(--dsw-alias-state-error-primary);flex-direction:column;gap:6px;display:flex}.Vb6T7a_errorHint{color:var(--dsw-alias-label-secondary)}.Vb6T7a_errorCommand{box-sizing:border-box;overflow-wrap:anywhere;border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 24%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 6%, transparent);max-width:100%;color:inherit;white-space:pre-wrap;border-radius:4px;padding:4px 6px;font-family:ui-monospace,SFMono-Regular,Consolas,Liberation Mono,monospace;font-size:12px;line-height:18px;display:block}.Vb6T7a_success{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, transparent);color:var(--dsw-alias-state-success-primary)}.Vb6T7a_repository{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:20px}.Vb6T7a_catalog{flex-direction:column;gap:10px;display:flex}.Vb6T7a_loadMore{justify-content:center;align-items:center;min-height:20px;padding:2px 0;display:flex}.Vb6T7a_rows{border-top:1px solid var(--dsw-alias-border-l2);margin:0;padding:0;list-style:none}.Vb6T7a_row{border-bottom:1px solid var(--dsw-alias-border-l2);justify-content:space-between;align-items:flex-start;padding:13px 2px}.Vb6T7a_rowMain{min-width:0;padding-right:12px}.Vb6T7a_rowActions{flex:none;align-items:center}.Vb6T7a_repository{overflow-wrap:anywhere;text-decoration:none;display:inline-block}.Vb6T7a_repository:hover{text-decoration:underline}.Vb6T7a_row p{color:var(--dsw-alias-label-secondary);margin-top:3px;font-size:13px;line-height:19px}.Vb6T7a_row span{color:var(--dsw-alias-label-tertiary);margin-top:5px;font-size:11px;line-height:17px;display:block}.Vb6T7a_visuallyHidden{clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}.Vb6T7a_sortSelect{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);height:36px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:7px;outline:none;flex:none;padding:0 8px;font-size:13px}.Vb6T7a_sortDirection{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);width:36px;height:36px;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:7px;flex:none;padding:0;font-size:14px;line-height:1}.Vb6T7a_sortDirection:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.Vb6T7a_sortSelect:disabled,.Vb6T7a_sortDirection:disabled{opacity:.48;cursor:not-allowed}.Vb6T7a_sortSelect:focus-visible,.Vb6T7a_sortDirection:focus-visible,.Vb6T7a_installedSummary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.Vb6T7a_installed{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:9px;padding:0 12px}.Vb6T7a_installedSummary{color:var(--dsw-alias-label-primary);cursor:pointer;align-items:center;gap:8px;padding:12px 2px;font-size:14px;font-weight:600;line-height:20px;list-style:none;display:flex}.Vb6T7a_installedSummary::-webkit-details-marker{display:none}.Vb6T7a_installedSummary:before{content:\"\";border-right:1.5px solid var(--dsw-alias-label-tertiary);border-bottom:1.5px solid var(--dsw-alias-label-tertiary);flex:none;width:6px;height:6px;transition:transform .15s;transform:rotate(-45deg)}.Vb6T7a_installed[open] .Vb6T7a_installedSummary:before{transform:rotate(45deg)}.Vb6T7a_installedTitle{flex:1;min-width:0}.Vb6T7a_installedBadge,.Vb6T7a_updateBadge{border-radius:999px;flex:none;padding:2px 8px;font-size:11px;font-weight:500;line-height:16px}.Vb6T7a_installedBadge{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary)}.Vb6T7a_updateBadge{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);color:var(--dsw-alias-state-business-primary)}.Vb6T7a_selfUpdate{border:1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 24%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 9%, transparent);border-radius:7px;flex-direction:column;gap:4px;padding:9px 11px;font-size:13px;line-height:20px;display:flex}.Vb6T7a_selfUpdateMain{justify-content:space-between;align-items:center;gap:10px;display:flex}.Vb6T7a_selfUpdateLabel{flex:1;min-width:0}.Vb6T7a_selfUpdateVersions{white-space:nowrap;font-weight:600}.Vb6T7a_selfUpdate .Vb6T7a_primaryButton{min-height:30px;padding:5px 12px;font-size:12px}.Vb6T7a_selfUpdateHint{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:18px}.Vb6T7a_installedHint{color:var(--dsw-alias-label-tertiary);margin:0 0 4px;font-size:12px;line-height:18px}.Vb6T7a_installed .Vb6T7a_rows{border-top:1px solid var(--dsw-alias-border-l2)}.Vb6T7a_installed .Vb6T7a_row:last-child{border-bottom:0}.Vb6T7a_versionRow{border-bottom:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;padding:0 2px 10px;display:flex}.Vb6T7a_versionPicker{color:var(--dsw-alias-label-secondary);align-items:center;gap:8px;font-size:12px;line-height:18px;display:inline-flex}.Vb6T7a_versionPicker select{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);max-width:220px;height:30px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:7px;padding:0 8px}.Vb6T7a_sourceApproval{max-width:560px;color:var(--dsw-alias-label-tertiary);align-items:center;gap:8px;font-size:12px;line-height:18px;display:flex}.Vb6T7a_sourceApproval input{accent-color:var(--dsw-alias-state-business-primary)}.Vb6T7a_sourceApproval span{flex:1;min-width:0}.Vb6T7a_dialogBackdrop{z-index:10;background:#0000006b;place-items:center;padding:16px;display:grid;position:fixed;inset:0}.Vb6T7a_releaseDialog{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);width:min(360px,100%);color:var(--dsw-alias-label-primary);border-radius:9px;padding:18px;box-shadow:0 12px 32px #00000047}.Vb6T7a_releaseDialog h2{margin:0;font-size:16px;font-weight:600;line-height:22px}.Vb6T7a_releaseDialog p{color:var(--dsw-alias-label-secondary);margin:6px 0 16px;font-size:13px;line-height:19px}.Vb6T7a_dialogField{color:var(--dsw-alias-label-secondary);flex-direction:column;gap:6px;font-size:12px;line-height:18px;display:flex}.Vb6T7a_dialogField select{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:100%;height:36px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:7px;padding:0 10px;font-size:13px}.Vb6T7a_dialogActions{justify-content:flex-end;gap:8px;margin-top:18px;display:flex}@media (width<=680px){.Vb6T7a_profileBar,.Vb6T7a_search{flex-wrap:wrap}.Vb6T7a_search input{flex-basis:100%}.Vb6T7a_selfUpdateMain{flex-wrap:wrap}.Vb6T7a_newProfile{margin-left:0}.Vb6T7a_row{gap:8px}.Vb6T7a_rowActions{flex-wrap:wrap;justify-content:flex-end}.Vb6T7a_versionRow{justify-content:flex-start}.Vb6T7a_versionPicker{width:100%}.Vb6T7a_versionPicker select{flex:1;min-width:0}.Vb6T7a_sourceApproval{flex-wrap:wrap;align-items:flex-start}.Vb6T7a_sourceApproval .Vb6T7a_primaryButton{margin-left:20px}}";
const tagId = "dsh-plugin-installer/PluginMarketplaceSettingsTab.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-plugin-installer";
	tag.dataset.pluginCss = tagId;
	tag.textContent = css;
	document.head.appendChild(tag);
}
var PluginMarketplaceSettingsTab_module_css_default = {
	"search": "Vb6T7a_search",
	"success": "Vb6T7a_success",
	"review": "Vb6T7a_review",
	"errorHint": "Vb6T7a_errorHint",
	"row": "Vb6T7a_row",
	"reviewActions": "Vb6T7a_reviewActions",
	"releaseDialog": "Vb6T7a_releaseDialog",
	"versionPicker": "Vb6T7a_versionPicker",
	"sourceApproval": "Vb6T7a_sourceApproval",
	"rowActions": "Vb6T7a_rowActions",
	"sortSelect": "Vb6T7a_sortSelect",
	"errorCommand": "Vb6T7a_errorCommand",
	"versionRow": "Vb6T7a_versionRow",
	"dialogBackdrop": "Vb6T7a_dialogBackdrop",
	"dialogActions": "Vb6T7a_dialogActions",
	"selfUpdateHint": "Vb6T7a_selfUpdateHint",
	"secondaryButton": "Vb6T7a_secondaryButton",
	"error": "Vb6T7a_error",
	"newProfileLabel": "Vb6T7a_newProfileLabel",
	"catalog": "Vb6T7a_catalog",
	"status": "Vb6T7a_status",
	"githubTokenStatus": "Vb6T7a_githubTokenStatus",
	"githubSettingsBody": "Vb6T7a_githubSettingsBody",
	"primaryButton": "Vb6T7a_primaryButton",
	"installed": "Vb6T7a_installed",
	"installedTitle": "Vb6T7a_installedTitle",
	"githubTokenField": "Vb6T7a_githubTokenField",
	"installedHint": "Vb6T7a_installedHint",
	"newProfile": "Vb6T7a_newProfile",
	"installedSummary": "Vb6T7a_installedSummary",
	"selfUpdate": "Vb6T7a_selfUpdate",
	"selfUpdateVersions": "Vb6T7a_selfUpdateVersions",
	"profileBar": "Vb6T7a_profileBar",
	"githubSettingsSummary": "Vb6T7a_githubSettingsSummary",
	"installedTag": "Vb6T7a_installedTag",
	"selfUpdateMain": "Vb6T7a_selfUpdateMain",
	"selfUpdateLabel": "Vb6T7a_selfUpdateLabel",
	"reviewHeading": "Vb6T7a_reviewHeading",
	"sortDirection": "Vb6T7a_sortDirection",
	"dialogField": "Vb6T7a_dialogField",
	"visuallyHidden": "Vb6T7a_visuallyHidden",
	"githubSettings": "Vb6T7a_githubSettings",
	"installedBadge": "Vb6T7a_installedBadge",
	"repository": "Vb6T7a_repository",
	"loadMore": "Vb6T7a_loadMore",
	"updateBadge": "Vb6T7a_updateBadge",
	"root": "Vb6T7a_root",
	"rowMain": "Vb6T7a_rowMain",
	"rows": "Vb6T7a_rows",
	"textButton": "Vb6T7a_textButton"
};

//#endregion
//#region src/client/PluginMarketplaceSettingsTab.tsx
var MarketplaceRequestError = class extends Error {
	constructor(code, message, hint, command) {
		super(message);
		this.code = code;
		this.hint = hint;
		this.command = command;
	}
};
async function api(path, init) {
	const response = await fetch(`/dsh-plugin-installer/api${path}`, {
		...init,
		headers: {
			...init?.body === void 0 ? {} : { "content-type": "application/json" },
			...init?.headers
		},
		credentials: "same-origin"
	});
	const body = await response.json();
	if (!response.ok) throw new MarketplaceRequestError(body.error?.code, body.error?.message ?? `Request failed (${response.status})`, body.error?.hint, body.error?.command);
	return body;
}
function errorMessage(error, fallback) {
	if (error instanceof MarketplaceRequestError) return {
		text: error.message,
		hint: error.hint,
		command: error.command
	};
	return { text: error instanceof Error ? error.message : fallback };
}
function updated(value, locale) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
/** Client-side catalog cache lifetime, kept in sync with the server cache. */
const CATALOG_CACHE_TTL_MS = 12 * 6e4;
const CATALOG_CACHE_MAX_ENTRIES = 48;
const catalogCache = /* @__PURE__ */ new Map();
function catalogCacheKey(query, sort, direction, page) {
	return `${sort}:${direction}:${page}:${encodeURIComponent(normalizeCatalogQuery(query))}`;
}
function readCatalogCache(query, sort, direction, page) {
	const entry = catalogCache.get(catalogCacheKey(query, sort, direction, page));
	if (entry === void 0) return null;
	if (Date.now() - entry.fetchedAt > CATALOG_CACHE_TTL_MS) {
		catalogCache.delete(catalogCacheKey(query, sort, direction, page));
		return null;
	}
	return entry.page;
}
function writeCatalogCache(query, sort, direction, page, value) {
	const now = Date.now();
	const key = catalogCacheKey(query, sort, direction, page);
	for (const [key$1, entry] of catalogCache) if (now - entry.fetchedAt > CATALOG_CACHE_TTL_MS) catalogCache.delete(key$1);
	if (!catalogCache.has(key) && catalogCache.size >= CATALOG_CACHE_MAX_ENTRIES) {
		const oldest = catalogCache.keys().next().value;
		if (oldest !== void 0) catalogCache.delete(oldest);
	}
	catalogCache.set(key, {
		fetchedAt: now,
		page: value
	});
}
function clearCatalogCache(query, sort, direction) {
	const suffix = `:${encodeURIComponent(normalizeCatalogQuery(query))}`;
	const prefix = `${sort}:${direction}:`;
	for (const key of catalogCache.keys()) if (key.startsWith(prefix) && key.endsWith(suffix)) catalogCache.delete(key);
}
function mergeCatalog(current, next) {
	const seen = new Set(current.map((plugin) => plugin.fullName.toLocaleLowerCase()));
	return [...current, ...next.filter((plugin) => {
		const key = plugin.fullName.toLocaleLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	})];
}
/** Marketplace UI: direct installation from a compact repository list. */
function PluginMarketplaceSettingsTab({ t }) {
	const [snapshot, setSnapshot] = (0, react.useState)(null);
	const [githubConfig, setGithubConfig] = (0, react.useState)(null);
	const [githubToken, setGithubToken] = (0, react.useState)("");
	const [plugins, setPlugins] = (0, react.useState)([]);
	const [query, setQuery] = (0, react.useState)("");
	const [selectedProfile, setSelectedProfile] = (0, react.useState)("");
	const [releaseDialog, setReleaseDialog] = (0, react.useState)(null);
	const [sourceConsent, setSourceConsent] = (0, react.useState)({});
	const [sourceBuildAllowed, setSourceBuildAllowed] = (0, react.useState)({});
	const [loading, setLoading] = (0, react.useState)(true);
	const [loadingMore, setLoadingMore] = (0, react.useState)(false);
	const [catalogPage, setCatalogPage] = (0, react.useState)(0);
	const [hasMore, setHasMore] = (0, react.useState)(false);
	const [loadMoreFailed, setLoadMoreFailed] = (0, react.useState)(false);
	const [action, setAction] = (0, react.useState)(null);
	const [message, setMessage] = (0, react.useState)(null);
	const [restartAvailable, setRestartAvailable] = (0, react.useState)(false);
	const [selfUpdateDone, setSelfUpdateDone] = (0, react.useState)(false);
	const [newProfile, setNewProfile] = (0, react.useState)("");
	const [sortBy, setSortBy] = (0, react.useState)("updated");
	const [sortDirection, setSortDirection] = (0, react.useState)("desc");
	const loadMoreRef = (0, react.useRef)(null);
	const load = async (search = query, preserveMessage = false, bypassCache = false, page = 1, requestedSort = sortBy, requestedDirection = sortDirection) => {
		if (page === 1) {
			setLoading(true);
			setCatalogPage(0);
			setHasMore(false);
			setLoadMoreFailed(false);
		} else {
			setLoadingMore(true);
			setLoadMoreFailed(false);
		}
		if (!preserveMessage) setMessage(null);
		try {
			const normalizedSearch = normalizeCatalogQuery(search);
			if (bypassCache && page === 1) clearCatalogCache(normalizedSearch, requestedSort, requestedDirection);
			const cached = bypassCache ? null : readCatalogCache(normalizedSearch, requestedSort, requestedDirection, page);
			const catalogPromise = cached === null ? api(`/plugins?query=${encodeURIComponent(normalizedSearch)}&sort=${requestedSort}&order=${requestedDirection}&page=${page}${bypassCache ? "&refresh=1" : ""}`).then((result) => {
				writeCatalogCache(normalizedSearch, requestedSort, requestedDirection, page, result);
				return result;
			}) : Promise.resolve(cached);
			const [state, catalog] = await Promise.all([page === 1 ? api("/state") : Promise.resolve(null), catalogPromise]);
			if (state !== null) {
				setSnapshot(state);
				setSelectedProfile((current) => current || state.currentProfile);
			}
			setPlugins((current) => page === 1 ? catalog.plugins : mergeCatalog(current, catalog.plugins));
			setCatalogPage(page);
			setHasMore(catalog.hasMore);
		} catch (error) {
			setMessage({
				kind: "error",
				...errorMessage(error, t("loadFailed"))
			});
			if (page > 1) {
				setHasMore(false);
				setLoadMoreFailed(true);
			}
		} finally {
			if (page === 1) setLoading(false);
			else setLoadingMore(false);
		}
	};
	const loadGithubConfig = async () => {
		try {
			setGithubConfig(await api("/config"));
		} catch {}
	};
	(0, react.useEffect)(() => {
		load("");
		loadGithubConfig();
	}, []);
	const profiles = snapshot?.profiles ?? [];
	const selectedSummary = profiles.find((profile) => profile.name === selectedProfile);
	const selfUpdate = snapshot?.selfUpdate ?? null;
	const visiblePlugins = (0, react.useMemo)(() => sortCatalog(plugins, sortBy, sortDirection), [
		plugins,
		sortBy,
		sortDirection
	]);
	const updatableCount = selectedSummary?.installedPlugins.filter((plugin) => plugin.updateStatus === "available").length ?? 0;
	const loadNextPage = () => {
		if (loading || loadingMore || !hasMore) return;
		load(query, true, false, catalogPage + 1);
	};
	(0, react.useEffect)(() => {
		const target = loadMoreRef.current;
		if (target === null || !hasMore) return;
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) loadNextPage();
		}, { rootMargin: "480px 0px" });
		observer.observe(target);
		return () => observer.disconnect();
	}, [
		catalogPage,
		hasMore,
		loading,
		loadingMore,
		query,
		sortBy,
		sortDirection
	]);
	const actionIs = (value) => action === value;
	const isWorking = action !== null;
	const saveGithubToken = async () => {
		if (action !== null) return;
		setAction("github-config");
		setMessage(null);
		setRestartAvailable(false);
		try {
			setGithubConfig(await api("/config", {
				method: "POST",
				body: JSON.stringify({ githubToken })
			}));
			setGithubToken("");
			setMessage({
				kind: "success",
				text: t("githubTokenSaved")
			});
		} catch (error) {
			setMessage({
				kind: "error",
				...errorMessage(error, t("githubTokenSaveFailed"))
			});
		} finally {
			setAction(null);
		}
	};
	const performInstall = async (repository, releaseTag) => {
		setAction(`install:${repository.fullName}`);
		setRestartAvailable(false);
		setMessage(null);
		try {
			const result = await api("/install", {
				method: "POST",
				body: JSON.stringify({
					profile: selectedProfile,
					owner: repository.owner,
					repository: repository.name,
					...releaseTag === void 0 ? {} : { releaseTag },
					...sourceBuildAllowed[repository.fullName] === true ? { allowBuild: true } : {}
				})
			});
			await load(query, true);
			setMessage({
				kind: "success",
				text: result.installed.installSource === "source" ? t("installedFromSource") : t("installed")
			});
			setRestartAvailable(result.restartAvailable);
		} catch (error) {
			const text = error instanceof Error ? error.message : t("installFailed");
			if (error instanceof MarketplaceRequestError && error.code === "build-approval-required") {
				setMessage(null);
				setSourceConsent((current) => ({
					...current,
					[repository.fullName]: true
				}));
			} else setMessage({
				kind: "error",
				...errorMessage(error, text)
			});
		} finally {
			setAction(null);
		}
	};
	const beginInstall = async (repository) => {
		if (action !== null) return;
		setAction(`inspect:${repository.fullName}`);
		setMessage(null);
		try {
			const result = await api(`/plugin/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`);
			if (!result.plugin.validBundle) throw new MarketplaceRequestError("not-a-bundle", result.plugin.reason ?? t("releaseChoicesUnavailable"));
			if (result.plugin.installSource === "release" && result.plugin.releases.length > 1) {
				const selectedTag = result.plugin.release?.tag ?? result.plugin.releases[0]?.tag;
				if (selectedTag === void 0) throw new MarketplaceRequestError("release-unavailable", t("releaseChoicesUnavailable"));
				setReleaseDialog({
					repository,
					releases: result.plugin.releases,
					selectedTag
				});
				return;
			}
			await performInstall(repository, result.plugin.installSource === "release" ? result.plugin.release?.tag ?? void 0 : void 0);
		} catch (error) {
			if (error instanceof MarketplaceRequestError && error.code === "build-approval-required") setSourceConsent((current) => ({
				...current,
				[repository.fullName]: true
			}));
			else setMessage({
				kind: "error",
				...errorMessage(error, t("installFailed"))
			});
		} finally {
			setAction(null);
		}
	};
	const confirmReleaseInstall = () => {
		if (releaseDialog === null) return;
		const { repository, selectedTag } = releaseDialog;
		setReleaseDialog(null);
		performInstall(repository, selectedTag);
	};
	const openProfile = async () => {
		if (selectedSummary?.webCapable !== true) return;
		setAction("open-profile");
		setMessage(null);
		try {
			const result = await api("/switch", {
				method: "POST",
				body: JSON.stringify({ profile: selectedProfile })
			});
			window.location.assign(result.url);
		} catch (error) {
			setMessage({
				kind: "error",
				...errorMessage(error, t("profileFailed"))
			});
			setAction(null);
		}
	};
	const createProfile = async () => {
		if (newProfile.trim().length === 0) return;
		setAction("create-profile");
		setMessage(null);
		try {
			const result = await api("/profiles", {
				method: "POST",
				body: JSON.stringify({ name: newProfile.trim() })
			});
			window.location.assign(result.url);
		} catch (error) {
			setMessage({
				kind: "error",
				...errorMessage(error, t("profileFailed"))
			});
			setAction(null);
		}
	};
	const restartDsh = async () => {
		setAction("restart");
		setMessage(null);
		try {
			const result = await api("/restart", {
				method: "POST",
				body: JSON.stringify({ profile: selectedProfile })
			});
			window.location.assign(result.url);
		} catch (error) {
			setMessage({
				kind: "error",
				...errorMessage(error, t("profileFailed"))
			});
			setAction(null);
		}
	};
	const updateSelf = async () => {
		if (action !== null) return;
		setAction("self-update");
		setMessage(null);
		setRestartAvailable(false);
		try {
			const result = await api("/self-update", {
				method: "POST",
				body: JSON.stringify({})
			});
			setSelfUpdateDone(true);
			await load(query, true);
			setMessage({
				kind: "success",
				text: t("selfUpdated")
			});
			setRestartAvailable(result.restartAvailable);
		} catch (error) {
			setMessage({
				kind: "error",
				...errorMessage(error, t("selfUpdateFailed"))
			});
		} finally {
			setAction(null);
		}
	};
	const updatePlugin = async (plugin) => {
		const actionKey = `update:${plugin.packageName}`;
		if (action !== null) return;
		setAction(actionKey);
		setMessage(null);
		setRestartAvailable(false);
		try {
			const result = await api("/update", {
				method: "POST",
				body: JSON.stringify({
					profile: selectedProfile,
					packageName: plugin.packageName,
					owner: plugin.owner,
					repository: plugin.repositoryName
				})
			});
			await load(query, true);
			setMessage({
				kind: "success",
				text: t("updatedPlugin")
			});
			setRestartAvailable(result.restartAvailable);
		} catch (error) {
			setMessage({
				kind: "error",
				...errorMessage(error, t("updateFailed"))
			});
		} finally {
			setAction(null);
		}
	};
	const removePlugin = async (plugin) => {
		if (!window.confirm(`${t("removeConfirm")}\n\n${plugin.packageName}`)) return;
		const actionKey = `remove:${plugin.packageName}`;
		if (action !== null) return;
		setAction(actionKey);
		setMessage(null);
		setRestartAvailable(false);
		try {
			const result = await api("/remove", {
				method: "POST",
				body: JSON.stringify({
					profile: selectedProfile,
					packageName: plugin.packageName
				})
			});
			await load(query, true);
			setMessage({
				kind: "success",
				text: t("removedPlugin")
			});
			setRestartAvailable(result.restartAvailable);
		} catch (error) {
			setMessage({
				kind: "error",
				...errorMessage(error, t("removeFailed"))
			});
		} finally {
			setAction(null);
		}
	};
	const isInstalled = (repository) => {
		if (selectedSummary === void 0) return false;
		const fullName = repository.fullName.toLocaleLowerCase();
		return selectedSummary.installedRepositories.includes(fullName);
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: PluginMarketplaceSettingsTab_module_css_default.root,
		"aria-busy": loading || loadingMore || isWorking,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: PluginMarketplaceSettingsTab_module_css_default.profileBar,
				"aria-label": t("currentProfile"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: PluginMarketplaceSettingsTab_module_css_default.visuallyHidden,
						children: t("currentProfile")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
						value: selectedProfile,
						onChange: (event) => setSelectedProfile(event.currentTarget.value),
						disabled: profiles.length === 0 || isWorking,
						children: profiles.map((profile) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: profile.name,
							children: profile.name
						}, profile.name))
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
						disabled: isWorking || selectedSummary?.webCapable !== true,
						onClick: () => void openProfile(),
						children: actionIs("open-profile") ? t("openingProfile") : t("openProfile")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: PluginMarketplaceSettingsTab_module_css_default.newProfile,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.newProfileLabel,
							children: t("newProfile")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: newProfile,
							placeholder: t("newProfilePlaceholder"),
							onChange: (event) => setNewProfile(event.currentTarget.value),
							disabled: isWorking
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
						disabled: isWorking || newProfile.trim().length === 0,
						onClick: () => void createProfile(),
						children: actionIs("create-profile") ? t("creatingProfile") : t("createAndOpen")
					})
				]
			}),
			selfUpdate?.updateStatus === "available" && selfUpdate.latestVersion !== null && !selfUpdateDone ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: PluginMarketplaceSettingsTab_module_css_default.selfUpdate,
				role: "status",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.selfUpdateMain,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: PluginMarketplaceSettingsTab_module_css_default.selfUpdateLabel,
						children: [t("selfUpdateAvailable"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.selfUpdateVersions,
							children: [
								" v",
								selfUpdate.currentVersion,
								" → v",
								selfUpdate.latestVersion
							]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
						disabled: isWorking,
						onClick: () => void updateSelf(),
						children: actionIs("self-update") ? t("selfUpdating") : t("selfUpdateNow")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: PluginMarketplaceSettingsTab_module_css_default.selfUpdateHint,
					children: t("selfUpdateHint")
				})]
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				className: PluginMarketplaceSettingsTab_module_css_default.search,
				onSubmit: (event) => {
					event.preventDefault();
					load(query, false, true);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						value: query,
						type: "search",
						placeholder: t("search"),
						"aria-label": t("search"),
						onChange: (event) => setQuery(event.currentTarget.value)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						className: PluginMarketplaceSettingsTab_module_css_default.sortSelect,
						value: sortBy,
						"aria-label": t("sort"),
						title: t("sort"),
						disabled: isWorking || loading || loadingMore,
						onChange: (event) => {
							const nextSort = event.currentTarget.value;
							if (nextSort === sortBy) return;
							setSortBy(nextSort);
							setCatalogPage(0);
							setHasMore(false);
							load(query, false, false, 1, nextSort, sortDirection);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "updated",
							children: t("sortUpdated")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "stars",
							children: t("sortStars")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: PluginMarketplaceSettingsTab_module_css_default.sortDirection,
						disabled: isWorking || loading || loadingMore,
						onClick: () => {
							const nextDirection = sortDirection === "asc" ? "desc" : "asc";
							setSortDirection(nextDirection);
							setCatalogPage(0);
							setHasMore(false);
							load(query, false, false, 1, sortBy, nextDirection);
						},
						"aria-label": sortDirection === "asc" ? t("sortToggleToDesc") : t("sortToggleToAsc"),
						title: sortDirection === "asc" ? t("sortAsc") : t("sortDesc"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							children: sortDirection === "asc" ? "↑" : "↓"
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "submit",
						className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
						disabled: loading || loadingMore || isWorking,
						children: t("refresh")
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: PluginMarketplaceSettingsTab_module_css_default.githubSettings,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", {
					className: PluginMarketplaceSettingsTab_module_css_default.githubSettingsSummary,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("githubSettings") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: PluginMarketplaceSettingsTab_module_css_default.githubTokenStatus,
						children: githubConfig === null ? t("loading") : githubConfig.source === "saved" ? t("githubTokenStatusSaved") : githubConfig.source === "environment" ? t("githubTokenStatusEnvironment") : t("githubTokenStatusMissing")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.githubSettingsBody,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: PluginMarketplaceSettingsTab_module_css_default.status,
							children: t("githubSettingsHint")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: PluginMarketplaceSettingsTab_module_css_default.githubTokenField,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("githubTokenLabel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "password",
								value: githubToken,
								autoComplete: "off",
								placeholder: t("githubTokenPlaceholder"),
								disabled: isWorking,
								onChange: (event) => setGithubToken(event.currentTarget.value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
							disabled: isWorking,
							onClick: () => void saveGithubToken(),
							children: actionIs("github-config") ? t("saving") : t("save")
						})
					]
				})]
			}),
			message !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: message.kind === "error" ? PluginMarketplaceSettingsTab_module_css_default.error : PluginMarketplaceSettingsTab_module_css_default.success,
				role: message.kind === "error" ? "alert" : "status",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: message.text }),
					message.hint === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: PluginMarketplaceSettingsTab_module_css_default.errorHint,
						children: message.hint
					}),
					message.command === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
						className: PluginMarketplaceSettingsTab_module_css_default.errorCommand,
						children: message.command
					})
				]
			}) : null,
			message?.kind === "success" ? restartAvailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
				disabled: isWorking,
				onClick: () => void restartDsh(),
				children: actionIs("restart") ? t("restarting") : t("restartNow")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: PluginMarketplaceSettingsTab_module_css_default.status,
				children: t("restartUnavailable")
			}) : null,
			loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: PluginMarketplaceSettingsTab_module_css_default.status,
				children: t("loading")
			}) : null,
			selectedSummary !== void 0 && selectedSummary.installedPlugins.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: PluginMarketplaceSettingsTab_module_css_default.installed,
				open: updatableCount > 0,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", {
						className: PluginMarketplaceSettingsTab_module_css_default.installedSummary,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.installedTitle,
								children: t("installedPlugins")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.installedBadge,
								children: [
									selectedSummary.installedPlugins.length,
									" ",
									t("installedCount")
								]
							}),
							updatableCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.updateBadge,
								children: [
									updatableCount,
									" ",
									t("updateAvailable")
								]
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: PluginMarketplaceSettingsTab_module_css_default.installedHint,
						children: t("installedPluginsHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: PluginMarketplaceSettingsTab_module_css_default.rows,
						children: selectedSummary.installedPlugins.map((plugin) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: PluginMarketplaceSettingsTab_module_css_default.row,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: PluginMarketplaceSettingsTab_module_css_default.rowMain,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									href: `https://github.com/${plugin.repository}`,
									target: "_blank",
									rel: "noreferrer",
									className: PluginMarketplaceSettingsTab_module_css_default.repository,
									children: plugin.repository
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: plugin.installedVersion === null ? plugin.packageName : `${plugin.packageName} · v${plugin.installedVersion}` })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: PluginMarketplaceSettingsTab_module_css_default.rowActions,
								children: [plugin.updateStatus === "available" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
									disabled: isWorking,
									onClick: () => void updatePlugin(plugin),
									children: actionIs(`update:${plugin.packageName}`) ? t("updating") : t("update")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: PluginMarketplaceSettingsTab_module_css_default.installedTag,
									children: plugin.updateStatus === "up-to-date" ? t("upToDate") : t("updateUnknown")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
									disabled: isWorking,
									onClick: () => void removePlugin(plugin),
									children: actionIs(`remove:${plugin.packageName}`) ? t("removing") : t("remove")
								})]
							})]
						}, plugin.packageName))
					})
				]
			}) : null,
			!loading && visiblePlugins.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: PluginMarketplaceSettingsTab_module_css_default.status,
				children: t("empty")
			}) : null,
			visiblePlugins.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: PluginMarketplaceSettingsTab_module_css_default.catalog,
				"aria-label": t("tab"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: PluginMarketplaceSettingsTab_module_css_default.rows,
					children: visiblePlugins.map((plugin) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
						className: PluginMarketplaceSettingsTab_module_css_default.row,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: PluginMarketplaceSettingsTab_module_css_default.rowMain,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									href: plugin.url,
									target: "_blank",
									rel: "noreferrer",
									className: PluginMarketplaceSettingsTab_module_css_default.repository,
									children: plugin.fullName
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: plugin.description ?? t("noDescription") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									t("stars"),
									" ",
									plugin.stars,
									" · ",
									t("updated"),
									" ",
									updated(plugin.updatedAt, t("dateLocale")),
									plugin.language === null ? "" : ` · ${plugin.language}`
								] })
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: PluginMarketplaceSettingsTab_module_css_default.rowActions,
							children: [isInstalled(plugin) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.installedTag,
								children: t("installedPlugin")
							}) : null, !isInstalled(plugin) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
								disabled: isWorking || selectedProfile.length === 0,
								onClick: () => void beginInstall(plugin),
								children: actionIs(`inspect:${plugin.fullName}`) ? t("checkingVersions") : actionIs(`install:${plugin.fullName}`) ? t("installing") : t("install")
							}) : null]
						})]
					}), sourceConsent[plugin.fullName] === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
						className: PluginMarketplaceSettingsTab_module_css_default.versionRow,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: PluginMarketplaceSettingsTab_module_css_default.sourceApproval,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: sourceBuildAllowed[plugin.fullName] === true,
									disabled: isWorking,
									onChange: (event) => setSourceBuildAllowed((current) => ({
										...current,
										[plugin.fullName]: event.currentTarget.checked
									}))
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("sourceBuildApproval") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
									disabled: isWorking || sourceBuildAllowed[plugin.fullName] !== true,
									onClick: () => void performInstall(plugin),
									children: actionIs(`install:${plugin.fullName}`) ? t("installing") : t("install")
								})
							]
						})
					}) : null] }, plugin.fullName))
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					ref: loadMoreRef,
					className: PluginMarketplaceSettingsTab_module_css_default.loadMore,
					"aria-live": "polite",
					children: loadingMore ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: PluginMarketplaceSettingsTab_module_css_default.status,
						children: t("loadingMore")
					}) : loadMoreFailed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: PluginMarketplaceSettingsTab_module_css_default.status,
						children: t("loadMoreFailed")
					}) : !hasMore ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: PluginMarketplaceSettingsTab_module_css_default.status,
						children: t("catalogComplete")
					}) : null
				})]
			}) : null,
			releaseDialog !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: PluginMarketplaceSettingsTab_module_css_default.dialogBackdrop,
				onMouseDown: (event) => {
					if (event.target === event.currentTarget) setReleaseDialog(null);
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.releaseDialog,
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": "dsh-plugin-release-dialog-title",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							id: "dsh-plugin-release-dialog-title",
							children: t("releaseDialogTitle")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("releaseDialogDescription") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: PluginMarketplaceSettingsTab_module_css_default.dialogField,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("installVersion") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								value: releaseDialog.selectedTag,
								onChange: (event) => setReleaseDialog((current) => current === null ? current : {
									...current,
									selectedTag: event.currentTarget.value
								}),
								children: releaseDialog.releases.map((release) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: release.tag,
									children: release.tag
								}, release.tag))
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: PluginMarketplaceSettingsTab_module_css_default.dialogActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
								onClick: () => setReleaseDialog(null),
								children: t("cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
								onClick: confirmReleaseInstall,
								children: t("install")
							})]
						})
					]
				})
			}) : null
		]
	});
}

//#endregion
//#region src/client/locales.ts
const zh = {
	tab: "插件市场",
	currentProfile: "Profile",
	openProfile: "打开 Profile",
	newProfile: "新建 Web Profile",
	newProfilePlaceholder: "例如 work",
	createAndOpen: "创建并打开",
	search: "搜索仓库名称或描述",
	refresh: "刷新列表",
	githubSettings: "GitHub 请求设置",
	githubSettingsHint: "配置后可提高 GitHub API 的请求额度。Token 只保存在当前 DSH_HOME，不会显示在页面上。留空并保存可清除插件保存的 Token。",
	githubTokenLabel: "GitHub Token",
	githubTokenPlaceholder: "粘贴 fine-grained access token",
	githubTokenStatusSaved: "已配置本地 Token",
	githubTokenStatusEnvironment: "使用环境变量 Token",
	githubTokenStatusMissing: "未配置 Token",
	githubTokenSaved: "GitHub Token 设置已保存。",
	githubTokenSaveFailed: "GitHub Token 设置未保存。",
	save: "保存",
	saving: "正在保存…",
	loading: "正在加载插件列表…",
	loadFailed: "插件列表暂时不可用。",
	retry: "重试",
	empty: "没有找到匹配的插件。",
	install: "安装",
	inspecting: "正在检查 DSH bundle…",
	openingProfile: "正在打开…",
	creatingProfile: "正在创建…",
	restarting: "正在重启…",
	checkingVersions: "正在检查版本…",
	loadingVersions: "正在读取版本…",
	chooseVersion: "选择版本",
	installVersion: "安装版本",
	releaseDialogTitle: "选择安装版本",
	releaseDialogDescription: "该插件有多个 Release，请选择要安装的版本。",
	cancel: "取消",
	releaseChoicesUnavailable: "没有可用的 Release 安装包，将按源码回退规则处理。",
	sourceBuildApproval: "此插件没有可用的 Release，将从源码安装并执行其构建脚本。我已查看仓库，并允许本次构建。",
	installedPlugin: "已安装",
	invalidBundle: "不是可安装的 DSH bundle",
	bundleVersion: "版本",
	source: "来源",
	sourceGithub: "GitHub 仓库",
	buildPermission: "此仓库包含 prepare 安装脚本；我了解这会执行第三方代码，并允许为该插件授予构建权限。",
	installing: "正在安装…",
	installed: "安装完成。重启 DSH 后生效。",
	installedFromSource: "安装完成。由于没有可用的 Release，本次使用了已验证入口的源码回退。重启 DSH 后生效。",
	restartNow: "立即重启 DSH",
	restartUnavailable: "请重启目标 Profile 后生效。",
	installFailed: "安装未完成。",
	profileFailed: "Profile 操作未完成。",
	stars: "星标",
	updated: "更新于",
	sort: "排序",
	sortUpdated: "更新时间",
	sortStars: "星标数",
	sortAsc: "升序",
	sortDesc: "降序",
	sortToggleToAsc: "改为升序",
	sortToggleToDesc: "改为降序",
	loadingMore: "正在加载更多插件…",
	loadMoreFailed: "无法继续加载更多插件，请刷新列表后重试。",
	catalogComplete: "已加载全部可用插件。",
	viewRepository: "查看仓库",
	close: "收起",
	noDescription: "该仓库没有提供说明。",
	dateLocale: "zh-CN",
	installedPlugins: "已安装插件",
	installedPluginsHint: "打开此页时会自动检查由 GitHub 固定提交安装的插件。",
	installedCount: "个插件",
	updateAvailable: "有可用更新",
	upToDate: "已是最新",
	updateUnknown: "暂无法检查更新",
	update: "更新",
	updating: "正在更新…",
	updatedPlugin: "插件已更新。重启 DSH 后生效。",
	updateFailed: "插件更新未完成。",
	selfUpdateAvailable: "插件市场有可用更新",
	selfUpdateHint: "点击“立即更新”安装最新稳定版，完成后重启 DSH 生效。",
	selfUpdateNow: "立即更新",
	selfUpdating: "正在更新插件市场…",
	selfUpdated: "插件市场已更新。重启 DSH 后生效。",
	selfUpdateFailed: "插件市场更新未完成。",
	remove: "删除",
	removing: "正在删除…",
	removeConfirm: "确定要删除这个插件吗？删除后需重启 DSH 才会生效。",
	removedPlugin: "插件已删除。重启 DSH 后生效。",
	removeFailed: "插件删除未完成。"
};
const en = {
	tab: "Plugin marketplace",
	currentProfile: "Profile",
	openProfile: "Open profile",
	newProfile: "New Web profile",
	newProfilePlaceholder: "For example work",
	createAndOpen: "Create and open",
	search: "Search repository name or description",
	refresh: "Refresh",
	githubSettings: "GitHub request settings",
	githubSettingsHint: "A token increases the GitHub API request limit. It is stored only in the current DSH_HOME and is never shown here. Save an empty value to clear the plugin-saved token.",
	githubTokenLabel: "GitHub Token",
	githubTokenPlaceholder: "Paste a fine-grained access token",
	githubTokenStatusSaved: "Local token configured",
	githubTokenStatusEnvironment: "Using environment token",
	githubTokenStatusMissing: "No token configured",
	githubTokenSaved: "GitHub Token settings saved.",
	githubTokenSaveFailed: "GitHub Token settings were not saved.",
	save: "Save",
	saving: "Saving…",
	loading: "Loading plugins…",
	loadFailed: "The plugin list is temporarily unavailable.",
	retry: "Retry",
	empty: "No matching plugins found.",
	install: "Install",
	inspecting: "Checking DSH bundle…",
	openingProfile: "Opening…",
	creatingProfile: "Creating…",
	restarting: "Restarting…",
	checkingVersions: "Checking versions…",
	loadingVersions: "Loading versions…",
	chooseVersion: "Choose version",
	installVersion: "Install version",
	releaseDialogTitle: "Choose an install version",
	releaseDialogDescription: "This plugin has multiple Releases. Choose the version to install.",
	cancel: "Cancel",
	releaseChoicesUnavailable: "No usable Release archive was found. The source fallback rules will be used.",
	sourceBuildApproval: "This plugin has no usable Release and will be installed from source with its build script. I have reviewed the repository and allow this build.",
	installedPlugin: "Installed",
	invalidBundle: "Not an installable DSH bundle",
	bundleVersion: "Version",
	source: "Source",
	sourceGithub: "GitHub repository",
	buildPermission: "This repository has a prepare install script. I understand this executes third-party code and allow build permission for this plugin.",
	installing: "Installing…",
	installed: "Installed. Restart DSH to apply it.",
	installedFromSource: "Installed from the verified source fallback because no usable Release was available. Restart DSH to apply it.",
	restartNow: "Restart DSH now",
	restartUnavailable: "Restart the target profile to apply it.",
	installFailed: "Installation did not finish.",
	profileFailed: "The profile action did not finish.",
	stars: "Stars",
	updated: "Updated",
	sort: "Sort",
	sortUpdated: "Updated",
	sortStars: "Stars",
	sortAsc: "Ascending",
	sortDesc: "Descending",
	sortToggleToAsc: "Switch to ascending",
	sortToggleToDesc: "Switch to descending",
	loadingMore: "Loading more plugins…",
	loadMoreFailed: "More plugins could not be loaded. Refresh the list and try again.",
	catalogComplete: "All available plugins are loaded.",
	viewRepository: "View repository",
	close: "Collapse",
	noDescription: "This repository has no description.",
	dateLocale: "en-US",
	installedPlugins: "Installed plugins",
	installedPluginsHint: "GitHub plugins installed from a pinned commit are checked automatically when this page opens.",
	installedCount: "installed",
	updateAvailable: "Update available",
	upToDate: "Up to date",
	updateUnknown: "Update status unavailable",
	update: "Update",
	updating: "Updating…",
	updatedPlugin: "Plugin updated. Restart DSH to apply it.",
	updateFailed: "Plugin update did not finish.",
	selfUpdateAvailable: "Plugin marketplace update available",
	selfUpdateHint: "Choose \"Update now\" to install the latest stable version, then restart DSH to apply it.",
	selfUpdateNow: "Update now",
	selfUpdating: "Updating marketplace…",
	selfUpdated: "Marketplace updated. Restart DSH to apply it.",
	selfUpdateFailed: "The marketplace update did not finish.",
	remove: "Remove",
	removing: "Removing…",
	removeConfirm: "Remove this plugin? Restart DSH after removal to apply it.",
	removedPlugin: "Plugin removed. Restart DSH to apply it.",
	removeFailed: "Plugin removal did not finish."
};

//#endregion
//#region src/client/index.tsx
const inject = ["slots", "locale"];
const NS = "dsh-plugin-installer";
/** Add a narrow marketplace tab to the official Plugins settings section. */
function apply(ctx) {
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), "dsh-plugin-installer: dictionaries");
	const t = ctx.locale.bind(NS);
	ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
		name: "settings.plugins.tab",
		id: "marketplace",
		order: 20,
		label: () => t("tab"),
		locale: NS
	}, PluginMarketplaceSettingsTab));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
return module.exports; } });