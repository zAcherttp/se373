/**
 * Namespaced directory writes that never collide and never escape.
 *
 * One mechanism, two customers, by design: a fabricated agent's workspace-and-
 * preset directory (6d step 2) and an authored fork's package directory (6d
 * step 3) are the same act — write a named tree into a namespace the model may
 * fill, under rules the model cannot vary. Building it twice would mean the
 * fork path and the preset path could drift on exactly the properties that make
 * the write safe.
 *
 * Three rules, each carrying one failure mode:
 *
 * - **A name is a single path segment**, matched against the same pattern
 *   upstream uses for preset ids, because the name becomes a directory name and
 *   anything else could escape the root.
 * - **A scaffold never overwrites.** The copy-on-write story — forks beside
 *   originals, v2 beside v1 — is only true if writing over an existing name is
 *   structurally impossible, not merely avoided.
 * - **Every relative path in the tree is checked against traversal.** The file
 *   list for a fork will one day be model-authored; `../` in a filename must be
 *   an error, not an instruction.
 *
 * @module @se373/scaffold
 */

import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

/** A name that is safe as a directory segment. Same shape as upstream's preset ids. */
export const SCAFFOLD_NAME = /^[a-z0-9][a-z0-9-]*$/

/** Files to write, keyed by root-relative path. A trailing `/` creates a bare directory. */
export type ScaffoldTree = Readonly<Record<string, string>>

/** Thrown when a scaffold write would violate one of the three rules. */
export class ScaffoldError extends Error {
  /** Stable machine-readable code. */
  readonly code: 'SCAFFOLD_NAME' | 'SCAFFOLD_EXISTS' | 'SCAFFOLD_ESCAPE'

  constructor(code: ScaffoldError['code'], message: string) {
    super(message)
    this.name = 'ScaffoldError'
    this.code = code
  }
}

/** Reject a name that could not be a single, safe directory segment. */
function checkName(name: string): void {
  if (!SCAFFOLD_NAME.test(name)) {
    throw new ScaffoldError(
      'SCAFFOLD_NAME',
      `scaffold name ${JSON.stringify(name)} must match ${String(SCAFFOLD_NAME)} — it becomes a directory name`,
    )
  }
}

/**
 * Resolve one tree path under the scaffold directory, refusing escape.
 *
 * Checked by resolving and comparing prefixes rather than by pattern-matching
 * the input: `..` is the obvious spelling of traversal and not the only one.
 * @param root - the scaffold's own directory.
 * @param path - a root-relative path from the tree.
 * @returns the absolute path.
 */
function resolveInside(root: string, path: string): string {
  const absolute = resolve(root, path)
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw new ScaffoldError('SCAFFOLD_ESCAPE', `tree path ${JSON.stringify(path)} escapes the scaffold directory`)
  }
  return absolute
}

/**
 * Write a named tree into a namespace root.
 *
 * All-or-nothing: paths are validated before anything is written, and a failure
 * partway removes the directory, so a scaffold either exists complete or not at
 * all. A half-written fork that later mounts is the failure this prevents.
 * @param root - the namespace directory, e.g. `$SE373_HOME/workspaces`.
 * @param name - the scaffold's name; becomes the directory.
 * @param tree - files by root-relative path; a key ending in `/` makes a bare directory.
 * @returns the scaffold's absolute directory.
 */
export function writeScaffold(root: string, name: string, tree: ScaffoldTree): string {
  checkName(name)
  const dir = join(resolve(root), name)
  if (existsSync(dir)) {
    throw new ScaffoldError(
      'SCAFFOLD_EXISTS',
      `scaffold ${JSON.stringify(name)} already exists in ${root}; a scaffold never overwrites — pick a new name or remove it first`,
    )
  }
  // Validate every path before creating anything, so a bad entry cannot leave
  // a partial tree behind for the catch below to matter less often.
  const entries = Object.entries(tree).map(([path, content]) => ({
    path,
    content,
    absolute: resolveInside(dir, path),
    bare: path.endsWith('/'),
  }))
  mkdirSync(dir, { recursive: true })
  try {
    for (const entry of entries) {
      if (entry.bare) {
        mkdirSync(entry.absolute, { recursive: true })
      } else {
        mkdirSync(dirname(entry.absolute), { recursive: true })
        writeFileSync(entry.absolute, entry.content)
      }
    }
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
  return dir
}

/**
 * Remove a scaffold.
 * @param root - the namespace directory.
 * @param name - the scaffold to remove; unknown names are a no-op.
 */
export function removeScaffold(root: string, name: string): void {
  checkName(name)
  rmSync(join(resolve(root), name), { recursive: true, force: true })
}

/**
 * Every scaffold name present in a namespace.
 * @param root - the namespace directory.
 * @returns names, sorted; empty when the root does not exist.
 */
export function listScaffolds(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(resolve(root), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && SCAFFOLD_NAME.test(entry.name))
    .map(entry => entry.name)
    .sort()
}
