/**
 * Transitional env-normalization seam (mux.feature: "a pane carrying only the legacy fast-path vars
 * is still honored"). cyber-mux's own fast-path reads `$CYBER_MUX`/`$CYBER_MUX_PANE` — its
 * `currentPane` hardcodes those names (no `envPrefix` override), and `probeMultiplexer`'s `envPrefix`
 * option renames the WHOLE pair together, so neither can be steered to fall back onto a
 * differently-named legacy pair. Every call into cyber-mux that reads the fast-path
 * (`probeMultiplexer`, `currentPane`, `callerPane`, `resolveMuxAdapter`) must be handed this seam's
 * output instead of the raw env.
 *
 * When `$CYBER_MUX`/`$CYBER_MUX_PANE` are both absent and either legacy `$CYBERLEGION_MUX`/
 * `$CYBERLEGION_MUX_PANE` var is present, copies the legacy pair onto the current names. Never
 * overwrites an already-set current var — the current pair always wins outright the moment either
 * half of it is set, exactly matching the frozen precedence chain (mux.feature: "the current
 * fast-path vars win over the legacy pair when both are set").
 *
 * Transitional — deleted once no pre-migration pane (one that only ever exported the legacy pair) is
 * still alive.
 */
export function normalizeMuxEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const hasCurrent = env.CYBER_MUX !== undefined || env.CYBER_MUX_PANE !== undefined
	const hasLegacy = env.CYBERLEGION_MUX !== undefined || env.CYBERLEGION_MUX_PANE !== undefined
	if (hasCurrent || !hasLegacy) return env
	return { ...env, CYBER_MUX: env.CYBERLEGION_MUX, CYBER_MUX_PANE: env.CYBERLEGION_MUX_PANE }
}
