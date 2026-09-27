import { posix as posixPath } from 'node:path'
import * as vscode from 'vscode'
import { EchoGuard, IdeBridgeClient, toRepoRelative } from './client.js'
import { createNodeTransport } from './node-transport.js'
import type { BridgeState, RevealEvent } from './protocol.js'

/**
 * The adapter, and ONLY the adapter: everything with interesting behaviour is
 * in client.ts (transport-free, unit-tested) or node-transport.ts. What is left
 * here is vscode API calls — which is why this file is the part that has to be
 * exercised by hand in an Extension Development Host (see README).
 */

const CONFIG = 'sketch2code'

interface Settings {
  url: string
  enabled: boolean
  cursorSync: boolean
  debounceMs: number
  editorName: string
}

function readSettings(): Settings {
  const c = vscode.workspace.getConfiguration(CONFIG)
  return {
    url: c.get<string>('devServerUrl') ?? 'http://localhost:5199',
    enabled: c.get<boolean>('enabled') ?? true,
    cursorSync: c.get<boolean>('cursorSync') ?? true,
    debounceMs: c.get<number>('cursorDebounceMs') ?? 150,
    editorName: c.get<string>('editorName') ?? 'VS Code',
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const out = vscode.window.createOutputChannel('sketch-to-code bridge')
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  bar.command = `${CONFIG}.ide.reconnect`
  bar.show()
  context.subscriptions.push(out, bar)

  const echo = new EchoGuard()
  let settings = readSettings()
  let client: IdeBridgeClient | null = null

  const paint = (state: BridgeState, detail?: string): void => {
    const url = client?.serverUrl ?? settings.url
    const faces: Record<BridgeState, string> = {
      connected: '$(plug) s2c',
      connecting: '$(sync~spin) s2c',
      offline: '$(debug-disconnect) s2c',
      disabled: '$(circle-slash) s2c',
    }
    bar.text = faces[state]
    const lines = [
      `sketch-to-code editor bridge — ${state}`,
      `dev server: ${url}`,
      client?.serverRoot ? `root: ${client.serverRoot}` : '',
      detail && state !== 'connected' ? `last: ${detail}` : '',
      'click to reconnect',
    ].filter(Boolean)
    bar.tooltip = lines.join('\n')
  }

  /** Open the file and put the cursor on the stamped line. */
  const reveal = async (ev: RevealEvent): Promise<void> => {
    const root = ev.root || client?.serverRoot || workspaceRoot()
    const candidates = [
      root ? posixPath.join(root.replace(/\\/g, '/'), ev.file) : null,
      // A monorepo's dev-server root can sit below the opened folder, and the
      // reveal may name a file relative to a root we cannot see; try the
      // workspace folder too before giving up.
      workspaceRoot() ? posixPath.join(workspaceRoot()!.replace(/\\/g, '/'), ev.file) : null,
    ].filter((p): p is string => p !== null)

    for (const abs of candidates) {
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs))
        // line/col are 1-based on the wire (exactly as data-s2c stamps them);
        // vscode.Position is 0-based. This is the only place that converts.
        const line = Math.max(0, Math.min(ev.line - 1, doc.lineCount - 1))
        const col = Math.max(0, (ev.col || 1) - 1)
        const pos = new vscode.Position(line, col)
        echo.arm() // our own selection change must not bounce back as a cursor
        const editor = await vscode.window.showTextDocument(doc, {
          preserveFocus: false,
          preview: false,
        })
        editor.selection = new vscode.Selection(pos, pos)
        editor.revealRange(
          new vscode.Range(pos, pos),
          vscode.TextEditorRevealType.InCenterIfOutsideViewport,
        )
        out.appendLine(`reveal ${ev.file}:${ev.line}:${ev.col} → ${abs}`)
        return
      } catch {
        // try the next candidate; a miss here is normal in a monorepo
      }
    }
    out.appendLine(`reveal failed: no such file for ${ev.file} (tried ${candidates.join(', ')})`)
    vscode.window.setStatusBarMessage(`s2c: cannot open ${ev.file}`, 3000)
  }

  const build = (): void => {
    client?.stop()
    client = new IdeBridgeClient({
      url: settings.url,
      editorName: settings.editorName,
      cursorDebounceMs: settings.debounceMs,
      transport: createNodeTransport(),
      onReveal: (ev) => void reveal(ev),
      onState: (state, detail) => {
        paint(state, detail)
        if (detail && state !== 'connected') out.appendLine(`${state}: ${detail}`)
      },
      log: (msg) => out.appendLine(msg),
    })
    if (settings.enabled) client.start()
    else paint('disabled')
  }

  build()

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (!settings.cursorSync || !client || client.state !== 'connected') return
      if (e.textEditor !== vscode.window.activeTextEditor) return
      if (e.textEditor.document.uri.scheme !== 'file') return
      if (echo.suppressed()) return
      const root = client.serverRoot ?? workspaceRoot()
      if (!root) return
      const rel = toRepoRelative(root, e.textEditor.document.uri.fsPath)
      // Outside the dev server's root there is nothing on the page to highlight.
      if (!rel) return
      const active = e.selections[0]?.active
      if (!active) return
      client.reportCursor({ file: rel, line: active.line + 1, col: active.character + 1 })
    }),

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(CONFIG)) return
      settings = readSettings()
      // Rebuild rather than patch: the URL or the editor name may have moved,
      // and a fresh connection is cheap.
      build()
    }),

    vscode.commands.registerCommand(`${CONFIG}.ide.reconnect`, () => {
      settings = readSettings()
      build()
      if (settings.enabled) vscode.window.setStatusBarMessage(`s2c: reconnecting to ${settings.url}`, 2000)
    }),

    vscode.commands.registerCommand(`${CONFIG}.ide.toggle`, async () => {
      const next = !settings.enabled
      await vscode.workspace
        .getConfiguration(CONFIG)
        .update('enabled', next, vscode.ConfigurationTarget.Workspace)
      // the configuration listener rebuilds; this is only the message
      vscode.window.setStatusBarMessage(`s2c bridge ${next ? 'on' : 'off'}`, 2000)
    }),

    { dispose: () => client?.stop() },
  )
}

export function deactivate(): void {
  // every disposable, including the client's stop(), is in context.subscriptions
}

function workspaceRoot(): string | null {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null
}
