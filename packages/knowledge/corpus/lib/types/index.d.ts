/**
 * `ctx.corpusSources` — where documents come from.
 *
 * A **seam**: one provider at a time, chosen by a config row. The key is plural
 * because a single provider may be pointed at several roots — `corpus-fs` takes
 * a list of directories — not because several providers coexist. Two providers
 * would be two corpora, and an index built from a union nobody declared is one
 * whose staleness cannot be reasoned about.
 *
 * **The first stage of the write path, and therefore the widest blast radius.**
 * §5.5's cascade is positional: a change here re-crawls, re-chunks, re-embeds
 * and rewrites. `sourceRef` is what makes that detectable.
 *
 * @module @se373/corpus
 */
import { Context, Service } from '@se373/cordis';
import type { Document } from './types.ts';
export * from './types.ts';
declare module '@se373/cordis' {
    interface Context {
        corpusSources: CorpusSource;
    }
}
/**
 * Abstract corpus provider.
 */
export declare abstract class CorpusSource extends Service {
    constructor(ctx: Context);
    /**
     * Digest of this provider and its resolved configuration.
     *
     * Stage 0 of the generation key. Computed by the provider rather than by the
     * pipeline because only the provider knows what its config resolved to — a
     * glob that expanded, a root that was made absolute.
     */
    abstract readonly sourceRef: string;
    /**
     * One line a human reads when asked to approve a rebuild.
     *
     * §5.5 gates a destructive change on a plan card naming what is being
     * replaced, and "the corpus changed" is not a sentence anyone can approve.
     */
    abstract describe(): string;
    /**
     * Every document, streamed.
     *
     * An async iterable rather than an array: a corpus is the one stage whose
     * size is not known in advance and not bounded by anything we control, and
     * materializing it costs the whole corpus in memory before a single chunk is
     * written.
     */
    abstract documents(): AsyncIterable<Document>;
}
export default CorpusSource;
//# sourceMappingURL=index.d.ts.map