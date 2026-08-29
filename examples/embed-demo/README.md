# embed-demo — phase 6a

Vectors exist. No LLM, no API key, and no network once the model is on disk.

```bash
pnpm models:acquire                                   # 331 MB, once
node --import tsx/esm examples/embed-demo/demo.mts
```

Six things happen, each the phase's claim about a different part of the design:

| | |
|---|---|
| 1 | the registry knows which models exist, which are present, and which can serve a given width |
| 2 | the mounted provider passes its conformance suite — shape, norm, determinism, and that it does not ignore the document/query role |
| 3 | a generation is created bound to the embedder's identity, and written |
| 4 | queries retrieve, including Vietnamese questions against an English corpus |
| 5 | a second embedder in its own realm produces vectors the generation **refuses** |
| 6 | all of it appears on the runtime graph without anyone adding it (I5) |

Step 5 is the one worth watching. The `narrow` realm mounts the *same weights at
the same revision* with `dims: 256`. Same model by any human description,
different fingerprint, and the store will not compare them. That is the answer to
"does the same model have to embed and query" made structural rather than
documented — and it is the machinery a rebuild uses, since during one the old
embedder keeps serving queries from its own realm while the new one writes.

The generation files go to a throwaway home. The weights deliberately do not:
they are pinned, shared and expensive, so the demo reads the real cache root
before swapping `$SE373_HOME` and hands it back through `$SE373_MODELS_ROOT`.
