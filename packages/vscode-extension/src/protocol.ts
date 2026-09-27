/**
 * Wire types for the editor bridge, mirroring
 * packages/vite-plugin/src/ide-protocol.ts — which is the canonical spec and
 * the only place the protocol is DOCUMENTED. This is a copy rather than an
 * import on purpose: the extension must build and ship without the repo's
 * workspace graph (it is installed as a .vsix / run from an Extension
 * Development Host), and one 40-line type file is a cheaper coupling than a
 * build dependency on the dev-server package.
 */

export const IDE_CLIENT_HEADER = 'x-s2c-ide'

export interface HelloEvent {
  protocol: number
  /** Dev-server root — join it with a reveal's `file` to get a real path. */
  root: string
  editorId: string
  serverId: string
}

export interface RevealEvent {
  id: string
  /** Repo-relative, POSIX separators, exactly as `data-s2c` carries it. */
  file: string
  /** 1-based, as stamped. VS Code Positions are 0-based — convert at the edge. */
  line: number
  col: number
  root: string
  at: number
}

export interface CursorPayload {
  file: string
  line: number
  col?: number
}

/** What the status bar renders. */
export type BridgeState = 'disabled' | 'offline' | 'connecting' | 'connected'
