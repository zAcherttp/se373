/**
 * Host loader entry for the runtime board, whose browser half is `./client`.
 *
 * There is nothing for the host to do: the data already exists as
 * `ctx.runtimeGraph`, and `@se373/board-gateway` is what carries it across.
 * This file exists because `client-modules` scans loader rows for their
 * `dsh.client` declaration, and a browser plugin is a row like any other.
 *
 * @module @se373/client-ui-board
 */

/** Host plugin body — the board has no host-side behavior of its own. */
export function apply(): void {}
