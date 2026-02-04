# Bhunductor

A visually stunning dark UI layer for managing git repositories and Claude interactions.

## Phase 1 Features

- **Home Screen**: Beautiful landing page with recent folders (max 5)
- **Folder Management**: Open git repositories, auto-validation, persistent history
- **Dashboard Layout**: Header with navigation, collapsible sidebar, split right panel
- **Data Storage**: SQLite database in `~/.bhunductor/` for workspace management
- **Git Validation**: Only git repositories can be opened
- **Auto-cleanup**: Invalid folder paths removed on startup

## Project Structure

```
bhunductor/
├── main/                   # Electron main process
│   ├── index.js            # App lifecycle
│   ├── ipc-handlers.js     # IPC routing
│   ├── data/
│   │   ├── config-manager.js
│   │   └── folder-manager.js
│   └── utils/
│       └── paths.js
├── renderer/               # React UI
│   ├── App.js
│   ├── pages/
│   │   ├── Home.js
│   │   └── Dashboard.js
│   ├── components/
│   │   ├── Header.js
│   │   ├── Sidebar.js
│   │   ├── MainContent.js
│   │   └── RightPanel.js
│   └── styles/
│       ├── global.css
│       └── theme.css
└── shared/
    └── constants.js
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
npm start
```

## Data Storage

Application data is stored in `~/.bhunductor/`:
- `config.json` - Application settings (theme, window size)
- `workspaces.db` - SQLite database for folders and sessions

## Requirements

- Node.js v18+ (tested on v24)
- macOS (other platforms untested)
- Git installed

## Phase 1 Scope

This is the initial MVP release with:
- Folder opening and management
- Basic navigation
- UI layout foundation

Future phases will add:
- Claude chat integration
- Terminal integration
- Git worktree support
- File explorer
