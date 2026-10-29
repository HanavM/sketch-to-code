/** One visible element in the live page, with exact geometry and source origin. */
export interface DomNode {
  id: string
  tag: string
  /** 'src/components/Nav.tsx:42:7' from the data-s2c stamp, or null (host/3rd-party). */
  srcLoc: string | null
  /** Page coordinates (includes scroll), CSS px. */
  rect: { x: number; y: number; w: number; h: number }
  /** Own direct text (not descendants'), trimmed, capped. */
  text: string
  /**
   * Own text split where an element child sits between two runs of it, only
   * when there is such a split (s2c-046): ['Edit', 'and save to test'] for
   * 'Edit <code>src/App.jsx</code> and save to test'. For quoting it as it
   * reads on the screen; `text` stays the identity everything else matches on.
   */
  textRuns?: string[]
  /** n17: the box the own text's letters fill (union of its line boxes), page px; only when there is own text. */
  textBox?: { x: number; y: number; w: number; h: number }
  classes: string[]
  style: {
    display: string
    position: string
    zIndex: string
    flexDirection: string
    gap: string
    padding: string
    margin: string
    backgroundColor: string
    color: string
    fontSize: string
    fontWeight: string
    borderRadius: string
    /** Set only when the element paints a gradient or image (not 'none'). */
    backgroundImage?: string
    /** Set only when the element is clipped (n14: a slanted edge between two areas is a clip-path). */
    clipPath?: string
    /** Set only when the top border paints: '2px rgb(0, 0, 0)' (n14: an area box must not be framed). */
    border?: string
    /** n59: set only when the bottom border paints: a drawn text line must not come back as an underline. */
    borderBottom?: string
    /** Set only when the element casts a shadow. */
    boxShadow?: string
    /** Set only when below 1 (n15: a coloured badge must not come out faint). */
    opacity?: string
    /** Set only when the element is filtered (blur). */
    filter?: string
    /** Set only when the element is transformed: 'matrix(a, b, c, d, e, f)' (n31: a card drawn turned stays turned). */
    transform?: string
    /** Set only when the letters are stroked (n16: an outlined big word must stay hollow): '2px'. */
    textStroke?: string
  }
  /** Parent DomNode id, or null for the root. */
  parent: string | null
  depth: number
}

export interface DomSnapshot {
  nodes: DomNode[]
  viewport: { w: number; h: number; scrollX: number; scrollY: number }
  url: string
  takenAt: number
  /** True when the walker hit the node cap and dropped elements. */
  truncated: boolean
}

export const S2C_ATTR = 'data-s2c'
