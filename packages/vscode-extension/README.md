# s2c-ide-bridge — the editor half of the sketch-to-code bridge

Click an element in your running app → the exact line opens here.
Move the cursor here → that element highlights on the page.

Both directions are exact lookups, not guesses: the dev-only Babel pass in
`@s2c/vite-plugin` stamps **every** JSX host element with
`data-s2c="src/File.tsx:LINE:COL"` — all 68 `<path>` elements of the demo page
included, not just containers.

The protocol is specified in one place:
[`packages/vite-plugin/src/ide-protocol.ts`](../vite-plugin/src/ide-protocol.ts)
(endpoints, path shape, gates, what happens with no editor attached, how a
disconnect is detected). What follows is only how to run this package.

## Build and run it in an Extension Development Host

It is not published to a marketplace, so it runs from source:

```bash
# once, from the repo root
npm install
npm run build -w s2c-ide-bridge        # tsc -p → packages/vscode-extension/out
```

Then:

```bash
code packages/vscode-extension          # open THIS folder as the window's root
```

Press **F5** (Run → Start Debugging). VS Code launches a second window — the
Extension Development Host — with the bridge active. In that window, open the
project whose dev server you are running (`File → Open Folder…` →
`examples/demo-app`, or your own app).

No `launch.json` is committed; F5 on a folder containing an extension manifest
offers *VS Code Extension Development* and that default is all this needs. If
you prefer the CLI:

```bash
code --extensionDevelopmentPath=$PWD/packages/vscode-extension examples/demo-app
```

`npm run watch -w s2c-ide-bridge` recompiles on save; **Cmd/Ctrl+R** in the
development host reloads it.

Start the app's dev server in a terminal (`npm run dev` → :5199) and the status
bar item flips to `$(plug) s2c`.

## Settings

| setting | default | what it does |
|---|---|---|
| `sketch2code.devServerUrl` | `http://localhost:5199` | dev server to attach to |
| `sketch2code.enabled` | `true` | attach at all |
| `sketch2code.cursorSync` | `true` | report the cursor so the page highlights |
| `sketch2code.cursorDebounceMs` | `150` | how long the cursor must sit still |
| `sketch2code.editorName` | `VS Code` | label the overlay shows |

Commands: **sketch-to-code: Reconnect editor bridge** (also: click the status
bar item), **sketch-to-code: Toggle editor bridge**.

Status bar: `$(plug)` connected · `$(sync~spin)` connecting ·
`$(debug-disconnect)` offline (dev server not running — it retries with backoff,
500ms → 15s) · `$(circle-slash)` disabled. The tooltip carries the URL, the dev
server root and the last failure reason.

## Layout — why it is split this way

VS Code cannot be run headlessly here, so everything with behaviour lives
outside the `vscode` API and is unit-tested in the repo's normal `vitest` run:

| file | what | tested by |
|---|---|---|
| `src/protocol.ts` | wire types (mirror of the canonical spec) | — |
| `src/sse.ts` | SSE frame parser (node has no `EventSource`) | `tests/sse.test.ts` |
| `src/client.ts` | connect / greet / reveal / debounce / reconnect, transport and clock injected | `tests/client.test.ts` |
| `src/node-transport.ts` | the only I/O; also used by `tests/e2e/live-ide-bridge.mjs` | that e2e |
| `src/extension.ts` | the adapter: status bar, `showTextDocument`, selection events | by hand (below) |

`tests/e2e/live-ide-bridge.mjs` drives `client.ts` + `node-transport.ts` against
a real dev server on port 5234 with a real Chromium page as the browser end, so
the transport and the protocol are proven end to end — only the vscode API calls
in `extension.ts` are not.

## This package is NOT in the root `tsc -b` graph

It needs `@types/vscode`, which would leak the editor API's globals into every
other package's typecheck, and it emits CommonJS (what VS Code loads) rather
than the ESM everything else here emits. So it has its own `tsconfig.json` and
its own build script, and the root `tsconfig.json` does not reference it. Its
tests are still picked up by the root `vitest run`, because they import only the
vscode-free modules.

## What a human must click to verify the editor half

`extension.ts` has never been run in a real editor here. To check it:

1. Build, F5, open `examples/demo-app` in the development host, `npm run dev`.
2. Status bar shows `$(plug) s2c`; hover it — the tooltip names the dev server
   root.
3. Stop the dev server. Within ~25s the item becomes `$(debug-disconnect)`.
   Restart it: it returns to `$(plug)` on its own, without clicking anything.
4. With the overlay wired up, click an element on the page: the right file opens
   and the cursor sits on the stamped line (compare with the element's
   `data-s2c` in devtools). A `<path>` inside an SVG must work too.
5. Click a *second* element: it reveals without opening a duplicate tab
   (`preview: false`, same document reused).
6. Move the cursor in the editor: the matching element highlights on the page.
   Hold an arrow key — the page must not stutter (one POST per ~150ms, not per
   keystroke; watch the Network tab).
7. Click an element again and confirm the highlight does **not** bounce back
   from the reveal's own cursor move (the 400ms `EchoGuard`).
8. Open a file outside the dev server root (e.g. this README) and move the
   cursor: no cursor POST at all.
9. Run **Toggle editor bridge**: `$(circle-slash)`, no traffic; toggle again and
   it reattaches.
10. Point `sketch2code.devServerUrl` at a dead port: `$(debug-disconnect)`, and
    the editor stays perfectly usable.
