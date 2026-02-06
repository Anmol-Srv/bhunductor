# Bhunductor - Claude Desktop Integration

## Overview

**Bhunductor** is an Electron-based desktop application that serves as a visual UI layer for the Claude CLI. It bridges local git repository management with AI assistance, allowing developers to interact with Claude within the context of their repositories while managing multiple development branches simultaneously through git worktrees.

**Current Stage:** Early-stage Active Development (MVP Phase)

## Core Concept

Bhunductor enables developers to:
- Open and manage multiple git repositories
- Create and switch between git worktrees (multiple working copies of branches)
- Start Claude CLI sessions within repository contexts
- Interact with Claude through a chat interface
- Handle MCP (Model Context Protocol) permission requests through a visual UI
- Maintain awareness of repository and branch context during AI interactions

## Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Electron | 28.1.3 |
| Frontend | React | 18.2.0 |
| Database | SQLite (better-sqlite3) | 11.7.0 |
| Build Tool | Webpack | 5 |
| UI Icons | Lucide React | 0.563.0 |
| MCP SDK | @modelcontextprotocol/sdk | 1.26.0 |
| External Tool | Claude CLI | Latest |

## Project Structure

```
Bhunductor/
├── main/                                # Electron Main Process (Node.js)
│   ├── index.js                         # App entry point, window creation, lifecycle
│   ├── ipc-handlers.js                  # IPC channel handlers (22 channels)
│   │
│   ├── data/                            # Data layer
│   │   ├── database.js                  # SQLite connection, schema, migrations
│   │   ├── config-manager.js            # App configuration (config.json)
│   │   ├── paths.js                     # App data path utilities
│   │   └── models/
│   │       ├── Folder.js                # Repository model & operations
│   │       └── Worktree.js              # Git worktree model & operations
│   │
│   ├── claude/                          # Claude CLI Integration
│   │   ├── ClaudeSessionManager.js      # Session lifecycle, multi-session support
│   │   └── ClaudeProcess.js             # Subprocess spawning, stream handling
│   │
│   ├── mcp/                             # Model Context Protocol
│   │   ├── PermissionHttpServer.js      # HTTP server for permission requests
│   │   └── permission-server.js         # MCP server subprocess (Node script)
│   │
│   └── utils/
│       └── paths.js                     # Filesystem utilities
│
├── renderer/                            # Electron Renderer Process (React)
│   ├── index.js                         # React app entry
│   ├── index.html                       # HTML shell
│   ├── preload.js                       # Context bridge for secure IPC
│   ├── App.js                           # Root component, routing logic
│   │
│   ├── pages/
│   │   ├── Home.js                      # Recent repositories view
│   │   └── Dashboard.js                 # Repository dashboard with worktrees
│   │
│   └── components/
│       ├── Header.js                    # Top navigation with back/forward
│       ├── Sidebar.js                   # Worktree list, branch switcher
│       ├── MainContent.js               # Center content area
│       ├── RightPanel.js                # Reserved for future features
│       ├── BranchItem.js                # Individual worktree item
│       ├── CreateBranchModal.js         # Branch creation modal
│       ├── DeleteConfirmModal.js        # Deletion confirmation
│       └── claude/
│           ├── ClaudeChat.js            # Chat interface with streaming
│           └── PermissionPrompt.js      # MCP permission UI
│
├── shared/
│   └── constants.js                     # Shared IPC channel names
│
└── package.json                         # Dependencies, scripts, build config
```

## Database Schema

SQLite database with 5 tables:

### `folders`
Primary repository storage
- `id` (TEXT PRIMARY KEY)
- `path` (TEXT UNIQUE) - Main repository path
- `name` (TEXT) - Display name
- `last_opened` (DATETIME)
- `created_at` (DATETIME)
- `metadata` (TEXT JSON) - Extensible metadata
- `active_worktree_id` (TEXT FK) - Currently active worktree

### `worktrees`
Git worktree tracking
- `id` (TEXT PRIMARY KEY)
- `folder_id` (TEXT FK → folders)
- `branch_name` (TEXT) - Git branch name
- `worktree_path` (TEXT) - Physical path (NULL for main branch)
- `is_main` (INTEGER) - Boolean: 1 for main repo, 0 for worktrees
- `created_at` (DATETIME)
- `last_accessed` (DATETIME)

### `claude_sessions`
Active Claude CLI sessions
- `id` (TEXT PRIMARY KEY)
- `folder_id` (TEXT FK → folders)
- `worktree_id` (TEXT FK → worktrees)
- `status` (TEXT) - active/stopped/exited
- `created_at` (DATETIME)

### `sessions`
Reserved for future session data

### `migrations`
Schema version tracking
- `id` (TEXT PRIMARY KEY)
- `name` (TEXT)
- `applied_at` (DATETIME)

## Key Features

