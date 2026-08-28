import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import css from './BoardOverlay.module.css';
/** The lifecycle phase as one word, including the two states that are not phases. */
function phaseOf(node) {
    if (node.lifecycle !== null)
        return node.lifecycle;
    return node.enabled ? 'not-live' : 'disabled';
}
/** Class for the lifecycle dot. Colour is redundant with the text beside it. */
function dotClass(node) {
    if (!node.enabled)
        return `${css.dot} ${css.dotDisabled}`;
    switch (node.lifecycle) {
        case 'active': return `${css.dot} ${css.dotActive}`;
        case 'failed': return `${css.dot} ${css.dotFailed}`;
        case 'pending':
        case 'loading':
        case 'unloading': return `${css.dot} ${css.dotPending}`;
        default: return `${css.dot}`;
    }
}
/** Whether a row matches the local query, over the fields a person would type. */
function matches(node, query) {
    if (query.length === 0)
        return true;
    return [node.entryId, node.moduleName, node.label ?? '', node.role ?? '', ...node.provides]
        .some(value => value.toLocaleLowerCase().includes(query));
}
/** One `key: value` line in the detail block. */
function Row({ label, children }) {
    return _jsxs("div", { children: [_jsxs("span", { className: css.detailKey, children: [label, " "] }), children] });
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
export function BoardOverlay({ t, snapshot: read }) {
    const [open, setOpen] = useState(false);
    const [state, setState] = useState({ status: 'idle' });
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(undefined);
    const refresh = useCallback(() => {
        setState({ status: 'loading' });
        read().then(snapshot => { setState({ status: 'ready', snapshot }); }, () => { setState({ status: 'error' }); });
    }, [read]);
    // Read on open rather than on mount: the board is a thing you go and look at,
    // and a snapshot nobody is looking at is a request nobody asked for.
    useEffect(() => { if (open)
        refresh(); }, [open, refresh]);
    const nodes = state.status === 'ready' ? state.snapshot.nodes : [];
    const normalized = query.trim().toLocaleLowerCase();
    const visible = useMemo(() => nodes.filter(node => matches(node, normalized)), [nodes, normalized]);
    const census = useMemo(() => {
        const live = nodes.filter(node => node.lifecycle === 'active').length;
        const off = nodes.filter(node => !node.enabled).length;
        return { live, off };
    }, [nodes]);
    const node = visible.find(candidate => candidate.entryId === selected);
    if (!open) {
        return (_jsx("div", { className: css.root, children: _jsxs("button", { type: "button", className: css.toggle, onClick: () => { setOpen(true); }, children: [t('open'), state.status === 'ready' ? _jsx("span", { className: css.count, children: state.snapshot.totalNodes }) : null] }) }));
    }
    return (_jsx("div", { className: css.root, children: _jsxs("div", { className: css.panel, children: [_jsxs("div", { className: css.header, children: [_jsx("strong", { children: t('open') }), _jsx("span", { className: css.census, children: state.status === 'ready'
                                ? `${String(state.snapshot.totalNodes)} ${t('rows')} · ${String(census.live)} active · ${String(census.off)} ${t('disabled')}`
                                : '' }), _jsxs("span", { children: [_jsx("button", { type: "button", className: css.toggle, onClick: refresh, children: t('refresh') }), ' ', _jsx("button", { type: "button", className: css.toggle, onClick: () => { setOpen(false); }, children: t('close') })] })] }), state.status === 'loading' ? _jsx("div", { className: css.status, children: t('loading') }) : null, state.status === 'error' ? _jsx("div", { className: css.status, children: t('error') }) : null, state.status === 'ready'
                    ? (_jsxs(_Fragment, { children: [_jsx("input", { className: css.search, type: "search", placeholder: t('search'), value: query, onChange: event => { setQuery(event.target.value); } }), _jsx("ul", { className: css.list, children: visible.map(candidate => (_jsx("li", { children: _jsxs("button", { type: "button", className: candidate.entryId === selected ? `${css.row} ${css.rowSelected}` : `${css.row}`, title: phaseOf(candidate), onClick: () => {
                                            setSelected(current => (current === candidate.entryId ? undefined : candidate.entryId));
                                        }, children: [_jsx("span", { className: dotClass(candidate), "aria-hidden": "true" }), _jsx("span", { className: css.rowId, children: candidate.label ?? candidate.entryId }), _jsx("span", { className: css.rowMeta, children: phaseOf(candidate) })] }) }, candidate.entryId))) }), visible.length === 0 ? _jsx("div", { className: css.status, children: t('empty') }) : null, node === undefined ? null : _jsx(BoardDetail, { node: node, t: t })] }))
                    : null] }) }));
}
/** The selected row, in full. Everything here travels with the snapshot. */
function BoardDetail({ node, t }) {
    const unsatisfied = node.edges.filter(edge => !edge.satisfied);
    return (_jsxs("div", { className: css.detail, children: [_jsx("div", { className: css.mono, children: node.entryId }), _jsx(Row, { label: "module", children: node.moduleName }), _jsxs(Row, { label: "lifecycle", children: [phaseOf(node), node.uid === null ? '' : ` · uid ${String(node.uid)}`] }), _jsxs(Row, { label: "structural", children: [node.structural, node.functional === null ? '' : ` · ${node.functional}`] }), node.role === null ? null : _jsxs(Row, { label: "role", children: [node.role, node.tier === null ? '' : ` · ${node.tier}`] }), _jsx(Row, { label: t('realm'), children: node.realm }), _jsx(Row, { label: t('provides'), children: node.provides.join(', ') || t('none') }), _jsx(Row, { label: t('injects'), children: node.edges.length === 0
                    ? t('none')
                    : node.edges.map(edge => (_jsxs("span", { className: edge.satisfied ? undefined : css.unsat, children: [edge.service, edge.satisfied ? ` → ${edge.providerEntryId ?? '(root)'}` : ` → ${t('unsatisfied')}`, '  '] }, edge.service))) }), unsatisfied.length === 0 || !node.enabled
                ? null
                : _jsx(Row, { label: t('waiting'), children: unsatisfied.map(edge => edge.service).join(', ') }), _jsx(Row, { label: t('transitions'), children: node.transitions.length === 0
                    ? t('none')
                    : node.transitions
                        .map(transition => `${transition.from ?? 'none'}→${transition.to ?? 'none'}@sn${String(transition.sn)}`)
                        .join('  ') }), _jsx("div", { className: css.detailKey, children: t('config') }), _jsx("pre", { className: `${css.pre} ${css.mono}`, children: JSON.stringify(node.config, null, 2) })] }));
}
//# sourceMappingURL=BoardOverlay.js.map