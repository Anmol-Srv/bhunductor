const { spawn } = require('child_process');
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
  // Try direct lookup first
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
  // Fallback: ask a login shell
  try {
    resolvedClaudePath = execSync('which claude', {
      shell: process.env.SHELL || '/bin/zsh',
      env: { ...process.env, HOME: os.homedir() }
    }).toString().trim();
    return resolvedClaudePath;
  } catch {
    // Last resort: hope it's on PATH
    return 'claude';
  }
}

class ClaudeProcess {
  constructor(sessionId, workingDir, callbacks, options = {}) {
    this.sessionId = sessionId;
    this.workingDir = workingDir;
    this.callbacks = callbacks; // { onChunk, onComplete, onError, onExit, onSystemInfo, onHistory, onToolUse, onToolResult, onThinking, onTurnComplete }
    this.options = options; // { resumeSessionId, continueSession, permissionPort }
    this.buffer = '';
    this.process = null;
    this.currentContentBlock = null;
    this.claudeSessionId = null;
    this.isReplayingHistory = !!(options.resumeSessionId || options.continueSession);
    this.historyMessages = [];
    this.replayTimer = null;
    this.mcpConfigPath = null;
    this.hasStreamedContent = false; // true once content_block_* events arrive (skips assistant event re-processing)
  }

