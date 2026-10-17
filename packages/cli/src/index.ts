export { parseArgs, type ParsedArgs } from './args.js'
export { checkClaudeCode, type ClaudeCheck } from './claude.js'
export { PLUGIN_PKG, planViteConfig, type ConfigPlan, type ConfigPlanInput, type ConfigPlanOptions } from './config.js'
export {
  addDevDependency, resolveChain, resolveDepSpec, resolveFromFile, resolveFromProject, runInstall,
  type DepSpec, type ResolveChain,
} from './deps.js'
export { detectProject, readPackageJson, type Blocker, type PackageJson, type ProjectInfo, type Verdict } from './detect.js'
export { unifiedDiff } from './diff.js'
export { formatDoctor, runDoctor, type DoctorOptions, type DoctorReport, type Finding } from './doctor.js'
export {
  commitAll, ensureGitignore, evaluateGates, gitInit, gitState, type Gate, type GitState,
} from './git.js'
export { connectRemote, createRemote, ghState, type GhState, type RemoteResult } from './github.js'
export { runInit, type Confirm, type InitOptions, type InitResult, type Question, type Step } from './init.js'
export { devServerPort, overlayFinding, probeViteConfig, type Probe } from './probe.js'
export { sketchOnce, type SketchOptions, type SketchResult } from './sketch.js'
