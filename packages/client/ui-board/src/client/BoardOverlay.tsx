import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BoardNode, BoardSnapshot } from '@se373/board-gateway/types'
import type { InjectFace, PropsLocale, PropsRuntime } from '@se373/client-ui-slots'
// Side-effect type import: `shell.overlay` is declared by the layout package's
// SlotMap augmentation, and a declare-merge only reaches a consumer that names
// the module it was written in.
import type {} from '@se373/client-ui-layout/client'
import css from './BoardOverlay.module.css'

/** Registration-side Remote face the board reads through. */
export interface BoardOverlayInjected {
  /** Read a current snapshot of the runtime graph. */
  snapshot: () => Promise<BoardSnapshot>
}

/** Full component props assembled by the shell-overlay slot renderer. */
export type BoardOverlayProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<'board'>
  & InjectFace<BoardOverlayInjected>

type ViewState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: BoardSnapshot }

/** The lifecycle phase as one word, including the two states that are not phases. */
function phaseOf(node: BoardNode): string {
  if (node.lifecycle !== null) return node.lifecycle
  return node.enabled ? 'not-live' : 'disabled'
}

/** Class for the lifecycle dot. Colour is redundant with the text beside it. */
function dotClass(node: BoardNode): string {
  if (!node.enabled) return `${css.dot} ${css.dotDisabled}`
  switch (node.lifecycle) {
    case 'active': return `${css.dot} ${css.dotActive}`
    case 'failed': return `${css.dot} ${css.dotFailed}`
    case 'pending':
    case 'loading':
    case 'unloading': return `${css.dot} ${css.dotPending}`
    default: return `${css.dot}`
  }
}

/** Whether a row matches the local query, over the fields a person would type. */
function matches(node: BoardNode, query: string): boolean {
  if (query.length === 0) return true
  return [node.entryId, node.moduleName, node.label ?? '', node.role ?? '', ...node.provides]
    .some(value => value.toLocaleLowerCase().includes(query))
}

/** One `key: value` line in the detail block. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><span className={css.detailKey}>{label} </span>{children}</div>
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
export function BoardOverlay({ t, snapshot: read }: BoardOverlayProps) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<ViewState>({ status: 'idle' })
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | undefined>(undefined)

  const refresh = useCallback(() => {
    setState({ status: 'loading' })
    read().then(
      snapshot => { setState({ status: 'ready', snapshot }) },
      () => { setState({ status: 'error' }) },
    )
  }, [read])

  // Read on open rather than on mount: the board is a thing you go and look at,
  // and a snapshot nobody is looking at is a request nobody asked for.
  useEffect(() => { if (open) refresh() }, [open, refresh])

  const nodes = state.status === 'ready' ? state.snapshot.nodes : []
  const normalized = query.trim().toLocaleLowerCase()
  const visible = useMemo(() => nodes.filter(node => matches(node, normalized)), [nodes, normalized])
  const census = useMemo(() => {
    const live = nodes.filter(node => node.lifecycle === 'active').length
    const off = nodes.filter(node => !node.enabled).length
    return { live, off }
  }, [nodes])
  const node = visible.find(candidate => candidate.entryId === selected)

  if (!open) {
    return (
      <div className={css.root}>
        <button type="button" className={css.toggle} onClick={() => { setOpen(true) }}>
          {t('open')}
          {state.status === 'ready' ? <span className={css.count}>{state.snapshot.totalNodes}</span> : null}
        </button>
      </div>
    )
  }

  return (
    <div className={css.root}>
      <div className={css.panel}>
        <div className={css.header}>
          <strong>{t('open')}</strong>
          <span className={css.census}>
            {state.status === 'ready'
              ? `${String(state.snapshot.totalNodes)} ${t('rows')} · ${String(census.live)} active · ${String(census.off)} ${t('disabled')}`
              : ''}
          </span>
          <span>
            <button type="button" className={css.toggle} onClick={refresh}>{t('refresh')}</button>
            {' '}
            <button type="button" className={css.toggle} onClick={() => { setOpen(false) }}>{t('close')}</button>
          </span>
        </div>

        {state.status === 'loading' ? <div className={css.status}>{t('loading')}</div> : null}
        {state.status === 'error' ? <div className={css.status}>{t('error')}</div> : null}

        {state.status === 'ready'
          ? (
            <>
              <input
                className={css.search}
                type="search"
                placeholder={t('search')}
                value={query}
                onChange={event => { setQuery(event.target.value) }}
              />
              <ul className={css.list}>
                {visible.map(candidate => (
                  <li key={candidate.entryId}>
                    <button
                      type="button"
                      className={candidate.entryId === selected ? `${css.row} ${css.rowSelected}` : `${css.row}`}
                      title={phaseOf(candidate)}
                      onClick={() => {
                        setSelected(current => (current === candidate.entryId ? undefined : candidate.entryId))
                      }}
                    >
                      <span className={dotClass(candidate)} aria-hidden="true" />
                      <span className={css.rowId}>{candidate.label ?? candidate.entryId}</span>
                      <span className={css.rowMeta}>{phaseOf(candidate)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {visible.length === 0 ? <div className={css.status}>{t('empty')}</div> : null}
              {node === undefined ? null : <BoardDetail node={node} t={t} />}
            </>
          )
          : null}
      </div>
    </div>
  )
}

/** The selected row, in full. Everything here travels with the snapshot. */
function BoardDetail({ node, t }: { node: BoardNode; t: BoardOverlayProps['t'] }) {
  const unsatisfied = node.edges.filter(edge => !edge.satisfied)
  return (
    <div className={css.detail}>
      <div className={css.mono}>{node.entryId}</div>
      <Row label="module">{node.moduleName}</Row>
      <Row label="lifecycle">{phaseOf(node)}{node.uid === null ? '' : ` · uid ${String(node.uid)}`}</Row>
      <Row label="structural">{node.structural}{node.functional === null ? '' : ` · ${node.functional}`}</Row>
      {node.role === null ? null : <Row label="role">{node.role}{node.tier === null ? '' : ` · ${node.tier}`}</Row>}
      <Row label={t('realm')}>{node.realm}</Row>
      <Row label={t('provides')}>{node.provides.join(', ') || t('none')}</Row>
      <Row label={t('injects')}>
        {node.edges.length === 0
          ? t('none')
          : node.edges.map(edge => (
            <span key={edge.service} className={edge.satisfied ? undefined : css.unsat}>
              {edge.service}
              {edge.satisfied ? ` → ${edge.providerEntryId ?? '(root)'}` : ` → ${t('unsatisfied')}`}
              {'  '}
            </span>
          ))}
      </Row>
      {unsatisfied.length === 0 || !node.enabled
        ? null
        : <Row label={t('waiting')}>{unsatisfied.map(edge => edge.service).join(', ')}</Row>}
      <Row label={t('transitions')}>
        {node.transitions.length === 0
          ? t('none')
          : node.transitions
            .map(transition => `${transition.from ?? 'none'}→${transition.to ?? 'none'}@sn${String(transition.sn)}`)
            .join('  ')}
      </Row>
      <div className={css.detailKey}>{t('config')}</div>
      <pre className={`${css.pre} ${css.mono}`}>{JSON.stringify(node.config, null, 2)}</pre>
    </div>
  )
}
