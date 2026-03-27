# Local Agent Chat (Obsidian Plugin)

Local-first Obsidian desktop plugin that provides a right-sidebar chat UI and delegates each turn to a local CLI agent process (Codex first).

## Features

- Right sidebar chat view (`Local Agent Chat`).
- One-command-per-turn execution model.
- Streaming output from child process.
- Stop/cancel active run.
- Markdown session persistence to `AI Chats/` by default.
- Dangerous command detection + confirmation modal.
- Optional raw command mode with `!cmd ...` (if `Allow any command` is enabled).

## Quick Start

1. Install dependencies:
   - `npm install`
2. Build:
   - `npm run build`
3. Copy plugin files into your vault plugin folder:
   - `main.js`
   - `manifest.json`
   - `styles.css`
   - `versions.json`
4. Enable plugin in Obsidian.

## Settings

- `Codex executable path` (default `codex`)
- `Codex args template` (default `exec "{prompt}"`)
- `Default working directory`
- `Chat folder` (default `AI Chats`)
- `Allow any command`
- `Require danger confirmation`
- `Execution timeout (ms)`

