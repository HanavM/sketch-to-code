/** A single sampled pointer position. Coordinates are CSS pixels in page space. */
export interface Point {
  x: number
  y: number
  /** ms since epoch (or since capture start) — monotonic within a stroke. */
  t: number
}

/** One continuous pointer-down → pointer-up trace. */
export interface Stroke {
  id: string
  points: Point[]
}

export interface BBox {
  x: number
  y: number
  w: number
  h: number
}

/** What a single stroke (or merged stroke set) was recognized as. */
export type ShapeKind =
  | 'line'
  | 'polyline'
  | 'arc'
  | 'rect'
  | 'rounded-rect'
  | 'ellipse'
  | 'circle'
  | 'triangle'
  | 'diamond'
  | 'arrow'
  | 'caret'
  | 'strikethrough'
  | 'scribble'
  | 'ink' // unresolved freehand (likely handwriting)

export interface ShapeCandidate {
  kind: ShapeKind
  /** 0..1 */
  confidence: number
}

/** A recognized object in the scene (one or more strokes). */
export interface InkNode {
  id: string
  kind: ShapeKind
  candidates: ShapeCandidate[]
  bbox: BBox
  strokeIds: string[]
  groupId: string
  /** For lines/polylines/arrows: ordered salient vertices. */
  vertices?: Point[]
}

/** A cluster of small dense strokes recognized as handwriting. */
export interface TextRegion {
  id: string
  bbox: BBox
  strokeIds: string[]
  groupId: string
  /** Filled in later by the perception provider. */
  text?: string
}

/** A directional connector, resolved from an arrow-classified node. */
export interface ArrowLink {
  id: string
  nodeId: string
  /** Tail (source) endpoint in page coords. */
  from: Point
  /** Head (target) endpoint in page coords. */
  to: Point
}

/** Temporal-spatial cluster of strokes (drawn together = one object/annotation). */
export interface StrokeGroup {
  id: string
  strokeIds: string[]
  bbox: BBox
  startT: number
  endT: number
}

export interface InkScene {
  strokes: Stroke[]
  groups: StrokeGroup[]
  nodes: InkNode[]
  textRegions: TextRegion[]
  arrows: ArrowLink[]
}

/** Geometric features computed per stroke; inputs to classification. */
export interface StrokeFeatures {
  /** Total ink path length. */
  length: number
  bbox: BBox
  /** Convex hull vertices (subset of resampled points). */
  hull: Point[]
  /** Hull area / perimeter. */
  hullArea: number
  hullPerimeter: number
  /** Min-area enclosing rect of the hull. */
  erArea: number
  erShort: number
  erLong: number
  /** Largest triangle / quadrilateral inscribed in the hull. */
  triArea: number
  triPerimeter: number
  quadArea: number
  /** distance(first, last) / length. */
  closedness: number
  /** total absolute rotation / 2π. */
  revolutions: number
  /** chord / arc length. */
  straightness: number
  /** Normalized Distance between Direction Extremes (PaleoSketch). */
  ndde: number
  /** Direction Change Ratio: max |Δdir| / mean |Δdir| (PaleoSketch). */
  dcr: number
  /** Detected corner indices into the resampled point array. */
  corners: number[]
  /** Resampled points the above were computed on. */
  resampled: Point[]
  /** Number of raw input points (guards against degenerate taps). */
  rawPointCount: number
}
