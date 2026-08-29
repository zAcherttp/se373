/**
 * `ctx.corpusSources` over a directory tree — the default provider.
 *
 * Walks a list of roots, keeps files matching a suffix list, and yields one
 * document per file with a source-relative id.
 *
 * Two decisions worth stating, both about what `sourceRef` covers.
 *
 * **Roots are resolved and sorted before they are digested.** The same three
 * directories named in a different order, or named relatively from a different
 * working directory, are the same corpus, and a rebuild that fired because
 * somebody reordered a YAML list would teach people to distrust the mechanism.
 *
 * **The digest covers the selection rules, not the files.** Which files exist
 * is what a *crawl* discovers; `sourceRef` answers the different question of
 * whether the crawl would look in the same places. Hashing the file list would
 * make every edit to every document a stage-0 change, which cascades into a
 * full re-crawl — precisely the thing the positional cascade exists to avoid.
 *
 * @module @se373/corpus-fs
 */
import { Context } from '@se373/cordis';
import type Schema from '@se373/schemastery';
import { CorpusSource } from '@se373/corpus';
import type { Document } from '@se373/corpus';
/** Configuration for the filesystem corpus. */
export interface Config {
    /** Directories to walk. Relative paths resolve against the process cwd. */
    readonly roots?: readonly string[];
    /** File extensions to keep, with the leading dot. */
    readonly extensions?: readonly string[];
    /** Files larger than this are skipped, in bytes. */
    readonly maxBytes?: number;
}
/**
 * A corpus of files on disk.
 */
export declare class FilesystemCorpus extends CorpusSource {
    static readonly name = "corpus-fs";
    static readonly Config: Schema<Config>;
    /** Absolute, de-duplicated, sorted. */
    private readonly roots;
    private readonly extensions;
    private readonly maxBytes;
    readonly sourceRef: string;
    constructor(ctx: Context, config?: Config);
    /** One line a human reads before approving a rebuild. */
    describe(): string;
    /** Walk one directory, depth first, yielding matching file paths. */
    private walk;
    /**
     * Every matching file under every root.
     *
     * A document's id is its path relative to the root it was found under, with
     * the root's basename in front so two roots cannot collide. Relative, because
     * an absolute path moves with the checkout and would make every document look
     * new on another machine.
     */
    documents(): AsyncIterable<Document>;
}
export default FilesystemCorpus;
//# sourceMappingURL=index.d.ts.map