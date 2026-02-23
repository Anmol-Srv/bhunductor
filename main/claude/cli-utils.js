const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

/**
 * Resolve the full path to the `claude` binary.
 * Electron apps launched from macOS Finder may have a stripped PATH,
 * so we resolve once using a login shell.
 */
let resolvedClaudePath = null;
function getClaudePath() {
  if (resolvedClaudePath) return resolvedClaudePath;
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude'
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      resolvedClaudePath = p;
      return p;
    }
  }
  try {
    resolvedClaudePath = execSync('which claude', {
      shell: process.env.SHELL || '/bin/zsh',
      env: { ...process.env, HOME: os.homedir() }
    }).toString().trim();
    return resolvedClaudePath;
  } catch {
    return 'claude';
  }
}

/**
 * Validate that the Claude CLI is installed and return version info.
 * @returns {{ available: boolean, path: string|null, version: string|null, error: string|null }}
 */
function validateCLI() {
  const claudeBin = getClaudePath();
  if (claudeBin === 'claude') {
    return { available: false, path: null, version: null, error: 'Claude CLI not found in any known location' };
  }
  try {
    const version = execSync(`"${claudeBin}" --version`, {
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 5000
    }).trim();
    return { available: true, path: claudeBin, version, error: null };
  } catch (err) {
    return { available: true, path: claudeBin, version: null, error: `Failed to get version: ${err.message}` };
  }
}

module.exports = { getClaudePath, validateCLI };
