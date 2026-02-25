import React from 'react';
import {
  FileText, FileCode, FileJson, Image, Film, Music, Archive,
  Database, Settings, Terminal, Package, Braces, Lock, Hash,
  Globe, Palette, Shield, BookOpen, Cpu, Box, Cog, Key,
  FileType, Gem, Coffee, Bug
} from 'lucide-react';

// Color map: extension → icon color (VS Code–inspired)
const FILE_COLORS = {
  // JavaScript / TypeScript
  js: '#f1e05a', jsx: '#f1e05a', mjs: '#f1e05a', cjs: '#f1e05a',
  ts: '#3178c6', tsx: '#3178c6', mts: '#3178c6',
  // Web
  html: '#e34c26', htm: '#e34c26',
  css: '#563d7c', scss: '#c6538c', sass: '#c6538c', less: '#1d365d',
  vue: '#41b883', svelte: '#ff3e00',
  // Data / Config
  json: '#f1e05a', jsonc: '#f1e05a', json5: '#f1e05a',
  yml: '#cb171e', yaml: '#cb171e',
  toml: '#9c4221', ini: '#9c4221', conf: '#9c4221',
  xml: '#e34c26',
  // Python
  py: '#3572a5', pyw: '#3572a5', pyi: '#3572a5',
  // Ruby
  rb: '#cc342d', erb: '#cc342d', gemspec: '#cc342d',
  // Go
  go: '#00add8',
  // Rust
  rs: '#dea584',
  // Java / Kotlin
  java: '#b07219', kt: '#a97bff', kts: '#a97bff',
  // C family
  c: '#555555', h: '#555555',
  cpp: '#f34b7d', cc: '#f34b7d', cxx: '#f34b7d', hpp: '#f34b7d',
  cs: '#178600',
  // PHP
  php: '#4f5d95',
  // Swift
  swift: '#f05138',
  // Shell
  sh: '#89e051', bash: '#89e051', zsh: '#89e051', fish: '#89e051',
  ps1: '#012456', bat: '#c1f12e', cmd: '#c1f12e',
  // Markdown / Text
  md: '#083fa1', mdx: '#083fa1', markdown: '#083fa1',
  txt: '#6a737d', log: '#6a737d',
  // Media
  png: '#a97bff', jpg: '#a97bff', jpeg: '#a97bff', gif: '#a97bff',
  svg: '#ffb13b', webp: '#a97bff', ico: '#a97bff', bmp: '#a97bff',
  mp4: '#e34c26', mov: '#e34c26', avi: '#e34c26', mkv: '#e34c26', webm: '#e34c26',
  mp3: '#f1e05a', wav: '#f1e05a', ogg: '#f1e05a', flac: '#f1e05a',
  // Database
  sql: '#e38c00', db: '#e38c00', sqlite: '#e38c00',
  // Archives
  zip: '#6a737d', tar: '#6a737d', gz: '#6a737d', rar: '#6a737d',
  // Misc
  graphql: '#e10098', gql: '#e10098',
  prisma: '#2d3748',
  env: '#ecd53f',
  lock: '#6a737d',
  map: '#6a737d',
  wasm: '#654ff0',
};

// Icon map: extension → lucide icon component
const FILE_ICONS = {
  // JavaScript / TypeScript
  js: FileCode, jsx: FileCode, mjs: FileCode, cjs: FileCode,
  ts: FileCode, tsx: FileCode, mts: FileCode,
  // Web
  html: Globe, htm: Globe,
  css: Palette, scss: Palette, sass: Palette, less: Palette,
  vue: FileCode, svelte: FileCode,
  // Data / Config
  json: Braces, jsonc: Braces, json5: Braces,
  yml: Settings, yaml: Settings,
  toml: Cog, ini: Cog, conf: Cog,
  xml: FileCode,
  // Python
  py: FileCode, pyw: FileCode, pyi: FileCode,
  // Ruby
  rb: Gem, erb: Gem, gemspec: Gem,
  // Go / Rust
  go: FileCode, rs: FileCode,
  // Java / Kotlin
  java: Coffee, kt: FileCode, kts: FileCode,
  // C family
  c: FileCode, h: FileCode, cpp: FileCode, cc: FileCode, cxx: FileCode, hpp: FileCode,
  cs: FileCode, php: FileCode, swift: FileCode,
  // Shell
  sh: Terminal, bash: Terminal, zsh: Terminal, fish: Terminal,
  ps1: Terminal, bat: Terminal, cmd: Terminal,
  // Markdown / Text
  md: BookOpen, mdx: BookOpen, markdown: BookOpen,
  txt: FileText, log: FileText,
  // Media
  png: Image, jpg: Image, jpeg: Image, gif: Image,
  svg: Image, webp: Image, ico: Image, bmp: Image,
  mp4: Film, mov: Film, avi: Film, mkv: Film, webm: Film,
  mp3: Music, wav: Music, ogg: Music, flac: Music,
  // Database
  sql: Database, db: Database, sqlite: Database,
  // Archives
  zip: Archive, tar: Archive, gz: Archive, rar: Archive, '7z': Archive, bz2: Archive,
  // Misc
  graphql: Hash, gql: Hash,
  prisma: Database,
  wasm: Cpu,
  map: FileText,
};

