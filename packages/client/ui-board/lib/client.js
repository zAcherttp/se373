window.__ModuleLoader__.load({
	id: "@se373/client-ui-board",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region \0dsh-css:/Users/phat/dev/se373/packages/client/ui-board/src/client/BoardOverlay.module.css.mjs
		const css = ".T2sixG_root{pointer-events:none;flex-direction:column;align-items:flex-end;gap:8px;max-height:calc(100% - 32px);display:flex;position:absolute;bottom:16px;right:16px}.T2sixG_toggle{pointer-events:auto;border:1px solid var(--dsw-color-border-1,#ffffff1f);background:var(--dsw-color-bg-2,#202024);color:var(--dsw-color-text-1,#ebebf0);cursor:pointer;border-radius:999px;align-items:center;gap:6px;padding:6px 12px;font-size:12px;line-height:1.4;display:inline-flex}.T2sixG_toggle:hover{border-color:var(--dsw-color-border-2,#ffffff3d)}.T2sixG_count{color:var(--dsw-color-text-3,#9696a0);font-variant-numeric:tabular-nums}.T2sixG_panel{pointer-events:auto;border:1px solid var(--dsw-color-border-1,#ffffff1f);background:var(--dsw-color-bg-2,#1c1c20);width:min(560px,100vw - 48px);max-height:min(520px,100vh - 120px);color:var(--dsw-color-text-1,#ebebf0);border-radius:12px;flex-direction:column;gap:8px;padding:12px;display:flex;overflow:hidden;box-shadow:0 12px 40px #00000073}.T2sixG_header{justify-content:space-between;align-items:baseline;gap:8px;font-size:12px;display:flex}.T2sixG_census{color:var(--dsw-color-text-3,#9696a0);font-variant-numeric:tabular-nums}.T2sixG_search{border:1px solid var(--dsw-color-border-1,#ffffff1f);background:var(--dsw-color-bg-1,#141418);width:100%;color:inherit;border-radius:8px;padding:6px 8px;font-size:12px}.T2sixG_list{flex:auto;min-height:0;margin:0;padding:0;font-size:12px;list-style:none;overflow-y:auto}.T2sixG_row{width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:6px;grid-template-columns:8px 1fr auto;align-items:center;gap:8px;padding:4px 6px;display:grid}.T2sixG_row:hover{background:var(--dsw-color-bg-3,#ffffff0f)}.T2sixG_rowSelected{background:var(--dsw-color-bg-3,#ffffff1a)}.T2sixG_dot{background:var(--dsw-color-text-4,#6e6e78);border-radius:50%;width:8px;height:8px}.T2sixG_dotActive{background:#50be78}.T2sixG_dotPending{background:#e1b950}.T2sixG_dotFailed{background:#e16464}.T2sixG_dotDisabled{background:#5a5a64}.T2sixG_rowId{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.T2sixG_rowMeta{color:var(--dsw-color-text-3,#9696a0);font-size:11px}.T2sixG_detail{border-top:1px solid var(--dsw-color-border-1,#ffffff1f);flex:none;max-height:220px;padding-top:8px;font-size:11px;line-height:1.6;overflow-y:auto}.T2sixG_detailKey{color:var(--dsw-color-text-3,#9696a0)}.T2sixG_mono{font-family:var(--dsw-font-mono,ui-monospace, monospace)}.T2sixG_unsat{color:#e18282}.T2sixG_pre{white-space:pre-wrap;word-break:break-word;margin:4px 0 0}.T2sixG_status{color:var(--dsw-color-text-3,#9696a0);padding:12px 4px}";
		const tagId = "@se373/client-ui-board/BoardOverlay.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@se373/client-ui-board";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var BoardOverlay_module_css_default = {
			"census": "T2sixG_census",
			"count": "T2sixG_count",
			"detail": "T2sixG_detail",
			"detailKey": "T2sixG_detailKey",
			"dot": "T2sixG_dot",
			"dotActive": "T2sixG_dotActive",
			"dotDisabled": "T2sixG_dotDisabled",
			"dotFailed": "T2sixG_dotFailed",
			"dotPending": "T2sixG_dotPending",
			"header": "T2sixG_header",
			"list": "T2sixG_list",
			"mono": "T2sixG_mono",
			"panel": "T2sixG_panel",
			"pre": "T2sixG_pre",
			"root": "T2sixG_root",
			"row": "T2sixG_row",
			"rowId": "T2sixG_rowId",
			"rowMeta": "T2sixG_rowMeta",
			"rowSelected": "T2sixG_rowSelected",
			"search": "T2sixG_search",
			"status": "T2sixG_status",
			"toggle": "T2sixG_toggle",
			"unsat": "T2sixG_unsat"
		};
		//#endregion
		//#region lib/types/client/BoardOverlay.js
		/** The lifecycle phase as one word, including the two states that are not phases. */
		function phaseOf(node) {
			if (node.lifecycle !== null) return node.lifecycle;
			return node.enabled ? "not-live" : "disabled";
		}
		/** Class for the lifecycle dot. Colour is redundant with the text beside it. */
		function dotClass(node) {
			if (!node.enabled) return `${BoardOverlay_module_css_default.dot} ${BoardOverlay_module_css_default.dotDisabled}`;
			switch (node.lifecycle) {
				case "active": return `${BoardOverlay_module_css_default.dot} ${BoardOverlay_module_css_default.dotActive}`;
				case "failed": return `${BoardOverlay_module_css_default.dot} ${BoardOverlay_module_css_default.dotFailed}`;
				case "pending":
				case "loading":
				case "unloading": return `${BoardOverlay_module_css_default.dot} ${BoardOverlay_module_css_default.dotPending}`;
				default: return `${BoardOverlay_module_css_default.dot}`;
			}
		}
		/** Whether a row matches the local query, over the fields a person would type. */
		function matches(node, query) {
			if (query.length === 0) return true;
			return [
				node.entryId,
				node.moduleName,
				node.label ?? "",
				node.role ?? "",
				...node.provides
			].some((value) => value.toLocaleLowerCase().includes(query));
		}
		/** One `key: value` line in the detail block. */
		function Row({ label, children }) {
			return (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsxs)("span", {
				className: BoardOverlay_module_css_default.detailKey,
				children: [label, " "]
			}), children] });
		}
		/**
		* The runtime board: every configured row of the tree this UI is served by.
		*
		* Deliberately a panel and not a canvas. The projection's own argument is that
		* the questions worth asking are "what is running", "what failed", and "why is
		* this one stuck" — all three are answered by a list with a detail block, and
		* none of them is answered better by a layout algorithm. The graph drawing is
		* the part to add once there is something it explains that this does not.
		* @param props - the slot's runtime share, the locale seat, and the Remote face.
		* @returns the collapsed pill, or the open panel.
		*/
		function BoardOverlay({ t, snapshot: read }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [state, setState] = (0, react.useState)({ status: "idle" });
			const [query, setQuery] = (0, react.useState)("");
			const [selected, setSelected] = (0, react.useState)(void 0);
			const refresh = (0, react.useCallback)(() => {
				setState({ status: "loading" });
				read().then((snapshot) => {
					setState({
						status: "ready",
						snapshot
					});
				}, () => {
					setState({ status: "error" });
				});
			}, [read]);
			(0, react.useEffect)(() => {
				if (open) refresh();
			}, [open, refresh]);
			const nodes = state.status === "ready" ? state.snapshot.nodes : [];
			const normalized = query.trim().toLocaleLowerCase();
			const visible = (0, react.useMemo)(() => nodes.filter((node) => matches(node, normalized)), [nodes, normalized]);
			const census = (0, react.useMemo)(() => {
				return {
					live: nodes.filter((node) => node.lifecycle === "active").length,
					off: nodes.filter((node) => !node.enabled).length
				};
			}, [nodes]);
			const node = visible.find((candidate) => candidate.entryId === selected);
			if (!open) return (0, react_jsx_runtime.jsx)("div", {
				className: BoardOverlay_module_css_default.root,
				children: (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: BoardOverlay_module_css_default.toggle,
					onClick: () => {
						setOpen(true);
					},
					children: [t("open"), state.status === "ready" ? (0, react_jsx_runtime.jsx)("span", {
						className: BoardOverlay_module_css_default.count,
						children: state.snapshot.totalNodes
					}) : null]
				})
			});
			return (0, react_jsx_runtime.jsx)("div", {
				className: BoardOverlay_module_css_default.root,
				children: (0, react_jsx_runtime.jsxs)("div", {
					className: BoardOverlay_module_css_default.panel,
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: BoardOverlay_module_css_default.header,
							children: [
								(0, react_jsx_runtime.jsx)("strong", { children: t("open") }),
								(0, react_jsx_runtime.jsx)("span", {
									className: BoardOverlay_module_css_default.census,
									children: state.status === "ready" ? `${String(state.snapshot.totalNodes)} ${t("rows")} · ${String(census.live)} active · ${String(census.off)} ${t("disabled")}` : ""
								}),
								(0, react_jsx_runtime.jsxs)("span", { children: [
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: BoardOverlay_module_css_default.toggle,
										onClick: refresh,
										children: t("refresh")
									}),
									" ",
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: BoardOverlay_module_css_default.toggle,
										onClick: () => {
											setOpen(false);
										},
										children: t("close")
									})
								] })
							]
						}),
						state.status === "loading" ? (0, react_jsx_runtime.jsx)("div", {
							className: BoardOverlay_module_css_default.status,
							children: t("loading")
						}) : null,
						state.status === "error" ? (0, react_jsx_runtime.jsx)("div", {
							className: BoardOverlay_module_css_default.status,
							children: t("error")
						}) : null,
						state.status === "ready" ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							(0, react_jsx_runtime.jsx)("input", {
								className: BoardOverlay_module_css_default.search,
								type: "search",
								placeholder: t("search"),
								value: query,
								onChange: (event) => {
									setQuery(event.target.value);
								}
							}),
							(0, react_jsx_runtime.jsx)("ul", {
								className: BoardOverlay_module_css_default.list,
								children: visible.map((candidate) => (0, react_jsx_runtime.jsx)("li", { children: (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: candidate.entryId === selected ? `${BoardOverlay_module_css_default.row} ${BoardOverlay_module_css_default.rowSelected}` : `${BoardOverlay_module_css_default.row}`,
									title: phaseOf(candidate),
									onClick: () => {
										setSelected((current) => current === candidate.entryId ? void 0 : candidate.entryId);
									},
									children: [
										(0, react_jsx_runtime.jsx)("span", {
											className: dotClass(candidate),
											"aria-hidden": "true"
										}),
										(0, react_jsx_runtime.jsx)("span", {
											className: BoardOverlay_module_css_default.rowId,
											children: candidate.label ?? candidate.entryId
										}),
										(0, react_jsx_runtime.jsx)("span", {
											className: BoardOverlay_module_css_default.rowMeta,
											children: phaseOf(candidate)
										})
									]
								}) }, candidate.entryId))
							}),
							visible.length === 0 ? (0, react_jsx_runtime.jsx)("div", {
								className: BoardOverlay_module_css_default.status,
								children: t("empty")
							}) : null,
							node === void 0 ? null : (0, react_jsx_runtime.jsx)(BoardDetail, {
								node,
								t
							})
						] }) : null
					]
				})
			});
		}
		/** The selected row, in full. Everything here travels with the snapshot. */
		function BoardDetail({ node, t }) {
			const unsatisfied = node.edges.filter((edge) => !edge.satisfied);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: BoardOverlay_module_css_default.detail,
				children: [
					(0, react_jsx_runtime.jsx)("div", {
						className: BoardOverlay_module_css_default.mono,
						children: node.entryId
					}),
					(0, react_jsx_runtime.jsx)(Row, {
						label: "module",
						children: node.moduleName
					}),
					(0, react_jsx_runtime.jsxs)(Row, {
						label: "lifecycle",
						children: [phaseOf(node), node.uid === null ? "" : ` · uid ${String(node.uid)}`]
					}),
					(0, react_jsx_runtime.jsxs)(Row, {
						label: "structural",
						children: [node.structural, node.functional === null ? "" : ` · ${node.functional}`]
					}),
					node.role === null ? null : (0, react_jsx_runtime.jsxs)(Row, {
						label: "role",
						children: [node.role, node.tier === null ? "" : ` · ${node.tier}`]
					}),
					(0, react_jsx_runtime.jsx)(Row, {
						label: t("realm"),
						children: node.realm
					}),
					(0, react_jsx_runtime.jsx)(Row, {
						label: t("provides"),
						children: node.provides.join(", ") || t("none")
					}),
					(0, react_jsx_runtime.jsx)(Row, {
						label: t("injects"),
						children: node.edges.length === 0 ? t("none") : node.edges.map((edge) => (0, react_jsx_runtime.jsxs)("span", {
							className: edge.satisfied ? void 0 : BoardOverlay_module_css_default.unsat,
							children: [
								edge.service,
								edge.satisfied ? ` → ${edge.providerEntryId ?? "(root)"}` : ` → ${t("unsatisfied")}`,
								"  "
							]
						}, edge.service))
					}),
					unsatisfied.length === 0 || !node.enabled ? null : (0, react_jsx_runtime.jsx)(Row, {
						label: t("waiting"),
						children: unsatisfied.map((edge) => edge.service).join(", ")
					}),
					(0, react_jsx_runtime.jsx)(Row, {
						label: t("transitions"),
						children: node.transitions.length === 0 ? t("none") : node.transitions.map((transition) => `${transition.from ?? "none"}→${transition.to ?? "none"}@sn${String(transition.sn)}`).join("  ")
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: BoardOverlay_module_css_default.detailKey,
						children: t("config")
					}),
					(0, react_jsx_runtime.jsx)("pre", {
						className: `${BoardOverlay_module_css_default.pre} ${BoardOverlay_module_css_default.mono}`,
						children: JSON.stringify(node.config, null, 2)
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** Copy dictionaries for the runtime board. */
		/** Simplified Chinese dictionary and key source of truth. */
		const zh = {
			open: "运行时视图",
			close: "关闭",
			refresh: "刷新",
			loading: "正在读取运行时…",
			error: "暂时无法读取运行时。",
			search: "搜索组件",
			empty: "没有匹配的组件。",
			rows: "行",
			disabled: "已停用",
			notLive: "未挂载",
			waiting: "等待依赖",
			realm: "隔离域",
			provides: "提供",
			injects: "依赖",
			unsatisfied: "未满足",
			transitions: "状态变化（不是日志）",
			config: "配置",
			none: "无",
			captured: "快照时间"
		};
		/** English dictionary. */
		const en = {
			open: "Runtime",
			close: "Close",
			refresh: "Refresh",
			loading: "Reading the runtime…",
			error: "The runtime could not be read.",
			search: "Search components",
			empty: "No component matches.",
			rows: "rows",
			disabled: "disabled",
			notLive: "not live",
			waiting: "waiting on",
			realm: "realm",
			provides: "provides",
			injects: "injects",
			unsatisfied: "unsatisfied",
			transitions: "transitions — state changes, not log lines",
			config: "config",
			none: "none",
			captured: "captured"
		};
		//#endregion
		//#region lib/types/client/index.js
		/**
		* The runtime board, registered into the shell's frame-wide overlay.
		*
		* `shell.overlay` is upstream's documented seat for "a frame-wide surface of
		* your own" — additive, so nothing of dsh's is displaced, and root-scoped,
		* which matches what the board is about: the process, not a session. It is also
		* the only slot in the layout that is not already occupied, and that is not a
		* coincidence. The other three replace a whole column.
		*
		* @module @se373/client-ui-board/client
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "board";
		/** Services required by the overlay registration and the generated Remote face. */
		const inject = [
			"slots",
			"locale",
			"remote",
			"remote.board"
		];
		/**
		* Contribute the board to the shell overlay.
		* @param ctx - the browser-side Cordis context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-board: dictionaries");
			const snapshot = async () => {
				const result = await ctx.remote.board.snapshot();
				if (!result.ok) throw new Error(`board.snapshot failed: ${result.error.code}: ${result.error.message}`);
				return result.value;
			};
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "runtime-board",
				order: 100,
				locale: NS,
				inject: () => ({ snapshot })
			}, BoardOverlay));
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map