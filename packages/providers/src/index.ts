import { azureConfigured, createAzureProvider } from './azure.js'
import { createClaudeCodeProvider } from './claude-code.js'
import type { PerceptionProvider } from './types.js'
import { scriptedModel, scriptedProvider } from './scripted.js'

export * from './types.js'
export { azureConfigured, createAzureProvider, resolveAzureEnv } from './azure.js'
export { createClaudeCodeProvider, cleanEnv, readingFailure, perceptionTimeoutMs, PerceptionFailure, type ResultLike } from './claude-code.js'
export { setScriptedModel, scriptedModel, scriptedProvider, type ScriptedModel } from './scripted.js'

/** Azure when configured, else the user's Claude Code. Works out of the box. */
export function defaultPerceptionProvider(env = process.env): PerceptionProvider {
  const s = scriptedModel()
  if (s) return scriptedProvider(s)
  return azureConfigured(env) ? createAzureProvider(env) : createClaudeCodeProvider()
}

/**
 * The intent-interpretation call is the most consequential judgment in the
 * pipeline; it defaults to the strongest available model (the user's Claude)
 * regardless of Azure being configured. Set S2C_INTERPRETER=azure to force
 * the Azure deployment instead.
 */
export function defaultInterpreterProvider(env = process.env): PerceptionProvider {
  const s = scriptedModel()
  if (s) return scriptedProvider(s)
  if (env.S2C_INTERPRETER === 'azure' && azureConfigured(env)) return createAzureProvider(env)
  return createClaudeCodeProvider()
}