### 1. Repository Management
- **Open Repositories:** File dialog to select git repositories
- **Recent Folders:** Quick access to recently opened repos
- **Validation:** Automatic git repository validation
- **Auto-cleanup:** Invalid/deleted repos removed on startup
- **Location:** `main/ipc-handlers.js:folder:*`, `main/data/models/Folder.js`

### 2. Git Worktree Management
- **Main Branch Init:** Initialize primary worktree from main/master
- **Create Worktrees:** Create feature branch worktrees in `.bhunductor/worktrees/`
- **Delete Worktrees:** Safe deletion with confirmation
- **Active Worktree:** Track which worktree is currently active
- **Branch Validation:** Validate branch names per git rules
- **Auto-detection:** Detect default branch from remote HEAD
- **Location:** `main/ipc-handlers.js:worktree:*`, `main/data/models/Worktree.js`

### 3. Claude CLI Integration
- **Session Management:** Start, stop, list multiple Claude sessions
- **Streaming Responses:** Real-time message streaming via NDJSON
- **Repository Context:** Claude runs in worktree directory with full context
- **Multi-session:** Support multiple concurrent Claude conversations
- **Location:** `main/claude/ClaudeSessionManager.js`, `main/claude/ClaudeProcess.js`

**Claude Process Configuration:**
```bash
claude --print \
  --input-format stream-json \
  --output-format stream-json \
  --mcp-config /tmp/mcp-config-{sessionId}.json \
  --permission-prompt-tool request_permission
```

### 4. MCP Permission Handling
- **HTTP Permission Server:** Runs on port 58472
- **Permission Prompts:** Visual UI for approving/denying tool use
- **MCP Integration:** Seamless integration with Claude CLI permission system
- **Request Flow:** Claude → MCP Server → HTTP → Electron → User → Response
- **Location:** `main/mcp/PermissionHttpServer.js`, `main/mcp/permission-server.js`

### 5. User Interface
- **Home Page:** Recent repositories with quick open
- **Dashboard:** Repository view with sidebar, content area, panels
- **Navigation:** Browser-like back/forward navigation
- **Chat Interface:** Claude conversation UI with streaming
- **Modals:** Branch creation, deletion confirmation, permissions
- **Location:** `renderer/pages/`, `renderer/components/`

## IPC Communication

### Main → Renderer Events
```javascript
claude:message-chunk        // Streaming text content from Claude
claude:message-complete     // Message finished
claude:permission-request   // MCP permission needed
claude:session-error        // Error occurred in session
claude:session-exited       // Session terminated
```

### Renderer → Main Invocations
```javascript
// Configuration
config:get, config:set

// Folders
folder:open-dialog, folder:get-recent, folder:add, folder:remove, folder:validate-git

// Worktrees
worktree:init-main, worktree:list, worktree:create, worktree:delete
worktree:validate-name, worktree:set-active, worktree:cleanup

// Claude Sessions
claude:session-start, claude:session-stop, claude:session-list
claude:send-message, claude:permission-respond

// App
app:get-version, app:quit
```

## Architecture Patterns

### 1. Process Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   IPC Layer  │  │   Database   │  │  Session Manager │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┼─────────┐
                    │         │         │
            ┌───────▼─────┐   │   ┌─────▼──────────┐
            │   Renderer  │   │   │ Claude Process │
            │   (React)   │   │   │  (Subprocess)  │
            └─────────────┘   │   └────────────────┘
                              │
                    ┌─────────▼────────────┐
                    │   MCP Server         │
                    │   (Subprocess)       │
                    │   ↕ HTTP:58472       │
                    └──────────────────────┘
```

### 2. Data Flow Patterns

**Singleton Database:**
```javascript
const db = getDatabase(); // Returns single connection instance
```

**Model-based Access:**
```javascript
Folder.findRecent()
Worktree.createWorktree(folderId, branchName)
// Models encapsulate all database operations
```

**Event-driven Updates:**
```javascript
// Main process emits events
session.process.on('message-chunk', (data) => {
  window.webContents.send('claude:message-chunk', sessionId, data);
});

// Renderer listens
window.electron.on('claude:message-chunk', (sessionId, content) => {
  // Update UI
});
```

### 3. Permission Request Flow
```
1. Claude CLI requests tool use
   ↓
2. MCP server intercepts (--permission-prompt-tool)
   ↓
3. HTTP POST to http://localhost:58472/permission
   ↓
4. PermissionHttpServer receives request
   ↓
5. IPC event to renderer: claude:permission-request
   ↓
6. PermissionPrompt modal displayed
   ↓
7. User approves/denies
   ↓
8. Response via claude:permission-respond IPC
   ↓
9. HTTP response sent back to MCP server
   ↓
