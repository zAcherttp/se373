/**
 * Build-time substitutions the browser artifacts are allowed to carry.
 *
 * Both bundlers read this: Vite for the shell, and `vendor/dsh/client/`'s
 * tsdown preset for every UI plugin bundle. It exists as one module because
 * the two must agree — a value inlined into a plugin bundle and absent from
 * the shell is a `ReferenceError` at boot, not a missing feature.
 *
 * **Deliberately smaller than upstream's.** dsh's version also carries the
 * official-artifact machinery: a build profile, a commit-hash requirement, and
 * a SHA-256 record binding an environment to a set of published files. That is
 * infrastructure for proving what DeepSeek shipped, and we publish nothing —
 * so it is omitted rather than vendored, and `docs/PORTING.md` records why.
 *
 * @module scripts/client-build-environment
 */

/**
 * Prefix reserved for build-time values that may reach a browser artifact.
 *
 * Everything with this prefix is eligible for inlining into bytes a browser
 * downloads, so the prefix is the security boundary: a variable without it
 * cannot leak into the client no matter what the build environment holds.
 */
const CLIENT_BUILD_ENV_PREFIX = 'SE373_CLIENT_'

/**
 * Collect the public client environment in deterministic key order.
 * @param environment - environment inherited by the build process.
 * @returns defined `SE373_CLIENT_*` values only, sorted by name.
 */
function clientBuildEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(environment)
    .filter(([name, value]) => name.startsWith(CLIENT_BUILD_ENV_PREFIX) && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))) as Record<string, string>
}

/**
 * Bundler substitutions for the public client build environment.
 *
 * The empty `process.env` fallback is what makes an unset static read evaluate
 * to `undefined` without putting a `process` global in the browser. Exact
 * substitutions are longer matches, so they win over it; a dynamic property
 * read or an enumeration deliberately observes the empty object.
 * @param environment - environment inherited by the build process.
 * @returns deterministic `define` expressions for Vite and tsdown.
 */
export function clientBuildEnvironmentDefines(
  environment: NodeJS.ProcessEnv,
): Record<string, string> {
  const defines: Record<string, string> = { 'process.env': '{}' }
  for (const [name, value] of Object.entries(clientBuildEnvironment(environment))) {
    defines[`process.env.${name}`] = JSON.stringify(value)
  }
  return defines
}
