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
| 1 | **Agent Skills** | — | — | ⚠️ **gap** |
| 2 | Tool Use / Function Calling | `ctx.tools` + guard pipeline, `tool-fs`, `tool-bash` | 3 | ✅ planned |
| 3 | RAG | the whole L3 knowledge plane — six swappable seams | 6a, 6b | ✅ **our strongest** |
| 4 | **Memory / Context Management** | retrieval only | — | ⚠️ **gap** |
| 5 | Workflow Orchestration | pipelines as named versioned values; archetypes as outputs | 6b, 6c | 🔶 partial |
| 6 | Multi-Agent Systems | `ctx.subagents`, spawn-in-process, isolate realms | 5, 8 | ✅ planned |
| 7 | MCP | `mcp-client` in, codegen'd stdio server out — the loop closes | 7 | ✅ **our strongest** |
| 8 | Verification | seam conformance suites + retrieval eval + A/B | 6d, 8 | ✅ **our strongest** |
| 8 | Observability | four channels: logger, session log, invariants, telemetry | 1 (partly shipped), 2 | ✅ planned |
| 8 | **Security** | sandbox seam, wired at mount | 6d | 🔶 thin, and late |

### The three gaps

**Memory and Context Management is the real one.** The course names it as a
topic in its own right, and our plan answers it only with retrieval. Every
upstream package that does conversation memory — `compaction/*`, `context/*`,
`spill/*` — is on our skip list. Retrieval over a corpus and memory over a
conversation are different problems: one is "what do we know", the other is
"what happened, and what still fits in the window". A grader looking for topic 4
would not find it.

*Cheapest fix:* `compaction/*` is four upstream packages and vendoring is now
the rule. It is not a rewrite; it is a decision to stop skipping it.

**Agent Skills is named in topic 1 and we skip `skill/*` entirely** (four
packages). Our catalog blocks are a *builder-side* concept — things the meta-agent
composes — not skills a generated agent loads at runtime. Those are not the same
thing, and the course names the second.

*Cheapest fix:* same shape. Four packages, already written.

**Security is thin and lands last.** It is one third of topic 8 and currently
arrives at phase 6d, behind the riskiest work. The architecture doc is explicit
that plan mode is *not* a security control and that sandbox mode must be wired
independently — so right now nothing in the plan carries this before phase 6d.

*Cheapest fix:* pull `sandbox/*` forward to phase 3, when tools first execute.
That is also when it starts mattering.

### What the gaps do not change

Topics 3, 7, and 8-verification are where this project is unusually strong — a
swappable RAG pipeline, a bidirectional MCP path, and a system that verifies
code it wrote itself against contracts it cannot edit. Those are the
demonstrations to build the presentation around.

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
- Topic 5 (Workflow Orchestration) is marked partial on a judgement call: we
  build pipelines and multi-agent composition but no general workflow engine.
  If the course means a durable orchestration runtime, this is a fourth gap.
