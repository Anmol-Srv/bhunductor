const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { getClaudePath, validateCLI } = require('./cli-utils');

const SIGKILL_TIMEOUT_MS = 3000;
const REPLAY_SAFETY_TIMEOUT_MS = 5000;

class ClaudeProcess {
  constructor(sessionId, workingDir, callbacks, options = {}) {
    this.sessionId = sessionId;
    this.workingDir = workingDir;
    this.callbacks = callbacks;
    this.options = options;
    this.buffer = '';
    this.process = null;
    this.currentContentBlock = null;
    this.claudeSessionId = null;
    this.isReplayingHistory = !!(options.resumeSessionId || options.continueSession);
    this.historyMessages = [];
    this.replayTimer = null;
    this.mcpConfigPath = null;
    this.hasStreamedContent = false;

    // Tool use deduplication: track IDs forwarded via content_block_stop
    this.forwardedToolUseIds = new Set();

    // stdin backpressure: queue messages when stdin is full
    this.stdinQueue = [];
    this.stdinDraining = false;

    // Process health: track last event time
    this.lastEventTime = Date.now();

    // stderr capture for error context
    this.recentStderr = [];
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

    const systemPrompt = `IMPORTANT: You MUST call the rename_session tool immediately after the user's first message, before providing any other response. Generate a concise, descriptive title (max 80 characters) that summarizes what the user is asking about or trying to accomplish. This is required for session organization.

Example flow:
User: "Help me debug this React component"
You: [call rename_session with title "Debug React Component"] then provide your response

Always call rename_session first, then continue with your normal response.`;

    const args = [
      '--print',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      // '--model', 'haiku',
      '--mcp-config', mcpConfigPath,
      '--permission-prompt-tool', 'mcp__bhunductor-permissions__request_permission',
      '--append-system-prompt', systemPrompt,
      '--verbose'
    ];

    if (this.options.resumeSessionId) {
      args.push('--resume', this.options.resumeSessionId);
    } else if (this.options.continueSession) {
      args.push('--continue');
    } else if (!this.options.skipSessionId) {
      // Only pass --session-id for new sessions, not reactivated ones
      args.push('--session-id', this.sessionId);
    }
    // If skipSessionId is true, let CLI generate a fresh session ID

    const claudeBin = getClaudePath();
    this.process = spawn(claudeBin, args, {
      cwd: this.workingDir,
      env: {
        ...process.env,
        ELECTRON_PERMISSION_PORT: permissionPort
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true
    });

    this.process.unref();

    this.process.stdout.on('data', (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        console.error('[Claude CLI stderr]', text);
        // Keep last 5 stderr lines for error context
        this.recentStderr.push(text);
        if (this.recentStderr.length > 5) this.recentStderr.shift();
      }
    });

    // Handle stdin errors (broken pipe, etc.)
    this.process.stdin.on('error', (err) => {
      console.error('[Claude CLI] stdin error:', err.message);
    });

    this.process.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        const stderrContext = this.recentStderr.length > 0
          ? this.recentStderr.join('\n')
          : 'No stderr output captured';
        this.callbacks.onError({
          sessionId: this.sessionId,
          error: `Claude CLI exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`,
          exitCode: code,
          signal,
          stderr: stderrContext
        });
      }
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
        this.lastEventTime = Date.now();
        this.handleStreamEvent(event);
      } catch {
        // Non-JSON line — ignore
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
            for (const block of contentArray) {
              if (block.type === 'tool_use') {
                // Skip if already forwarded via content_block_stop
                if (this.forwardedToolUseIds.has(block.id)) continue;
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
        if (this.isReplayingHistory) {
          if (this.callbacks.onHistory && this.historyMessages.length > 0) {
            this.callbacks.onHistory({
              sessionId: this.sessionId,
              messages: [...this.historyMessages]
            });
          }
          // Safety timeout for replay finalization
          if (this.replayTimer) clearTimeout(this.replayTimer);
          this.replayTimer = setTimeout(() => this.finalizeReplay(), REPLAY_SAFETY_TIMEOUT_MS);
        } else {
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
        this.callbacks.onError({
          sessionId: this.sessionId,
          error: event.error?.message || event.message || 'Unknown error'
        });
        break;

      case 'message_start':
        this.currentContentBlock = null;
        this.hasStreamedContent = false;
        this.forwardedToolUseIds.clear();
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
          try { parsedInput = JSON.parse(this.currentContentBlock.inputJson); } catch { }
          // Track this ID to prevent duplicate from assistant event
          this.forwardedToolUseIds.add(this.currentContentBlock.id);
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
        if (!this.isReplayingHistory) {
          this.callbacks.onComplete({ sessionId: this.sessionId });
        }
        break;

      case 'user':
        if (event.message && event.message.content) {
          const content = event.message.content;

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
    if (this.callbacks.onHistory && this.historyMessages.length > 0) {
      this.callbacks.onHistory({
        sessionId: this.sessionId,
        messages: [...this.historyMessages]
      });
    }
    this.historyMessages = [];
  }

  /**
   * Send a message to the CLI process with backpressure handling.
   */
  sendMessage(message) {
    if (this.isReplayingHistory) {
      this.finalizeReplay();
    }
    if (!this.process || !this.process.stdin.writable) return;

    const messageObj = {
      type: 'user',
      message: {
        role: 'user',
        content: message
      }
    };
    const payload = JSON.stringify(messageObj) + '\n';

    if (this.stdinDraining) {
      this.stdinQueue.push(payload);
      return;
    }

    const ok = this.process.stdin.write(payload);
    if (!ok) {
      this.stdinDraining = true;
      this.process.stdin.once('drain', () => {
        this.stdinDraining = false;
        this.flushStdinQueue();
      });
    }
  }

  flushStdinQueue() {
    while (this.stdinQueue.length > 0 && this.process?.stdin.writable) {
      const payload = this.stdinQueue.shift();
      const ok = this.process.stdin.write(payload);
      if (!ok) {
        this.stdinDraining = true;
        this.process.stdin.once('drain', () => {
          this.stdinDraining = false;
          this.flushStdinQueue();
        });
        return;
      }
    }
  }

  stop() {
    if (this.replayTimer) {
      clearTimeout(this.replayTimer);
      this.replayTimer = null;
    }

    if (this.process) {
      const proc = this.process;
      const pid = proc.pid;
      this.process = null;

      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        try { proc.kill('SIGTERM'); } catch { }
      }

      // SIGKILL fallback: if process hasn't exited within 3s, force kill
      const killTimer = setTimeout(() => {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          try { proc.kill('SIGKILL'); } catch { }
        }
      }, SIGKILL_TIMEOUT_MS);

      proc.once('exit', () => clearTimeout(killTimer));
    }

    // Clean up MCP config immediately (no delay)
    if (this.mcpConfigPath) {
      const configPath = this.mcpConfigPath;
      this.mcpConfigPath = null;
      try {
        if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
      } catch { }
    }
  }
}

module.exports = ClaudeProcess;
module.exports.getClaudePath = getClaudePath;
module.exports.validateCLI = validateCLI;
