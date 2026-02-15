import {
  FileText, FileCode, FileJson, Image, Film, Music, Archive,
  Database, Settings, Terminal, Package, Braces, Lock
} from 'lucide-react';

/**
 * Get the appropriate icon component for a file based on its name/extension
 * @param {string} fileName - The name of the file
 * @returns {React.Component} Lucide icon component
 */
export const getFileIcon = (fileName) => {
  const ext = fileName.split('.').pop()?.toLowerCase();

  // Code files
  if (['js', 'jsx', 'ts', 'tsx', 'vue', 'svelte'].includes(ext)) return FileCode;
  if (['py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'cs', 'php', 'swift', 'kt'].includes(ext)) return FileCode;
  if (['html', 'css', 'scss', 'sass', 'less', 'xml'].includes(ext)) return FileCode;

  // Config/Data files
  if (['json', 'jsonc'].includes(ext)) return FileJson;
  if (['yml', 'yaml', 'toml', 'ini', 'conf', 'config'].includes(ext)) return Settings;
  if (['md', 'mdx', 'markdown', 'txt', 'log'].includes(ext)) return FileText;

  // Media
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext)) return Image;
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return Film;
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return Music;

  // Archives
  if (['zip', 'tar', 'gz', 'rar', '7z', 'bz2'].includes(ext)) return Archive;

  // Databases
  if (['db', 'sqlite', 'sql'].includes(ext)) return Database;

  // Shell/Terminal
  if (['sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd'].includes(ext)) return Terminal;

  // Package/Lock files
  if (fileName === 'package.json' || fileName === 'composer.json') return Package;
  if (fileName.includes('lock') || fileName === 'Gemfile.lock') return Lock;

  // Special files
  if (fileName === 'Dockerfile' || fileName.startsWith('.docker')) return Braces;
  if (fileName.startsWith('.env')) return Lock;

  return FileText;
};