  start() {
    const permissionServerPath = path.join(__dirname, '../mcp/permission-server.js');
    const permissionPort = String(this.options.permissionPort || 58472);

    const mcpConfig = {
      mcpServers: {
        'bhunductor-permissions': {
          command: 'node',
          args: [permissionServerPath],
          env: {
            ELECTRON_PERMISSION_PORT: permissionPort,
            SESSION_ID: this.sessionId
          }
        }
      }
    };

    const tempDir = os.tmpdir();
    const mcpConfigPath = path.join(tempDir, `bhunductor-mcp-${this.sessionId}.json`);
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    this.mcpConfigPath = mcpConfigPath;

    const args = [
      '--print',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--model', 'haiku',
      '--mcp-config', mcpConfigPath,
      '--permission-prompt-tool', 'mcp__bhunductor-permissions__request_permission',
      '--verbose'
    ];

    if (this.options.resumeSessionId) {
      args.push('--resume', this.options.resumeSessionId);
    } else if (this.options.continueSession) {
      args.push('--continue');
    } else {
      // New session: pass our UUID so claude_session_id is known from the start
      args.push('--session-id', this.sessionId);
    }

    const claudeBin = getClaudePath();
    console.log('[Claude CLI] Spawning:', claudeBin, args.join(' '));

    this.process = spawn(claudeBin, args, {
      cwd: this.workingDir,
      env: {
        ...process.env,
        ELECTRON_PERMISSION_PORT: permissionPort
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true
    });

    // Don't let the child keep Electron alive
    this.process.unref();

    this.process.stdout.on('data', (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr.on('data', (data) => {
      const text = data.toString();
      console.log('[Claude CLI stderr]', text.trim());
    });

    this.process.on('exit', (code, signal) => {
      console.log('[Claude CLI] Process exited:', { code, signal });
      this.callbacks.onExit(code);
    });

    this.process.on('error', (err) => {
      console.error('[Claude CLI] Spawn error:', err.message);
      this.callbacks.onError({
        sessionId: this.sessionId,
        error: `Failed to start Claude CLI: ${err.message}`
      });
    });
  }

  processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed);
        console.log('[Claude CLI] Received event:', event.type);
        this.handleStreamEvent(event);
      } catch (err) {
        // Non-JSON line (PTY stderr mixed in) — ignore
      }
    }
  }

  handleStreamEvent(event) {
    switch (event.type) {
      case 'system':
        if (event.session_id) {
          this.claudeSessionId = event.session_id;
          this.callbacks.onSystemInfo?.({
            sessionId: this.sessionId,
            claudeSessionId: event.session_id
          });
        }
        break;

      case 'assistant':
        if (event.message && event.message.content) {
          const contentArray = Array.isArray(event.message.content)
            ? event.message.content
            : [event.message.content];

          if (this.isReplayingHistory) {
            if (this.replayTimer) { clearTimeout(this.replayTimer); this.replayTimer = null; }
            const texts = [];
            for (const block of contentArray) {
              if (block.type === 'text' && block.text) {
                texts.push(block.text);
              } else if (block.type === 'tool_use') {
                this.historyMessages.push({
                  role: 'assistant', type: 'tool_use',
                  toolUseId: block.id, toolName: block.name,
                  toolInput: block.input, status: 'complete'
                });
              } else if (block.type === 'thinking' && block.thinking) {
                this.historyMessages.push({
                  role: 'assistant', type: 'thinking',
                  thinking: block.thinking
                });
              }
            }
            if (texts.length > 0) {
              this.historyMessages.push({ role: 'assistant', type: 'text', text: texts.join('') });
            }
          } else if (!this.hasStreamedContent) {
            // Only process assistant event content if no streaming events were received
            // (streaming events already forwarded text/tool_use/thinking in correct order)
            for (const block of contentArray) {
              if (block.type === 'tool_use') {
                this.callbacks.onToolUse?.({
                  sessionId: this.sessionId,
                  toolUseId: block.id,
                  toolName: block.name,
                  toolInput: block.input,
                  status: 'running'
                });
              } else if (block.type === 'text' && block.text) {
                this.callbacks.onChunk({
                  sessionId: this.sessionId,
                  text: block.text
                });
              } else if (block.type === 'thinking' && block.thinking) {
                this.callbacks.onThinking?.({
                  sessionId: this.sessionId,
                  thinking: block.thinking,
                  isPartial: false
                });
              }
            }
          }
        }
        break;

      case 'result':
        console.log('[Claude CLI] result event:', {
          stop_reason: event?.stop_reason,
          cost: event?.total_cost_usd,
          usage: event?.usage
        });
        if (this.isReplayingHistory) {
          if (this.callbacks.onHistory && this.historyMessages.length > 0) {
            this.callbacks.onHistory({
              sessionId: this.sessionId,
              messages: [...this.historyMessages]
            });
          }
          if (this.replayTimer) clearTimeout(this.replayTimer);
          this.replayTimer = setTimeout(() => this.finalizeReplay(), 500);
        } else {
          // Commit streaming text first, then show cost badge
          this.callbacks.onComplete({ sessionId: this.sessionId });
          this.callbacks.onTurnComplete?.({
            sessionId: this.sessionId,
            costUsd: event.total_cost_usd,
            usage: event.usage,
            durationMs: event.duration_ms,
            numTurns: event.num_turns
          });
        }
        break;

      case 'error':
        console.log('[Claude CLI] error event:', event);
        this.callbacks.onError({
          sessionId: this.sessionId,
          error: event.error?.message || event.message || 'Unknown error'
        });
        break;

      case 'message_start':
        this.currentContentBlock = null;
        this.hasStreamedContent = false;
        break;

      case 'content_block_start':
        this.hasStreamedContent = true;
        if (event.content_block?.type === 'tool_use') {
          this.currentContentBlock = {
            type: 'tool_use',
            id: event.content_block.id,
            name: event.content_block.name,
            inputJson: ''
          };
          // Forward tool_use start immediately (shows spinner in UI)
          this.callbacks.onToolUse?.({
            sessionId: this.sessionId,
            toolUseId: event.content_block.id,
            toolName: event.content_block.name,
            toolInput: null,
            status: 'running'
          });
        } else if (event.content_block?.type === 'thinking') {
          this.currentContentBlock = { type: 'thinking', text: '' };
        }
        break;

      case 'content_block_delta':
        if (this.isReplayingHistory) {
          this.finalizeReplay();
        }
        if (event.delta?.type === 'text_delta') {
          this.callbacks.onChunk({
            sessionId: this.sessionId,
            text: event.delta.text
          });
        } else if (event.delta?.type === 'input_json_delta' && this.currentContentBlock?.type === 'tool_use') {
          this.currentContentBlock.inputJson += event.delta.partial_json;
        } else if (event.delta?.type === 'thinking_delta' && this.currentContentBlock?.type === 'thinking') {
          this.currentContentBlock.text += event.delta.thinking;
          this.callbacks.onThinking?.({
            sessionId: this.sessionId,
            thinking: event.delta.thinking,
            isPartial: true
          });
        }
        break;

      case 'content_block_stop':
        if (this.currentContentBlock?.type === 'tool_use') {
          let parsedInput = null;
          try { parsedInput = JSON.parse(this.currentContentBlock.inputJson); } catch {}
          // Update tool_use with parsed input
          this.callbacks.onToolUse?.({
            sessionId: this.sessionId,
            toolUseId: this.currentContentBlock.id,
            toolName: this.currentContentBlock.name,
            toolInput: parsedInput,
            status: 'running'
          });
          this.currentContentBlock = null;
        } else if (this.currentContentBlock?.type === 'thinking') {
          this.callbacks.onThinking?.({
            sessionId: this.sessionId,
            thinking: this.currentContentBlock.text,
            isPartial: false
          });
          this.currentContentBlock = null;
        }
        break;

      case 'message_stop':
        console.log('[Claude CLI] message_stop event');
        if (!this.isReplayingHistory) {
          this.callbacks.onComplete({ sessionId: this.sessionId });
        }
        break;

      case 'user':
        if (event.message && event.message.content) {
          const content = event.message.content;

          // Forward tool_result blocks (tool results come as user messages)
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_result') {
                this.callbacks.onToolResult?.({
                  sessionId: this.sessionId,
                  toolUseId: block.tool_use_id,
                  result: block.content,
                  isError: block.is_error || false
                });
              }
            }
          }

          if (this.isReplayingHistory) {
            if (this.replayTimer) { clearTimeout(this.replayTimer); this.replayTimer = null; }
            let text = '';
            if (typeof content === 'string') {
              text = content;
            } else if (Array.isArray(content)) {
              // Collect tool_result blocks for history too
              for (const block of content) {
                if (block.type === 'tool_result') {
                  this.historyMessages.push({
                    role: 'tool', type: 'tool_result',
                    toolUseId: block.tool_use_id,
                    result: block.content,
                    isError: block.is_error || false
                  });
                }
              }
              text = content
                .filter(block => block.type === 'text' && block.text)
                .map(block => block.text)
                .join('');
            }
            if (text) {
              this.historyMessages.push({ role: 'user', type: 'text', text });
            }
          }
        }
        break;

      default:
        break;
    }
  }

  finalizeReplay() {
    if (!this.isReplayingHistory) return;
    if (this.replayTimer) {
      clearTimeout(this.replayTimer);
      this.replayTimer = null;
    }
    this.isReplayingHistory = false;
    console.log(`[Claude CLI] Replay finalized with ${this.historyMessages.length} messages`);
    if (this.callbacks.onHistory && this.historyMessages.length > 0) {
      this.callbacks.onHistory({
        sessionId: this.sessionId,
        messages: [...this.historyMessages]
      });
    }
    this.historyMessages = [];
  }

  sendMessage(message) {
    if (this.isReplayingHistory) {
      this.finalizeReplay();
    }
    if (this.process && this.process.stdin.writable) {
      const messageObj = {
        type: 'user',
        message: {
          role: 'user',
          content: message
        }
      };
      this.process.stdin.write(JSON.stringify(messageObj) + '\n');
    }
  }

  stop() {
    if (this.replayTimer) {
      clearTimeout(this.replayTimer);
      this.replayTimer = null;
    }

    if (this.process) {
      try {
        // Kill the entire process group to clean up child processes (MCP servers)
        process.kill(-this.process.pid, 'SIGTERM');
      } catch {
        try { this.process.kill('SIGTERM'); } catch {}
      }
      this.process = null;
    }

    if (this.mcpConfigPath) {
      const configPath = this.mcpConfigPath;
      this.mcpConfigPath = null;
      setTimeout(() => {
        try {
          if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
        } catch {}
      }, 5000);
    }
  }
}

module.exports = ClaudeProcess;
module.exports.getClaudePath = getClaudePath;
