/**
 * Package-owned invariant companion for `@se373/workspace`.
 * @module @se373/workspace/invariant
 */

import type { Context } from '@se373/cordis'
import type { InvariantInstaller } from '@se373/invariants'
import type { DomainChanged } from '@se373/storage-domain'
import { WorkspaceId } from '@se373/workspace'

const PACKAGE_NAME = '@se373/workspace'

/** Cordis companion plugin name. */
export const name = 'workspace-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Owned relationship: the registry's entity cache mirrors the workspace
 * domain's durable table. Every `domain/changed` for the `workspaces` table
 * must name a record the cache already holds an entity for (the registry
 * caches before the durable put and mutates only through cached entities).
 * A delete is valid only after the registry has removed the entity from its
 * cache, whether for create rollback or an explicit registration deletion;
 * deleting while the cache still publishes the entity proves a bypass.
 */
const install: InvariantInstaller = Object.assign(
  (ctx: Context, fail: (message: string) => never) => {
    ctx.on('domain/changed', (change: DomainChanged) => {
      if (change.domain !== 'workspace' || change.table !== 'workspaces') return
      if (change.operation === 'deleted') {
        if (ctx.workspaceRegistry.get(WorkspaceId(change.key)) !== undefined) {
          fail(
            `workspace record '${change.key}' was deleted while the registry cache still `
            + 'publishes it — some write path bypassed ctx.workspaceRegistry',
          )
        }
        return
      }
      if (ctx.workspaceRegistry.get(WorkspaceId(change.key)) === undefined) {
        fail(
          `workspace record '${change.key}' landed durably but the registry cache holds `
          + 'no entity for it — the cache and the domain table have diverged',
        )
      }
    })
  },
  { inject: ['workspaceRegistry'] },
)

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
