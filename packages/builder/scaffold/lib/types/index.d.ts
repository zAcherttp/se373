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
/** A name that is safe as a directory segment. Same shape as upstream's preset ids. */
export declare const SCAFFOLD_NAME: RegExp;
/** Files to write, keyed by root-relative path. A trailing `/` creates a bare directory. */
export type ScaffoldTree = Readonly<Record<string, string>>;
/** Thrown when a scaffold write would violate one of the three rules. */
export declare class ScaffoldError extends Error {
    /** Stable machine-readable code. */
    readonly code: 'SCAFFOLD_NAME' | 'SCAFFOLD_EXISTS' | 'SCAFFOLD_ESCAPE';
    constructor(code: ScaffoldError['code'], message: string);
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
export declare function writeScaffold(root: string, name: string, tree: ScaffoldTree): string;
/**
 * Remove a scaffold.
 * @param root - the namespace directory.
 * @param name - the scaffold to remove; unknown names are a no-op.
 */
export declare function removeScaffold(root: string, name: string): void;
/**
 * Every scaffold name present in a namespace.
 * @param root - the namespace directory.
 * @returns names, sorted; empty when the root does not exist.
 */
export declare function listScaffolds(root: string): string[];
//# sourceMappingURL=index.d.ts.map