10. MCP server returns allow/deny to Claude
```

## Recent Development Activity

### Latest Commits (Descending)
1. **MCP Permission Handling** - Integrated permission server for managing tool use via HTTP
2. **Claude Session Management** - Added session lifecycle, multi-session support, streaming
3. **Worktree Management** - Full worktree CRUD operations with database tracking
4. **Folder History Fix** - Prevent duplicate entries in folder history

### Currently Modified Files
```
M main/claude/ClaudeProcess.js          # Claude subprocess management
M main/claude/ClaudeSessionManager.js   # Session lifecycle
M main/mcp/PermissionHttpServer.js      # Permission HTTP server
M main/mcp/permission-server.js         # MCP server script
M renderer/components/claude/ClaudeChat.js        # Chat UI
M renderer/components/claude/PermissionPrompt.js  # Permission UI
```

## Development Status

### ✅ Completed Features
- [x] Electron app infrastructure
- [x] SQLite database with migrations
- [x] Repository selection and management
- [x] Git worktree creation and deletion
- [x] Claude CLI subprocess integration
- [x] Streaming message display
- [x] MCP permission server infrastructure
- [x] Basic UI components and navigation
- [x] IPC communication layer

### 🔄 In Progress
- [ ] MCP permission UI refinement
- [ ] Multi-session tab interface
- [ ] Session state persistence
- [ ] Error handling improvements

### 📋 Potential Next Steps
- [ ] Permission caching/remember decisions
- [ ] Session history and chat logs
- [ ] UI styling and polish
- [ ] Performance optimization
- [ ] Test coverage
- [ ] Application packaging (distributable)
- [ ] Documentation
- [ ] CI/CD pipeline

## Important File Locations

### Entry Points
- **Main Process:** `/main/index.js` - Electron app entry
- **Renderer:** `/renderer/index.js` - React app entry
- **Preload:** `/renderer/preload.js` - Context bridge

### Core Systems
- **IPC Handlers:** `/main/ipc-handlers.js` - All IPC channel handlers
- **Database:** `/main/data/database.js` - Schema, migrations, connection
- **Session Manager:** `/main/claude/ClaudeSessionManager.js` - Claude session lifecycle
- **Permission Server:** `/main/mcp/PermissionHttpServer.js` - MCP permission handling

### Models
- **Folder:** `/main/data/models/Folder.js` - Repository operations
- **Worktree:** `/main/data/models/Worktree.js` - Worktree operations

### UI Components
- **Home:** `/renderer/pages/Home.js` - Recent repositories
- **Dashboard:** `/renderer/pages/Dashboard.js` - Repository dashboard
- **Chat:** `/renderer/components/claude/ClaudeChat.js` - Claude conversation
- **Permissions:** `/renderer/components/claude/PermissionPrompt.js` - Permission UI

## Configuration

### App Data Locations
```javascript
// macOS
~/Library/Application Support/bhunductor/
  ├── config.json           // App configuration
  ├── database.db           // SQLite database
  └── logs/                 // Application logs

// Worktrees
{repository}/.bhunductor/
  └── worktrees/
      ├── feature-branch-1/
      └── feature-branch-2/
```

### Database Migrations
Migrations run automatically on app startup. Located in `/main/data/database.js`:
1. `add_active_worktree_to_folders` - Add active_worktree_id column
2. `fix_worktree_main_branch` - Clean up worktree data

## Testing & Development

### Running the App
```bash
npm start              # Start Electron app
npm run build          # Build renderer bundle
npm run watch          # Watch mode for development
```

### Key Dependencies
```json
{
  "electron": "^28.1.3",
  "react": "^18.2.0",
  "better-sqlite3": "^11.7.0",
  "@modelcontextprotocol/sdk": "^1.26.0"
}
```

## Known Considerations

### Worktree Handling
- Main branch is stored as `is_main = 1` with `worktree_path = NULL`
- Feature branches stored in `.bhunductor/worktrees/{branch-name}/`
- Default branch detection tries: remote HEAD → local main → local master

### Claude Process Management
- Each session spawns a new Claude CLI process
- Temp MCP config files created per session, cleaned up on exit
- Sessions communicate via NDJSON streaming
- Session ID passed to MCP server via environment variable

### MCP Server
- Runs as separate Node.js subprocess
- Communicates with Electron via HTTP on port 58472
- Provides `request_permission` tool to Claude CLI
- Single server instance can handle multiple Claude sessions

## Security Notes

- IPC context bridge in preload.js prevents direct Node.js access from renderer
- Permission prompts ensure user approval before tool execution
- Database uses prepared statements to prevent SQL injection
- Temp files cleaned up on session exit

## Future Considerations

- **Multi-window Support:** Open multiple repositories in separate windows
- **Session Persistence:** Resume conversations after app restart
- **Plugin System:** Extensible tool integrations
- **Cloud Sync:** Sync settings and history across devices
- **Performance:** Optimize for large repositories
- **Testing:** Unit tests, integration tests, E2E tests

---

**Last Updated:** 2026-02-05
**Current Branch:** claude-sessions
**Main Branch:** master
