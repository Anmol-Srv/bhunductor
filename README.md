<div align="center">

# Bhunductor

**A native desktop client for Claude Code.**

Point it at any git repo. Get a full workspace — branches, chat, terminal, files — in one window.

Built with Electron, React, and the Claude Agent SDK.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Platform](https://img.shields.io/badge/Platform-macOS-lightgrey?logo=apple)](https://www.apple.com/macos/)

[Getting Started](#getting-started) · [How It Works](#how-it-works) · [Architecture](#architecture) · [Contributing](#contributing)

</div>

---

## Table of Contents

- [The Problem](#the-problem)
- [What Bhunductor Does](#what-bhunductor-does)
- [Getting Started](#getting-started)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Status & Roadmap](#status--roadmap)
- [Contributing](#contributing)
- [FAQ](#faq)
- [License](#license)

---

## The Problem

Claude Code is powerful, but it lives in your terminal. You juggle tabs — one for the CLI, one for your editor, one for git, another for browsing files. Context-switching between branches means restarting sessions. There's no visual history, no way to see what tools Claude used at a glance, and no persistence between sessions.

## What Bhunductor Does

Bhunductor gives Claude Code a proper home. It's a native macOS app that wraps the Claude CLI into a workspace built around how you actually work with repositories.

**Open a repo. Pick a branch. Talk to Claude. See everything.**

<p align="center">
<img src="https://pbs.twimg.com/media/HB3usTEacAAf-pK?format=jpg&name=4096x4096" height="480" style="max-width: 100%;"/>
</p>

### Features

<details>
<summary><strong>Branch-First Workflow</strong></summary>

Every branch is a workspace. Bhunductor uses **git worktrees** under the hood — each branch gets its own isolated directory, so you can switch between features without stashing, committing, or losing context. Your Claude sessions stay attached to their branch.

</details>

<details>
<summary><strong>Real-Time Streaming Chat</strong></summary>

Messages stream in as Claude thinks. You see thinking blocks, text responses, and every tool call as it happens — file reads, edits, bash commands — each in a collapsible block. When Claude needs permission to run something, a prompt appears inline. Approve or deny without breaking flow.

</details>

<details>
<summary><strong>Session Persistence & Resume</strong></summary>

Every conversation is saved locally. Close the app, come back tomorrow, and pick up exactly where you left off. Sessions are auto-named by Claude based on what you're working on, so your sidebar reads like a changelog instead of "New Session 1, 2, 3..."

</details>

<details>
<summary><strong>Multi-Session Tabs</strong></summary>

Work on multiple things at once within a branch. Each session runs in its own tab. Run a refactoring session in one tab while debugging in another. Tab state survives switching between branches and restarting the app.

</details>

<details>
<summary><strong>Built-In Terminal</strong></summary>

A full terminal emulator built into the app. No more switching to iTerm to run a quick command. It's there when you need it, out of the way when you don't. Terminal state persists across restarts.

</details>

<details>
<summary><strong>File Browser & Code Viewer</strong></summary>

Browse your repo's file tree and open any file in a Monaco-powered viewer — the same editor engine behind VS Code. See what changed with built-in git diff support.

</details>

<details>
<summary><strong>MCP Support</strong></summary>

Your existing MCP server configuration (`.mcp.json`, `~/.claude.json`) is loaded automatically. Claude has access to the same tools it would in the CLI.

</details>

<details>
<summary><strong>Cost Tracking</strong></summary>

Every turn shows token usage and cost. No surprises on your API bill.

</details>

---

## Getting Started

### Prerequisites

- **macOS** (native window controls — other platforms not yet supported)
- **Node.js** 18+ (v24 recommended, see `.nvmrc`)
- **Git** on your `PATH`
- **Claude CLI** authenticated:
  ```bash
  npm install -g @anthropic-ai/claude-code
  claude login
  ```

### Install & Run

```bash
git clone https://github.com/Anmol-Srv/bhunductor.git
cd bhunductor
npm install
```

**Development mode** (hot reload):

```bash
npm run devi
```

**Production build**:

```bash
npm start          # build + launch
npm run dist       # package as .dmg
```

### First Launch

1. Open the app — you'll see the home screen
2. Click **Open Folder** and pick a git repository
3. Your branches appear in the sidebar
4. Click **New Session** and start talking to Claude

> [!TIP]
> Each branch gets its own isolated worktree directory, so you can switch freely without stashing or committing.

---

## How It Works

```
You ──→ Bhunductor ──→ Claude Agent SDK ──→ Claude
        (Electron)      (manages CLI)       (API)
```

Bhunductor doesn't call the Anthropic API directly. It uses the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) which wraps the Claude CLI. This means Claude has the exact same capabilities as the CLI — file editing, bash execution, web search, and any MCP tools you've configured — but surfaced through a visual interface.

Each message you send becomes a `query()` call to the SDK. The SDK handles tool loops internally (Claude reads a file, edits it, runs tests, etc.) and streams events back. Bhunductor renders these events in real-time as chat blocks.

Sessions are stored in a local **SQLite database** (`~/.bhunductor/workspaces.db`). When you resume a session, the SDK picks up the conversation using the stored session ID — full context preserved.

---

## Architecture

<details>
<summary><strong>Process Model</strong></summary>

```
Electron Main Process
├── SessionService ──→ SDKSession (one per active chat)
│                      └── Claude Agent SDK query() calls
├── BranchService ───→ Git worktree operations
├── FileService ─────→ File tree & content reads
├── GitService ──────→ Profile, config, logs, checks
├── TerminalService ─→ PTY shell instances (node-pty)
├── SQLite Database ─→ Repos, worktrees, sessions, messages
└── MCP Server ──────→ In-process, provides rename_session tool

Renderer Process (React)
├── Home page ───────→ Recent repos, open folder
├── Dashboard ───────→ Sidebar + tabbed content + file panel
├── ClaudeChat ──────→ Streaming messages, tools, permissions
├── Terminal ────────→ xterm.js emulator
├── FileViewer ──────→ Monaco editor (read-only)
└── Zustand stores ──→ Sessions, branches, UI state
```

</details>

<details>
<summary><strong>Project Structure</strong></summary>

```
bhunductor/
├── main/                    # Electron main process
│   ├── index.js             # App lifecycle & window
│   ├── claude/              # SDK integration
│   │   ├── SDKSession.js    # Wraps Agent SDK
│   │   └── cli-utils.js     # CLI path resolution
│   ├── data/                # SQLite & models
│   │   ├── database.js      # DB init + migrations
│   │   └── models/          # Folder, Worktree, File, Terminal
│   ├── services/            # Business logic
│   │   ├── SessionService   # Claude session lifecycle
│   │   ├── BranchService    # Worktree management
│   │   ├── FileService      # File operations
│   │   ├── GitService       # Git commands
│   │   └── TerminalService  # PTY terminals
│   └── mcp/                 # MCP server (rename_session)
├── renderer/                # React UI
│   ├── pages/               # Home, Dashboard
│   ├── components/          # Sidebar, chat, terminal, files
│   ├── stores/              # Zustand (sessions, branches, UI)
│   └── styles/              # Dark theme CSS
├── shared/constants.js      # IPC channel definitions
└── package.json
```

</details>

<details>
<summary><strong>Tech Stack</strong></summary>

| Layer | Technology |
|:------|:-----------|
| **App Shell** | Electron 28 |
| **UI** | React 18 · Zustand 5 · Lucide icons |
| **AI** | Claude Agent SDK · MCP SDK |
| **Database** | SQLite (better-sqlite3) |
| **Terminal** | xterm.js 6 · node-pty |
| **Editor** | Monaco Editor |
| **Markdown** | marked · highlight.js |
| **Build** | Webpack 5 · Babel · electron-builder |

</details>

<details>
<summary><strong>Build Commands</strong></summary>

| Command | What it does |
|:--------|:-------------|
| `npm run devi` | Dev mode — webpack watch + auto-restart |
| `npm start` | Production build + launch |
| `npm run build` | Webpack production bundle |
| `npm run dist` | Package as macOS `.dmg` |
| `npm run pack` | Unpacked distributable |

</details>

---

## Configuration

### App Data

| Location | Contents |
|:---------|:---------|
| `~/.bhunductor/` | SQLite database (`workspaces.db`), app config (`config.json`) |
| `{repo}/.bhunductor/worktrees/` | Git worktree directories per branch |
| `/tmp/mcp-config-{id}.json` | Temporary MCP configs (cleaned up on exit) |

### MCP Servers

Bhunductor automatically merges MCP server configuration from:

- **Project-level**: `.mcp.json` in the repository root
- **User-level**: `~/.claude.json`

No extra setup needed — if it works in Claude CLI, it works in Bhunductor.

### Model Selection

Choose your Claude model per message from the chat input toolbar. The default model can be set in **Settings**.

---

## Status & Roadmap

Bhunductor is under active development. The core workflow — open repo, manage branches, chat with Claude, browse files, use terminal — is functional.

**What's here:**

- [x] Full Claude chat with streaming, tool use, and permissions
- [x] Git worktree branch management
- [x] Multi-session tabs with persistence and resume
- [x] File browser with Monaco viewer
- [x] Built-in terminal with persistence
- [x] MCP server support
- [x] Cost/usage tracking
- [x] Per-message model selection
- [x] Session auto-naming by Claude

**What's coming:**

- [ ] Slash commands
- [ ] Hook support
- [ ] Cross-platform builds (Windows, Linux)

See the [open issues](https://github.com/Anmol-Srv/bhunductor/issues) for a full list of proposed features and known issues.

---

## Contributing

Contributions are welcome! Follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

> [!IMPORTANT]
> There are no tests or linting configured yet. Please manually verify your changes work before submitting a PR.

---

## FAQ

<details>
<summary><strong>Does Bhunductor call the Anthropic API directly?</strong></summary>

No. It uses the Claude Agent SDK which wraps the Claude CLI. You need the CLI installed and authenticated — Bhunductor piggybacks on your existing setup.

</details>

<details>
<summary><strong>Does it work on Windows or Linux?</strong></summary>

Not yet. The app uses native macOS window controls. Cross-platform support is on the roadmap.

</details>

<details>
<summary><strong>Where are my sessions stored?</strong></summary>

All data is stored locally in `~/.bhunductor/workspaces.db` (SQLite). Nothing is sent to external servers beyond the normal Claude API calls.

</details>

<details>
<summary><strong>Can I use my existing MCP servers?</strong></summary>

Yes. Bhunductor loads `.mcp.json` from your project root and `~/.claude.json` from your home directory automatically.

</details>

<details>
<summary><strong>Why git worktrees instead of regular branch switching?</strong></summary>

Worktrees give each branch its own directory on disk, so you can switch branches without stashing or committing. Each branch's Claude sessions stay isolated and your working state is preserved.

</details>

---

## License

This project is licensed under the MIT License.

---

<div align="center">

**[Anmol](https://github.com/Anmol-Srv)**

Built with [Electron](https://www.electronjs.org/) · [React](https://react.dev/) · [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)

</div>
