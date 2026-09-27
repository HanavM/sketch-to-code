export { runPipeline } from './run.js'
export type { RunContext, RunInput, RunResult } from './run.js'
export { checkpoint, changedFiles, revertToCheckpoint } from './safety.js'
export type { Checkpoint } from './safety.js'
export { verifyOps, pageChanged, verifyDesignPlacement } from './verify.js'
export type { VerifyResult, OpVerdict, DesignVerdict } from './verify.js'
export { createCodegenSession, contractFor } from './codegen.js'
export type { RunMode, CodegenSession, UserContent } from './codegen.js'
export { SKETCH_SKILL } from './skill.js'
export { interpretStrokes } from './interpret.js'
export type { InterpretResult, InterpretShape, InterpretOp } from './interpret.js'
export { interpretV2, runV2, verifyActions } from './run2.js'
export type { InterpretV2Result } from './run2.js'
export { buildEvidence, groundInterpretation, resolveNotes, INTERPRET_PROMPT, INTERPRETATION_SCHEMA } from './intent2.js'
export type {
  RawInterpretation, GroundedInterpretation, GroundedAction, TypedNote, ResolvedNote,
} from './intent2.js'
export { appPalette, matchColor, parseCssColor, deltaE, colorDirective } from './palette.js'
export type { PaletteEntry, ColorMatch } from './palette.js'
export {
  compositionFromStrokes, compositionFromSource, scoreComposition, compositionBrief, samplePath,
} from './composition.js'
export type { CompositionSignature, CompositionVerdict, CompositionFlaw } from './composition.js'
export {
  DEFAULT_FIDELITY, normalizeFidelity, rungFor, detailBand, passMark, fidelityDirective, fidelitySummary,
} from './fidelity.js'
export type { FidelityControls, FidelityKeep, RenderRung } from './fidelity.js'
export { moveData } from './dataflow.js'
export type { MoveDataRequest, MoveDataResult } from './dataflow.js'
export {
  addConstraint, checkConstraints, constraintsPath, describeConstraint, evaluateConstraints,
  loadConstraints, measureConstraint, nodeLabel, proposeConstraints, removeConstraint,
  saveConstraints,
} from './constraints.js'
export type { Proposal, RuleLine, RuleView } from './constraints.js'
export type { Constraint, ConstraintKind, Violation } from './constraints.js'
export { extractComponent } from './extract.js'
export type { ExtractRequest, ExtractResult } from './extract.js'
export { paintShape } from './shape.js'
export type { PaintRequest, PaintResult, PaintProp } from './shape.js'
export { STYLES, STYLE_IDS, normalizeStyle, renderTraits, styleFaults } from './style.js'
export type { StyleId, StyleSpec, RenderTraits } from './style.js'
export { planInstant, applyInstant, revertInstant, instantEligible, mountPoint } from './instant.js'
export type { InstantPlan, InstantResult, InstantVerdict } from './instant.js'
export { buildScaffold, componentName, scaffoldDir } from './scaffold.js'
export type { Scaffold } from './scaffold.js'
export { finishSource, paletteFor } from './finish.js'
export type { FinishEdit, FinishResult } from './finish.js'
export {
  APPROACHES, applyWork, captureWork, pickBest, revertTouched, revertWork, touchedFiles,
} from './candidates.js'
export type { Attempt, Work } from './candidates.js'
export { applyManipulation, rewriteClassList, snapSpacing } from './manipulate.js'
export type { ManipulateRequest, ManipulateResult, ManipulateProp } from './manipulate.js'
export { planStructuralEdits, commitPlan } from './codemod.js'
export type { CodemodPlan } from './codemod.js'
