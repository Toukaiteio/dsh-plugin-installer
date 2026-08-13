window.__ModuleLoader__.load({ id: "dsh-plugin-installer", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");

//#region \0dsh-plugin-installer-css:E:\pj2\dsh-plugin-installer\src\client\PluginMarketplaceSettingsTab.module.css.mjs
const css = ".Vb6T7a_root{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:16px;display:flex}.Vb6T7a_row p,.Vb6T7a_review p,.Vb6T7a_status,.Vb6T7a_error,.Vb6T7a_success{margin:0}.Vb6T7a_status{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.Vb6T7a_profileBar,.Vb6T7a_search,.Vb6T7a_reviewActions,.Vb6T7a_rowActions,.Vb6T7a_row,.Vb6T7a_reviewHeading{align-items:center;gap:10px;display:flex}.Vb6T7a_profileBar{flex-wrap:nowrap;min-width:0}.Vb6T7a_profileBar label,.Vb6T7a_newProfile{color:var(--dsw-alias-label-secondary);align-items:center;gap:7px;font-size:12px;line-height:18px;display:inline-flex}.Vb6T7a_profileBar select,.Vb6T7a_profileBar input,.Vb6T7a_search input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);height:34px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:7px;outline:none;padding:0 10px;font-size:13px}.Vb6T7a_profileBar input{width:128px}.Vb6T7a_newProfile{margin-left:auto}.Vb6T7a_newProfileLabel{white-space:nowrap}.Vb6T7a_search input{flex:1;min-width:0;height:36px}.Vb6T7a_profileBar select:focus-visible,.Vb6T7a_profileBar input:focus-visible,.Vb6T7a_search input:focus-visible,.Vb6T7a_secondaryButton:focus-visible,.Vb6T7a_primaryButton:focus-visible,.Vb6T7a_textButton:focus-visible,.Vb6T7a_row a:focus-visible,.Vb6T7a_review a:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.Vb6T7a_secondaryButton,.Vb6T7a_primaryButton,.Vb6T7a_textButton,.Vb6T7a_installedTag{font:inherit;cursor:pointer;border:0;border-radius:7px;font-size:13px;line-height:20px}.Vb6T7a_secondaryButton{border:1px solid var(--dsw-alias-border-l2);min-height:34px;color:var(--dsw-alias-label-primary);white-space:nowrap;background:0 0;padding:6px 11px}.Vb6T7a_secondaryButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.Vb6T7a_primaryButton{background:var(--dsw-alias-label-primary);min-height:36px;color:var(--dsw-alias-bg-layer-1);padding:7px 12px}.Vb6T7a_primaryButton:hover:not(:disabled){opacity:.9}.Vb6T7a_textButton{color:var(--dsw-alias-label-secondary);background:0 0;padding:4px}.Vb6T7a_installedTag{box-sizing:border-box;min-height:34px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;align-items:center;padding:6px 11px;display:inline-flex}.Vb6T7a_textButton:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.Vb6T7a_secondaryButton:disabled,.Vb6T7a_primaryButton:disabled,.Vb6T7a_textButton:disabled{opacity:.48;cursor:not-allowed}.Vb6T7a_error,.Vb6T7a_success{border-radius:7px;padding:9px 11px;font-size:13px;line-height:20px}.Vb6T7a_error{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent);color:var(--dsw-alias-state-error-primary)}.Vb6T7a_success{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, transparent);color:var(--dsw-alias-state-success-primary)}.Vb6T7a_review{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:9px;padding:14px}.Vb6T7a_reviewHeading{justify-content:space-between;align-items:flex-start}.Vb6T7a_reviewHeading strong,.Vb6T7a_repository{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:20px}.Vb6T7a_reviewHeading p{color:var(--dsw-alias-label-secondary);margin-top:3px;font-size:13px;line-height:20px}.Vb6T7a_details{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0;display:grid}.Vb6T7a_details div{gap:7px;min-width:0;display:flex}.Vb6T7a_details dt{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.Vb6T7a_details dd{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;margin:0;font-size:12px;line-height:18px}.Vb6T7a_permission{color:var(--dsw-alias-label-secondary);align-items:flex-start;gap:8px;margin:0 0 14px;font-size:12px;line-height:18px;display:flex}.Vb6T7a_permission input{accent-color:var(--dsw-alias-state-business-primary);margin:3px 0 0}.Vb6T7a_reviewActions{flex-wrap:wrap}.Vb6T7a_reviewActions a{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.Vb6T7a_catalog,.Vb6T7a_installed{flex-direction:column;gap:10px;display:flex}.Vb6T7a_sectionHeading h2{color:var(--dsw-alias-label-primary);margin:0;font-size:14px;font-weight:600;line-height:20px}.Vb6T7a_sectionHeading p{color:var(--dsw-alias-label-tertiary);margin:3px 0 0;font-size:12px;line-height:18px}.Vb6T7a_rows{border-top:1px solid var(--dsw-alias-border-l2);margin:0;padding:0;list-style:none}.Vb6T7a_row{border-bottom:1px solid var(--dsw-alias-border-l2);justify-content:space-between;align-items:flex-start;padding:13px 2px}.Vb6T7a_rowMain{min-width:0;padding-right:12px}.Vb6T7a_rowActions{flex:none;align-items:center}.Vb6T7a_repository{overflow-wrap:anywhere;text-decoration:none;display:inline-block}.Vb6T7a_repository:hover{text-decoration:underline}.Vb6T7a_row p{color:var(--dsw-alias-label-secondary);margin-top:3px;font-size:13px;line-height:19px}.Vb6T7a_row span{color:var(--dsw-alias-label-tertiary);margin-top:5px;font-size:11px;line-height:17px;display:block}.Vb6T7a_visuallyHidden{clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}@media (width<=680px){.Vb6T7a_profileBar{flex-wrap:wrap}.Vb6T7a_newProfile{margin-left:0}.Vb6T7a_row{gap:8px}.Vb6T7a_rowActions{flex-wrap:wrap;justify-content:flex-end}.Vb6T7a_details{grid-template-columns:1fr}}";
const tagId = "dsh-plugin-installer/PluginMarketplaceSettingsTab.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-plugin-installer";
	tag.dataset.pluginCss = tagId;
	tag.textContent = css;
	document.head.appendChild(tag);
}
var PluginMarketplaceSettingsTab_module_css_default = {
	"profileBar": "Vb6T7a_profileBar",
	"status": "Vb6T7a_status",
	"root": "Vb6T7a_root",
	"rowActions": "Vb6T7a_rowActions",
	"reviewHeading": "Vb6T7a_reviewHeading",
	"newProfile": "Vb6T7a_newProfile",
	"catalog": "Vb6T7a_catalog",
	"review": "Vb6T7a_review",
	"error": "Vb6T7a_error",
	"permission": "Vb6T7a_permission",
	"installed": "Vb6T7a_installed",
	"visuallyHidden": "Vb6T7a_visuallyHidden",
	"textButton": "Vb6T7a_textButton",
	"success": "Vb6T7a_success",
	"installedTag": "Vb6T7a_installedTag",
	"row": "Vb6T7a_row",
	"secondaryButton": "Vb6T7a_secondaryButton",
	"reviewActions": "Vb6T7a_reviewActions",
	"newProfileLabel": "Vb6T7a_newProfileLabel",
	"primaryButton": "Vb6T7a_primaryButton",
	"details": "Vb6T7a_details",
	"rows": "Vb6T7a_rows",
	"rowMain": "Vb6T7a_rowMain",
	"search": "Vb6T7a_search",
	"sectionHeading": "Vb6T7a_sectionHeading",
	"repository": "Vb6T7a_repository"
};

//#endregion
//#region src/client/PluginMarketplaceSettingsTab.tsx
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
	if (!response.ok) throw new Error(body.error?.message ?? `Request failed (${response.status})`);
	return body;
}
function updated(value, locale) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
/** Marketplace UI: one toolbar, one inline review panel and a compact repository list. */
function PluginMarketplaceSettingsTab({ t }) {
	const [snapshot, setSnapshot] = (0, react.useState)(null);
	const [plugins, setPlugins] = (0, react.useState)([]);
	const [query, setQuery] = (0, react.useState)("");
	const [selectedProfile, setSelectedProfile] = (0, react.useState)("");
	const [candidate, setCandidate] = (0, react.useState)(null);
	const [loading, setLoading] = (0, react.useState)(true);
	const [working, setWorking] = (0, react.useState)(false);
	const [allowBuild, setAllowBuild] = (0, react.useState)(false);
	const [message, setMessage] = (0, react.useState)(null);
	const [restartAvailable, setRestartAvailable] = (0, react.useState)(false);
	const [newProfile, setNewProfile] = (0, react.useState)("");
	const load = async (search = query, preserveMessage = false) => {
		setLoading(true);
		if (!preserveMessage) setMessage(null);
		try {
			const [state, catalog] = await Promise.all([api("/state"), api(`/plugins?query=${encodeURIComponent(search)}`)]);
			setSnapshot(state);
			setSelectedProfile((current) => current || state.currentProfile);
			setPlugins(catalog.plugins);
		} catch (error) {
			setMessage({
				kind: "error",
				text: error instanceof Error ? error.message : t("loadFailed")
			});
		} finally {
			setLoading(false);
		}
	};
	(0, react.useEffect)(() => {
		load("");
	}, []);
	const profiles = snapshot?.profiles ?? [];
	const selectedSummary = profiles.find((profile) => profile.name === selectedProfile);
	const visiblePlugins = (0, react.useMemo)(() => plugins, [plugins]);
	const inspect = async (repository) => {
		setWorking(true);
		setCandidate(null);
		setAllowBuild(false);
		setRestartAvailable(false);
		setMessage(null);
		try {
			setCandidate((await api(`/plugin/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`)).plugin);
		} catch (error) {
			setMessage({
				kind: "error",
				text: error instanceof Error ? error.message : t("installFailed")
			});
		} finally {
			setWorking(false);
		}
	};
	const install = async () => {
		if (candidate === null || !candidate.validBundle) return;
		setWorking(true);
		setMessage(null);
		setRestartAvailable(false);
		try {
			const result = await api("/install", {
				method: "POST",
				body: JSON.stringify({
					profile: selectedProfile,
					owner: candidate.repository.owner,
					repository: candidate.repository.name,
					allowBuild
				})
			});
			await load(query, true);
			setMessage({
				kind: "success",
				text: t("installed")
			});
			setRestartAvailable(result.restartAvailable);
			setCandidate(null);
		} catch (error) {
			setMessage({
				kind: "error",
				text: error instanceof Error ? error.message : t("installFailed")
			});
		} finally {
			setWorking(false);
		}
	};
	const openProfile = async () => {
		if (selectedSummary?.webCapable !== true) return;
		setWorking(true);
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
				text: error instanceof Error ? error.message : t("profileFailed")
			});
			setWorking(false);
		}
	};
	const createProfile = async () => {
		if (newProfile.trim().length === 0) return;
		setWorking(true);
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
				text: error instanceof Error ? error.message : t("profileFailed")
			});
			setWorking(false);
		}
	};
	const restartDsh = async () => {
		setWorking(true);
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
				text: error instanceof Error ? error.message : t("profileFailed")
			});
			setWorking(false);
		}
	};
	const updatePlugin = async (plugin) => {
		setWorking(true);
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
				text: error instanceof Error ? error.message : t("updateFailed")
			});
		} finally {
			setWorking(false);
		}
	};
	const removePlugin = async (plugin) => {
		if (!window.confirm(`${t("removeConfirm")}\n\n${plugin.packageName}`)) return;
		setWorking(true);
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
				text: error instanceof Error ? error.message : t("removeFailed")
			});
		} finally {
			setWorking(false);
		}
	};
	const isInstalled = (repository) => {
		if (selectedSummary === void 0) return false;
		const fullName = repository.fullName.toLocaleLowerCase();
		return selectedSummary.installedRepositories.includes(fullName);
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: PluginMarketplaceSettingsTab_module_css_default.root,
		"aria-busy": loading || working,
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
						disabled: profiles.length === 0 || working,
						children: profiles.map((profile) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: profile.name,
							children: profile.name
						}, profile.name))
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
						disabled: working || selectedSummary?.webCapable !== true,
						onClick: () => void openProfile(),
						children: t("openProfile")
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
							disabled: working
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
						disabled: working || newProfile.trim().length === 0,
						onClick: () => void createProfile(),
						children: t("createAndOpen")
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				className: PluginMarketplaceSettingsTab_module_css_default.search,
				onSubmit: (event) => {
					event.preventDefault();
					load(query);
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					value: query,
					type: "search",
					placeholder: t("search"),
					"aria-label": t("search"),
					onChange: (event) => setQuery(event.currentTarget.value)
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "submit",
					className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
					disabled: loading || working,
					children: t("refresh")
				})]
			}),
			message !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: message.kind === "error" ? PluginMarketplaceSettingsTab_module_css_default.error : PluginMarketplaceSettingsTab_module_css_default.success,
				role: message.kind === "error" ? "alert" : "status",
				children: message.text
			}) : null,
			message?.kind === "success" ? restartAvailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
				disabled: working,
				onClick: () => void restartDsh(),
				children: t("restartNow")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: PluginMarketplaceSettingsTab_module_css_default.status,
				children: t("restartUnavailable")
			}) : null,
			loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: PluginMarketplaceSettingsTab_module_css_default.status,
				children: t("loading")
			}) : null,
			selectedSummary !== void 0 && selectedSummary.installedPlugins.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: PluginMarketplaceSettingsTab_module_css_default.installed,
				"aria-label": t("installedPlugins"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.sectionHeading,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("installedPlugins") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("installedPluginsHint") })]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
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
								disabled: working,
								onClick: () => void updatePlugin(plugin),
								children: working ? t("updating") : t("update")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: PluginMarketplaceSettingsTab_module_css_default.installedTag,
								children: plugin.updateStatus === "up-to-date" ? t("upToDate") : t("updateUnknown")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
								disabled: working,
								onClick: () => void removePlugin(plugin),
								children: working ? t("removing") : t("remove")
							})]
						})]
					}, plugin.packageName))
				})]
			}) : null,
			candidate !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: PluginMarketplaceSettingsTab_module_css_default.review,
				"aria-live": "polite",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PluginMarketplaceSettingsTab_module_css_default.reviewHeading,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: candidate.repository.fullName }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: candidate.description ?? t("noDescription") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: PluginMarketplaceSettingsTab_module_css_default.textButton,
						disabled: working,
						onClick: () => setCandidate(null),
						children: t("close")
					})]
				}), candidate.validBundle ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
						className: PluginMarketplaceSettingsTab_module_css_default.details,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("bundleVersion") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: candidate.version ?? "—" })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("source") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t("sourceGithub") })] })]
					}),
					candidate.requiresBuildApproval ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: PluginMarketplaceSettingsTab_module_css_default.permission,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: allowBuild,
							onChange: (event) => setAllowBuild(event.currentTarget.checked),
							disabled: working
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("buildPermission") })]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PluginMarketplaceSettingsTab_module_css_default.reviewActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: PluginMarketplaceSettingsTab_module_css_default.primaryButton,
							disabled: working || candidate.requiresBuildApproval && !allowBuild || selectedProfile.length === 0,
							onClick: () => void install(),
							children: working ? t("installing") : t("install")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
							href: candidate.repository.url,
							target: "_blank",
							rel: "noreferrer",
							children: t("viewRepository")
						})]
					})
				] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: PluginMarketplaceSettingsTab_module_css_default.error,
					children: candidate.reason ?? t("invalidBundle")
				})]
			}) : null,
			!loading && candidate === null && visiblePlugins.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: PluginMarketplaceSettingsTab_module_css_default.status,
				children: t("empty")
			}) : null,
			candidate === null && visiblePlugins.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
				className: PluginMarketplaceSettingsTab_module_css_default.catalog,
				"aria-label": t("tab"),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: PluginMarketplaceSettingsTab_module_css_default.rows,
					children: visiblePlugins.map((plugin) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
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
						}), isInstalled(plugin) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: PluginMarketplaceSettingsTab_module_css_default.installedTag,
							children: t("installedPlugin")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: PluginMarketplaceSettingsTab_module_css_default.secondaryButton,
							disabled: working,
							onClick: () => void inspect(plugin),
							children: working ? t("inspecting") : t("install")
						})]
					}, plugin.fullName))
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
	loading: "正在加载插件列表…",
	loadFailed: "插件列表暂时不可用。",
	retry: "重试",
	empty: "没有找到匹配的插件。",
	install: "安装",
	inspecting: "正在检查 DSH bundle…",
	installedPlugin: "已安装",
	invalidBundle: "不是可安装的 DSH bundle",
	bundleVersion: "版本",
	source: "来源",
	sourceGithub: "GitHub 仓库",
	buildPermission: "此仓库包含 prepare 安装脚本；我了解这会执行第三方代码，并允许为该插件授予构建权限。",
	installing: "正在安装…",
	installed: "安装完成。重启 DSH 后生效。",
	restartNow: "立即重启 DSH",
	restartUnavailable: "请重启目标 Profile 后生效。",
	installFailed: "安装未完成。",
	profileFailed: "Profile 操作未完成。",
	stars: "星标",
	updated: "更新于",
	viewRepository: "查看仓库",
	close: "收起",
	noDescription: "该仓库没有提供说明。",
	dateLocale: "zh-CN",
	installedPlugins: "已安装插件",
	installedPluginsHint: "打开此页时会自动检查由 GitHub 固定提交安装的插件。",
	updateAvailable: "有可用更新",
	upToDate: "已是最新",
	updateUnknown: "暂无法检查更新",
	update: "更新",
	updating: "正在更新…",
	updatedPlugin: "插件已更新。重启 DSH 后生效。",
	updateFailed: "插件更新未完成。",
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
	loading: "Loading plugins…",
	loadFailed: "The plugin list is temporarily unavailable.",
	retry: "Retry",
	empty: "No matching plugins found.",
	install: "Install",
	inspecting: "Checking DSH bundle…",
	installedPlugin: "Installed",
	invalidBundle: "Not an installable DSH bundle",
	bundleVersion: "Version",
	source: "Source",
	sourceGithub: "GitHub repository",
	buildPermission: "This repository has a prepare install script. I understand this executes third-party code and allow build permission for this plugin.",
	installing: "Installing…",
	installed: "Installed. Restart DSH to apply it.",
	restartNow: "Restart DSH now",
	restartUnavailable: "Restart the target profile to apply it.",
	installFailed: "Installation did not finish.",
	profileFailed: "The profile action did not finish.",
	stars: "Stars",
	updated: "Updated",
	viewRepository: "View repository",
	close: "Collapse",
	noDescription: "This repository has no description.",
	dateLocale: "en-US",
	installedPlugins: "Installed plugins",
	installedPluginsHint: "GitHub plugins installed from a pinned commit are checked automatically when this page opens.",
	updateAvailable: "Update available",
	upToDate: "Up to date",
	updateUnknown: "Update status unavailable",
	update: "Update",
	updating: "Updating…",
	updatedPlugin: "Plugin updated. Restart DSH to apply it.",
	updateFailed: "Plugin update did not finish.",
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