// Special filename overrides (exact match)
const SPECIAL_FILES = {
  'package.json': { icon: Package, color: '#cb3837' },
  'package-lock.json': { icon: Lock, color: '#cb3837' },
  'yarn.lock': { icon: Lock, color: '#2c8ebb' },
  'pnpm-lock.yaml': { icon: Lock, color: '#f9ad00' },
  'bun.lockb': { icon: Lock, color: '#fbf0df' },
  'tsconfig.json': { icon: Cog, color: '#3178c6' },
  'jsconfig.json': { icon: Cog, color: '#f1e05a' },
  '.gitignore': { icon: Shield, color: '#f05032' },
  '.gitattributes': { icon: Shield, color: '#f05032' },
  '.eslintrc': { icon: Bug, color: '#4b32c3' },
  '.eslintrc.js': { icon: Bug, color: '#4b32c3' },
  '.eslintrc.json': { icon: Bug, color: '#4b32c3' },
  '.prettierrc': { icon: Palette, color: '#c596c7' },
  '.prettierrc.js': { icon: Palette, color: '#c596c7' },
  'prettier.config.js': { icon: Palette, color: '#c596c7' },
  '.editorconfig': { icon: Cog, color: '#e0efef' },
  'Dockerfile': { icon: Box, color: '#2496ed' },
  'docker-compose.yml': { icon: Box, color: '#2496ed' },
  'docker-compose.yaml': { icon: Box, color: '#2496ed' },
  '.dockerignore': { icon: Box, color: '#2496ed' },
  'Makefile': { icon: Terminal, color: '#6a737d' },
  'CMakeLists.txt': { icon: Terminal, color: '#6a737d' },
  'Gemfile': { icon: Gem, color: '#cc342d' },
  'Gemfile.lock': { icon: Lock, color: '#cc342d' },
  'Rakefile': { icon: Gem, color: '#cc342d' },
  'webpack.config.js': { icon: Box, color: '#8dd6f9' },
  'vite.config.js': { icon: Cpu, color: '#646cff' },
  'vite.config.ts': { icon: Cpu, color: '#646cff' },
  'tailwind.config.js': { icon: Palette, color: '#06b6d4' },
  'tailwind.config.ts': { icon: Palette, color: '#06b6d4' },
  'CLAUDE.md': { icon: Cpu, color: '#d97757' },
  'LICENSE': { icon: Shield, color: '#f1e05a' },
  'LICENSE.md': { icon: Shield, color: '#f1e05a' },
  'README.md': { icon: BookOpen, color: '#083fa1' },
};

/**
 * Get the appropriate icon component for a file based on its name/extension
 * @param {string} fileName - The name of the file
 * @returns {React.Component} Lucide icon component
 */
export const getFileIcon = (fileName) => {
  const special = SPECIAL_FILES[fileName];
  if (special) return special.icon;

  const ext = fileName.split('.').pop()?.toLowerCase();

  // .env files
  if (fileName.startsWith('.env')) return Key;

  return FILE_ICONS[ext] || FileText;
};

/**
 * Get the color for a file icon
 * @param {string} fileName - The name of the file
 * @returns {string} CSS color value
 */
export const getFileIconColor = (fileName) => {
  const special = SPECIAL_FILES[fileName];
  if (special) return special.color;

  const ext = fileName.split('.').pop()?.toLowerCase();

  if (fileName.startsWith('.env')) return '#ecd53f';

  return FILE_COLORS[ext] || 'var(--ink-muted)';
};

// Folder colors by name (VS Code–style)
const FOLDER_COLORS = {
  'src': '#42a5f5',
  'lib': '#42a5f5',
  'app': '#42a5f5',
  'pages': '#42a5f5',
  'components': '#7e57c2',
  'hooks': '#7e57c2',
  'utils': '#7e57c2',
  'helpers': '#7e57c2',
  'services': '#7e57c2',
  'stores': '#7e57c2',
  'api': '#ef5350',
  'routes': '#ef5350',
  'middleware': '#ef5350',
  'public': '#66bb6a',
  'static': '#66bb6a',
  'assets': '#66bb6a',
  'images': '#66bb6a',
  'icons': '#66bb6a',
  'styles': '#ce93d8',
  'css': '#ce93d8',
  'config': '#ffa726',
  'configs': '#ffa726',
  'test': '#ffca28',
  'tests': '#ffca28',
  '__tests__': '#ffca28',
  'spec': '#ffca28',
  'node_modules': '#6a737d',
  'dist': '#6a737d',
  'build': '#6a737d',
  '.git': '#f05032',
  'main': '#42a5f5',
  'renderer': '#7e57c2',
  'shared': '#66bb6a',
  'data': '#ffa726',
  'models': '#ffa726',
  'mcp': '#ef5350',
  'claude': '#d97757',
  'terminal': '#89e051',
  'settings': '#ffa726',
};

/**
 * Get folder icon color based on folder name
 * @param {string} folderName
 * @returns {string} CSS color value
 */
export const getFolderColor = (folderName) => {
  return FOLDER_COLORS[folderName] || 'var(--conductor)';
};
