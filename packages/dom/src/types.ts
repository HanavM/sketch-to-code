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
