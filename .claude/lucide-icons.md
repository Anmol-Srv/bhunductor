# Lucide Icons in Bhunductor

## Installation

```bash
npm install lucide-react
```

## Usage

Import icons from `lucide-react`:

```javascript
import { Home, ChevronLeft, ChevronRight, Folder } from 'lucide-react';

// Use in JSX
<Home size={16} />
<Folder size={18} className="folder-icon" />
```

## Icons Used in Bhunductor

### Navigation (Header.js)
- `ChevronLeft` - Back button
- `ChevronRight` - Forward button
- `Home` - Home button

### Folders (Home.js)
- `Folder` - Folder icon in recent list
- `FolderOpen` - Optional for hover state

### Sidebar (Sidebar.js)
- `PanelLeftClose` - Collapse sidebar
- `PanelLeft` - Expand sidebar

## Common Icons for Future Use

### File Operations
- `File`, `FileText`, `FileCode`
- `FolderPlus`, `FilePlus`
- `Trash2`, `Archive`

### Git
- `GitBranch`, `GitCommit`, `GitPullRequest`
- `GitMerge`, `GitFork`

### Terminal
- `Terminal`, `Command`
- `Play`, `Square`, `X`

### UI
- `Menu`, `X`, `Settings`
- `Search`, `Filter`
- `ChevronDown`, `ChevronUp`
- `MoreVertical`, `MoreHorizontal`

### Actions
- `Plus`, `Minus`, `Check`, `X`
- `Edit3`, `Copy`, `Download`
- `ExternalLink`, `Link`

## Styling

All icons use:
- `size` prop for dimensions (16-24px)
- `className` for custom styling
- Color inherited from parent text color
- No stroke-width override (uses default)

## Guidelines

1. Keep icon sizes consistent: 16px (small), 18px (medium), 24px (large)
2. Use semantic icons (Home for home, not House)
3. Don't mix icon styles (all Lucide, no emojis)
4. Icons should be monochrome (inherit text color)
5. Add hover states via CSS, not different icons
