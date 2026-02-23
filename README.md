<div align="center">

# Bhunductor

**A native desktop client for Claude Code.**

Point it at any git repo. Get a full workspace — branches, chat, terminal, files — in one window.

Built with Electron, React, and the Claude Agent SDK.

[Getting Started](#getting-started) · [How It Works](#how-it-works) · [Architecture](#architecture)

</div>

---

## The Problem

Claude Code is powerful, but it lives in your terminal. You juggle tabs — one for the CLI, one for your editor, one for git, another for browsing files. Context-switching between branches means restarting sessions. There's no visual history, no way to see what tools Claude used at a glance, and no persistence between sessions.

## What Bhunductor Does

Bhunductor gives Claude Code a proper home. It's a native macOS app that wraps the Claude CLI into a workspace built around how you actually work with repositories.

**Open a repo. Pick a branch. Talk to Claude. See everything.**

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Repo Name                                          ◉ ◉ ◉   │
├────────────┬────────────────────────────────┬───────────────────┤
│            │  Session 1  │  Session 2  │ +  │                   │
│  main    ▾ │─────────────────────────────────│   src/            │
│  ├ feat-a  │                                 │   ├── index.js    │
│  ├ feat-b  │  You: Fix the auth bug in       │   ├── auth/       │
│  └ fix-c   │  the login flow                 │   │   ├── login.js│
│            │                                 │   │   └── ...     │
│  Sessions  │  ◐ Thinking...                  │   ├── utils/      │
│  ├ Fix auth│                                 │   └── ...         │
│  ├ Add API │  Claude: I'll look at the       │                   │
│  └ Refactor│  login handler. Let me read     │                   │
│            │  the file first.                │                   │
│            │                                 │                   │
│            │  ▸ Read src/auth/login.js       │                   │
│            │  ▸ Edit src/auth/login.js       │                   │
│            │    ✓ Approved                   │                   │
│            │                                 │                   │
│            │  The bug was in the token       │                   │
│            │  validation...                  │                   │
│            │                                 │                   │
│            │  ─── $0.03 · 2.4k tokens ───   │                   │
│            │                                 │                   │
├────────────┤  [Type a message...]            ├───────────────────┤
│  ▸ Terminal                                  │                   │
└─────────────────────────────────────────────────────────────────┘
```

### Branch-First Workflow

Every branch is a workspace. Bhunductor uses **git worktrees** under the hood — each branch gets its own isolated directory, so you can switch between features without stashing, committing, or losing context. Your Claude sessions stay attached to their branch.

### Real-Time Streaming Chat

Messages stream in as Claude thinks. You see thinking blocks, text responses, and every tool call as it happens — file reads, edits, bash commands — each in a collapsible block. When Claude needs permission to run something, a prompt appears inline. Approve or deny without breaking flow.

### Session Persistence & Resume

Every conversation is saved locally. Close the app, come back tomorrow, and pick up exactly where you left off. Sessions are auto-named by Claude based on what you're working on, so your sidebar reads like a changelog instead of "New Session 1, 2, 3..."

### Multi-Session Tabs

Work on multiple things at once within a branch. Each session runs in its own tab. Run a refactoring session in one tab while debugging in another. Tab state survives switching between branches and restarting the app.

### Built-In Terminal

A full terminal emulator built into the app. No more switching to iTerm to run a quick command. It's there when you need it, out of the way when you don't.

### File Browser & Code Viewer

Browse your repo's file tree and open any file in a Monaco-powered viewer — the same editor engine behind VS Code. See what changed with built-in git diff support.

### MCP Support

Your existing MCP server configuration (`.mcp.json`, `~/.claude.json`) is loaded automatically. Claude has access to the same tools it would in the CLI.

### Cost Tracking

Every turn shows token usage and cost. No surprises on your API bill.

---

## Getting Started

### Requirements

- **macOS** (native window controls — other platforms not yet supported)
- **Node.js** 18+ (v24 recommended, see `.nvmrc`)
- **Git** on your `PATH`
- **Claude CLI** authenticated — `npm install -g @anthropic-ai/claude-code && claude login`

### Install & Run

```bash
git clone https://github.com/your-username/bhunductor.git
cd bhunductor
npm install
npm run devi    # development mode with hot reload
```

Or for a production build:

```bash
npm start       # build + launch
npm run dist    # package as .dmg
```

### First Launch

1. Open the app — you'll see the home screen
2. Click **Open Folder** and pick a git repository
3. Your branches appear in the sidebar
4. Click **New Session** and start talking to Claude

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
<summary><strong>Process model</strong></summary>

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
<summary><strong>Project structure</strong></summary>

```
bhunductor/
├── main/                    # Electron main process
│   ├── index.js             # App lifecycle & window
│   ├── claude/              # SDK integration
│   │   ├── SDKSession.js    # Wraps Agent SDK
│   │   └── cli-utils.js     # CLI path resolution
│   ├── data/                # SQLite & models
│   │   ├── database.js      # DB init + 8 migrations
│   │   └── models/          # Folder, Worktree, File
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
<summary><strong>Tech stack</strong></summary>

| | |
|---|---|
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
<summary><strong>Build commands</strong></summary>

| Command | What it does |
|---------|-------------|
| `npm run devi` | Dev mode — webpack watch + auto-restart |
| `npm start` | Production build + launch |
| `npm run build` | Webpack production bundle |
| `npm run dist` | Package as macOS .dmg |
| `npm run pack` | Unpacked distributable |

</details>

---

## Status

Bhunductor is under active development. The core workflow — open repo, manage branches, chat with Claude, browse files, use terminal — is functional.

What's here:
- Full Claude chat with streaming, tool use, and permissions
- Git worktree branch management
- Multi-session tabs with persistence and resume
- File browser with Monaco viewer
- Built-in terminal
- MCP server support
- Cost/usage tracking

What's coming:
- Slash commands
- Hook support
- Cross-platform builds (Windows, Linux)

---

## License

MIT
