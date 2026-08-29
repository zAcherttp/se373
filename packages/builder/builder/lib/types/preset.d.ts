/**
 * The fabricated preset: an agent's own voice and tools, written as files.
 *
 * A fabricated agent's model-facing composition — persona, tool rows, and its
 * filesystem posture — is not mounted directly by the builder. It is written as
 * a preset directory in the agent's own workspace and mounted by the subtree's
 * own `agent-presets` row, because that is what scopes it: tools registered
 * under a preset's standing mount are visible only to sessions joined to it,
 * and a persona in a preset the main roster never lists can never appear in the
 * main builder's settings.
 *
 * The generated `agent.cordis.yml` is config, not prose — a wrong row here is a
 * silently different agent — so its generator is a pure function with a spec.
 *
 * @module @se373/builder/preset
 */
import type { AgentSpec, SpecRow } from './types.ts';
/**
 * The generated `agent.cordis.yml` for a fabricated agent.
 *
 * Row order is deliberate: persona first, because the system prompt sections
 * assemble in mount order; the filesystem realm before the tools that use it,
 * so `fs-sandbox` resolves the realm's policy rather than racing it; tools
 * last.
 * @param spec - the resolved agent.
 * @returns YAML text.
 */
export declare function renderAgentComposition(spec: AgentSpec): string;
/**
 * The generated `preset.yml` — display metadata only.
 * @param spec - the resolved agent.
 * @returns YAML text.
 */
export declare function renderPresetMetadata(spec: AgentSpec): string;
/**
 * The whole scaffold tree for one fabricated agent.
 * @param spec - the resolved agent.
 * @returns files by scaffold-relative path.
 */
export declare function scaffoldTree(spec: AgentSpec): Record<string, string>;
/** The row the builder adds to the subtree so the preset is mountable — and scoped. */
export declare function presetRosterRow(spec: AgentSpec, presetRoot: string): SpecRow;
//# sourceMappingURL=preset.d.ts.map