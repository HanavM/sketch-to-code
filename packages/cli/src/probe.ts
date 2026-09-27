import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

export interface Probe {
  ok: boolean
  /** Plugin names Vite resolved, in order — the proof the wiring took. */
  plugins: string[]
  hasSketch2code: boolean
  port: number | null
  strictPort: boolean
  /** Machine-readable failure: no vite installed, config threw, no marker back. */
  reason: 'ok' | 'vite-missing' | 'config-error' | 'no-output' | 'spawn-failed'
  detail: string
}

const MARKER = '__S2C_PROBE__'

// Vite's own resolveConfig is the only honest answer to "will this config
// load?" — it runs the real config file through the real loader, with the
// project's own vite. Cheap (no server, no request) and it hands back the
// resolved plugin list and port in the same breath, which is exactly what
// doctor wants to report.
const SCRIPT = `
const { resolveConfig } = await import('vite')
const cfg = await resolveConfig({ root: process.cwd(), configFile: process.env.S2C_CONFIG_FILE || undefined }, 'serve')
const out = {
  plugins: cfg.plugins.map((p) => p && p.name).filter(Boolean),
  port: cfg.server && cfg.server.port != null ? cfg.server.port : null,
  strictPort: !!(cfg.server && cfg.server.strictPort),
}
console.log('${MARKER}' + JSON.stringify(out))
`

export function probeViteConfig(dir: string, configFile: string | null, timeoutMs = 120_000): Probe {
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', SCRIPT], {
    cwd: resolve(dir),
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, S2C_CONFIG_FILE: configFile ?? '', NODE_ENV: 'development' },
  })
  const stdout = res.stdout ?? ''
  const stderr = res.stderr ?? ''
  const line = stdout.split('\n').find((l) => l.includes(MARKER))

  if (line) {
    const parsed = JSON.parse(line.slice(line.indexOf(MARKER) + MARKER.length)) as {
      plugins: string[]
      port: number | null
      strictPort: boolean
    }
    return {
      ok: true,
      plugins: parsed.plugins,
      hasSketch2code: parsed.plugins.includes('sketch2code'),
      port: parsed.port,
      strictPort: parsed.strictPort,
      reason: 'ok',
      detail: '',
    }
  }

  const detail = `${stderr}${stdout}`.trim().split('\n').slice(-6).join('\n')
  const fail = (reason: Probe['reason']): Probe => ({
    ok: false, plugins: [], hasSketch2code: false, port: null, strictPort: false, reason, detail,
  })
  if (res.error) return fail('spawn-failed')
  if (/Cannot find (package|module) 'vite'|ERR_MODULE_NOT_FOUND.*vite/.test(detail)) return fail('vite-missing')
  if (res.status !== 0) return fail('config-error')
  return fail('no-output')
}

/** The dev-server URL a `vite` run will land on, port default included. */
export function devServerPort(probe: Probe): number {
  return probe.port ?? 5173
}
