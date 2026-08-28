/**
 * Build-time values bundlers replace before client code reaches a browser.
 *
 * The browser has no `process`, and the client program deliberately loads no
 * Node types. What client code may read is exactly what Vite and tsdown inline
 * — `SE373_CLIENT_*` and `NODE_ENV` — so this declaration is the compile-time
 * half of `scripts/client-build-environment.ts`: the prefix is the boundary,
 * and a variable without it is unreadable rather than merely absent.
 */
declare const process: {
  readonly env: {
    readonly NODE_ENV?: string
    readonly [name: `SE373_CLIENT_${string}`]: string | undefined
  }
}
