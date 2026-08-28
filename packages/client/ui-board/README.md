# @se373/client-ui-board

## What it does

The board: a panel, in the browser, listing every configured row of the runtime
serving that page — running, waiting, failed and disabled alike.

It is our first client plugin, and that is most of what it demonstrates. A row
of ours registers a browser bundle, mounts a Remote namespace, and occupies a
slot in dsh's layout by exactly the same mechanisms dsh's own rows use. If the
rescope had broken a module edge, this is where it would have shown.

**A panel, not a canvas.** The projection's own argument is that the questions
worth asking are *what is running*, *what failed*, and *why is this one stuck* —
all three are answered by a list with a detail block, and none is answered
better by a layout algorithm. Drawing the graph is the part to add when there is
something it explains that this does not.

It sits in `shell.overlay`, upstream's documented seat for "a frame-wide surface
of your own". Additive, so nothing of dsh's is displaced, and root-scoped, which
is what the board is about — the process, not a session. It is also the only
slot in the layout that is not already occupied, and that is not a coincidence:
the other three replace a whole column.

## Depends on

| | Why |
|---|---|
| `ctx.remote.board` | the snapshot, through `@se373/board-gateway` and the `/api` fence |
| `ctx.slots` | the overlay seat, and the props kit the component is typed against |
| `ctx.locale` | the copy, in the two locales the GUI supports |
| `@se373/client-ui-layout` (type-only) | declares `shell.overlay` into `SlotMap`; a declare-merge only reaches a consumer that names the module it lives in |

## In / out

**Config in** — none.

**Rendered out** — a collapsed pill carrying the row count, which opens to a
census line, a search box, the row list, and a detail block for the selected
row: its axes, contributed semantics, realm, edges with who satisfies each,
transitions, and resolved config.

**Events emitted** — none. The board reads.

## Known Limitations and Deferred Work

- **It reads on open and on demand.** No live updates: the snapshot is
  point-in-time by contract, so a component that changed since you opened the
  panel needs `Refresh`. A push transport is decision D9.
- **No graph drawing.** No nodes, no edges, no layout — see above. The edge data
  is all in the payload when it is wanted.
- **The list is flat.** Group and include structure is in `parentEntryId` and is
  not rendered; a 112-row tree is short enough to search instead.
- **Colour carries the lifecycle axis, and never alone** — the phase is also the
  row's text and its `title`. The other two axes are text only.
- **Nothing is actionable.** You cannot enable, disable, or reload a row from
  here, because the projection beneath cannot either.
- **No tests.** Consistent with the project's standing decision to hold testing
  until the web plane is settled; this package is the web plane arriving.
