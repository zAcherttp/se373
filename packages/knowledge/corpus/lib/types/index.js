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
import { Service } from '@se373/cordis';
export * from "./types.js";
/**
 * Abstract corpus provider.
 */
export class CorpusSource extends Service {
    constructor(ctx) {
        super(ctx, 'corpusSources');
    }
}
export default CorpusSource;
//# sourceMappingURL=index.js.map