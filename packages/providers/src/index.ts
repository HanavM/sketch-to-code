import { azureConfigured, createAzureProvider } from './azure.js'
import { createClaudeCodeProvider } from './claude-code.js'
import type { PerceptionProvider } from './types.js'

export * from './types.js'
export { azureConfigured, createAzureProvider } from './azure.js'
export { createClaudeCodeProvider, cleanEnv } from './claude-code.js'

/** Azure when configured, else the user's Claude Code. Works out of the box. */
export function defaultPerceptionProvider(env = process.env): PerceptionProvider {
  return azureConfigured(env) ? createAzureProvider(env) : createClaudeCodeProvider()
}
