# SE373 — Course Reference

**SE373 · Kỹ thuật xây dựng hệ thống Agentic AI**
Khoa Công nghệ Phần mềm, Trường Đại học Công nghệ Thông tin (UIT).
Học kỳ 1, 2026–2027 · sáng Thứ 4 hàng tuần · prerequisite IT002.

> **Source:** the faculty's course-registration announcement, published
> 2026-08-07. **This is an announcement, not a syllabus.** It fixes the topic
> areas and the project brief; it does not give milestone dates, a grading
> breakdown, required artifacts, or team size. Those are still unknown — see
> [Still missing](#still-missing).

## The thesis of the course

> **Agent = Model + Harness**

The Model supplies language and reasoning. The **Harness** is everything that
lets it work in a real environment: context management, tool use, memory,
workflow, result verification, security, and system observability.

The course's claim is that the Harness — not the model — decides whether an AI
Agent is a real software system or a chatbot. That is the difference between
*using* AI and *building* Agentic AI systems.

**This is why our project is what it is.** We are not building an agent; we are
building a harness that builds agents. The course's own framing is the argument
for the thesis in `CLAUDE.md`.

## The eight topic areas

Taught across the semester, and the checklist our system is judged against.

1. AI Agent và **Agent Skills**
2. **Tool Use** và Function Calling
3. **Retrieval-Augmented Generation** (RAG)
4. **Memory** và Context Management
5. **Workflow Orchestration**
6. **Multi-Agent Systems**
7. **Model Context Protocol** (MCP)
8. **Verification, Security** và Observability

## The final project

Project-Based Learning. Teams build one complete Agentic AI system over the
semester, capable of working on a real problem. The announcement names six
example shapes:

| | |
|---|---|
| Coding Agent | Code Review Agent |
| Requirement Analysis Agent | Internal Knowledge Assistant |
| Multi-Agent Workflow | MCP-based Assistant |

We are not submitting one of these. We are submitting the system that emits
them — each becomes a demonstration, not the deliverable.

---

## Coverage — topics against our phase plan

Where each course topic is answered by [§13](agentic-builder-architecture.md)
of the architecture plan, and how confident that answer is.

| # | Topic | Our answer | Phase | Status |
|---|---|---|---|---|
| 1 | AI Agent | `ctx.agent`, `ctx.agentLoop`, `ctx.agentPresets` | 2, 5 | ✅ planned |
| 1 | **Agent Skills** | `skill` + `skill-filesystem` + `tool-skill` (4/4 in base) | 3 | ✅ vendored |
| 2 | Tool Use / Function Calling | `ctx.tools` + guard pipeline, `tool-fs`, `tool-bash` | 3 | ✅ planned |
| 3 | RAG | the whole L3 knowledge plane — six swappable seams | 6a, 6b | ✅ **our strongest** |
| 4 | **Memory / Context Management** | `compaction/*` 4/4, `spill/*` 3/3, `context/*`, session persistence — plus L3 retrieval | 2, 3 | ✅ vendored |
| 5 | Workflow Orchestration | `workflow/*` 4/4 (engine + worker thread), plus our pipelines as named versioned values | 3, 6c | ✅ vendored |
| 6 | Multi-Agent Systems | `ctx.subagents`, spawn-in-process, isolate realms | 5, 8 | ✅ planned |
| 7 | MCP | `mcp-client` in, codegen'd stdio server out — the loop closes | 7 | ✅ **our strongest** |
| 8 | Verification | seam conformance suites + retrieval eval + A/B | 6d, 8 | ✅ **our strongest** |
| 8 | Observability | four channels: logger, session log, invariants, telemetry | 1 (partly shipped), 2 | ✅ planned |
| 8 | **Security** | `sandbox/*` 4/4 — seam, local backends, policy resolver | 3 | ✅ vendored |

### How the gaps closed

An earlier version of this table showed three gaps — Memory/Context Management,
Agent Skills, and Security. They were artefacts of a hand-picked skip list
written when the plan assumed we would port ~12 packages by hand.

Taking `bundle/base` closes all three, because dsh's baseline bundle *is* a
complete harness in exactly the sense SE373 means:

| Gap | Inside `base + headless` |
|---|---|
| Memory / Context | `compaction/*` 4/4, `spill/*` 3/3, `context/*` 3/6, `session-persistence` |
| Agent Skills | `skill/*` 4/4 |
| Security | `sandbox/*` 4/4 |

**This is the argument for building on dsh rather than beside it.** The course
grades a Harness; dsh already ships one; our contribution is the two planes
above it that no harness has.

### Where we are strong, and where we are merely covered

Covered is not the same as demonstrated. Topics 1–6 and 8-observability are
covered *because we vendored a working implementation* — real, but not ours.

Topics 3 (RAG), 7 (MCP), and 8-verification are different: a swappable
retrieval pipeline whose every stage is a config row, a bidirectional MCP path
where a generated server re-registers into the chat that built it, and a system
that verifies code it wrote itself against contracts it cannot edit. **None of
those exist upstream.** Build the presentation around them.

---

## Still missing

Not in the announcement. Get these and this file gets a second half.

- [ ] Milestone dates — checkpoints, demo day, final submission
- [ ] Grading breakdown and weights
- [ ] Required artifacts — report, slides, live demo, source handover?
- [ ] Team size and any individual-contribution requirement
- [ ] Week-by-week topic schedule (would let `docs/FEATURE-LOG.md` map phases to weeks)
- [ ] Whether any specific framework or model is mandated

Until the dates exist, the phase plan has no deadline pressure encoded in it,
and "are we on track" is unanswerable.

## Known Limitations and Deferred Work

- The coverage table is our reading of an announcement, not a marking scheme.
  Revisit it the moment a real rubric appears.
- "Vendored" in the coverage table means the implementation exists in our tree
  and is expected to work; it does not mean we have run it. Each row becomes a
  claim only when a `docs/FEATURE-LOG.md` entry demonstrates it.
