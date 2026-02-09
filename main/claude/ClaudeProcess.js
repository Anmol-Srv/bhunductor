const { spawn } = require('child_process');
const path = require('path');

class ClaudeProcess {
  constructor(sessionId, workingDir, callbacks, options = {}) {
    this.sessionId = sessionId;
    this.workingDir = workingDir;
    this.callbacks = callbacks; // { onChunk, onComplete, onError, onExit, onSystemInfo, onHistory }
    this.options = options; // { resumeSessionId, continueSession }
    this.buffer = '';
    this.process = null;
    this.currentContentBlock = null; // Track current content block for tool usage
    this.claudeSessionId = null;
    this.isReplayingHistory = !!(options.resumeSessionId || options.continueSession);
    this.historyMessages = [];
    this.replayTimer = null; // Debounce timer for end-of-replay detection
  }

  start() {
    // Spawn: claude --print --input-format stream-json --output-format stream-json
    // Note: --output-format and --input-format only work with --print mode
    // Using MCP server for permission handling via --permission-prompt-tool
    // The MCP server communicates with Electron app via HTTP to show permission UI
    // --verbose is required when using stream-json output format
    const path = require('path');
    const fs = require('fs');
    const os = require('os');

    const permissionServerPath = path.join(__dirname, '../mcp/permission-server.js');

    const mcpConfig = {
      mcpServers: {
        'bhunductor-permissions': {
          command: 'node',
          args: [permissionServerPath],
          env: {
            ELECTRON_PERMISSION_PORT: '58472',
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
      '--mcp-config', mcpConfigPath,
      '--permission-prompt-tool', 'mcp__bhunductor-permissions__request_permission',
      '--verbose'
    ];

    if (this.options.resumeSessionId) {
      args.push('--resume', this.options.resumeSessionId);
    } else if (this.options.continueSession) {
      args.push('--continue');
    }

    this.process = spawn('claude', args, {
      cwd: this.workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_PERMISSION_PORT: '58472'
      }
    });

    this.process.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.process.stderr.on('data', (data) => {
      const errorMsg = data.toString();
      console.log('[Claude CLI] stderr:', errorMsg.trim());
      this.callbacks.onError({
        sessionId: this.sessionId,
        error: errorMsg
      });
    });

    this.process.on('error', (err) => {
      this.callbacks.onError({
        sessionId: this.sessionId,
        error: `Failed to start Claude CLI: ${err.message}`
      });
    });

    this.process.on('exit', (code) => {
      console.log('[Claude CLI] process exited with code:', code);
      this.callbacks.onExit(code);
    });
  }

  processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop();

    for (const line of lines) {
      if (line.trim()) {
        try {
          const event = JSON.parse(line);
          if (event?.type === 'assistant' && event?.message?.content) {
            const toolUse = event.message.content.find?.(item => item?.type === 'tool_use');
            if (toolUse) {
              console.log('[Claude CLI] Requested tool permission:', JSON.stringify(toolUse, null, 2));
            }
          }
          console.log('[Claude CLI] Received event:', event.type);
          this.handleStreamEvent(event);
        } catch (err) {
        }
      }
    }
  }

  handleStreamEvent(event) {
    switch (event.type) {
      case 'system':
        if (event.session_id) {
          this.claudeSessionId = event.session_id;
          if (this.callbacks.onSystemInfo) {
            this.callbacks.onSystemInfo({
              sessionId: this.sessionId,
              claudeSessionId: event.session_id
            });
          }
        }
        break;

      case 'assistant':
        if (event.message && event.message.content) {
          const contentArray = Array.isArray(event.message.content)
            ? event.message.content
            : [event.message.content];

          if (this.isReplayingHistory) {
            // Cancel debounce timer — more replay events are still arriving
            if (this.replayTimer) { clearTimeout(this.replayTimer); this.replayTimer = null; }
            // Collect assistant text for history replay
            const texts = [];
            for (const contentBlock of contentArray) {
              if (contentBlock.type === 'text' && contentBlock.text) {
                texts.push(contentBlock.text);
              }
            }
            if (texts.length > 0) {
              this.historyMessages.push({ role: 'assistant', text: texts.join('') });
            }
          } else {
            for (const contentBlock of contentArray) {
              if (contentBlock.type === 'tool_use') {
                console.log('[Claude CLI] assistant tool_use content block:', {
                  id: contentBlock.id,
                  name: contentBlock.name,
                  input: contentBlock.input
                });
              } else if (contentBlock.type === 'text' && contentBlock.text) {
                this.callbacks.onChunk({
                  sessionId: this.sessionId,
                  text: contentBlock.text
                });
              }
            }
          }
        }
        break;

      case 'result':
        console.log('[Claude CLI] result event:', {
          stop_reason: event?.stop_reason,
          stop_sequence: event?.stop_sequence,
          output_tokens: event?.output_tokens
        });
        if (this.isReplayingHistory) {
          // Emit progressive history update (don't end replay — more turns may follow)
          if (this.callbacks.onHistory && this.historyMessages.length > 0) {
            this.callbacks.onHistory({
              sessionId: this.sessionId,
              messages: [...this.historyMessages]
            });
          }
          // Debounce: if no more replay events arrive within 500ms, finalize
          if (this.replayTimer) clearTimeout(this.replayTimer);
          this.replayTimer = setTimeout(() => this.finalizeReplay(), 500);
        } else {
          this.callbacks.onComplete({
            sessionId: this.sessionId
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
        break;

      case 'content_block_start':
        if (event.content_block?.type === 'tool_use') {
          console.log('[Claude CLI] content_block_start tool_use:', {
            id: event.content_block.id,
            name: event.content_block.name
          });
          this.currentContentBlock = {
            type: 'tool_use',
            id: event.content_block.id,
            name: event.content_block.name,
            inputJson: ''
          };
        }
        break;

      case 'content_block_delta':
        // content_block_delta only occurs during live streaming, never during replay
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
        }
        break;

      case 'content_block_stop':
        if (this.currentContentBlock?.type === 'tool_use') {
          console.log('[Claude CLI] content_block_stop tool_use:', {
            id: this.currentContentBlock.id,
            name: this.currentContentBlock.name,
            inputJson: this.currentContentBlock.inputJson
          });
          this.currentContentBlock = null;
        }
        break;

      case 'message_stop':
        console.log('[Claude CLI] message_stop event');
        if (!this.isReplayingHistory) {
          this.callbacks.onComplete({
            sessionId: this.sessionId
          });
        }
        break;

      case 'user':
        if (event.message && event.message.content) {
          console.log('[Claude CLI] user event content:', event.message.content);
          if (this.isReplayingHistory) {
            // Cancel debounce timer — more replay events are still arriving
            if (this.replayTimer) { clearTimeout(this.replayTimer); this.replayTimer = null; }
            const content = event.message.content;
            let text = '';
            if (typeof content === 'string') {
              text = content;
            } else if (Array.isArray(content)) {
              text = content
                .filter(block => block.type === 'text' && block.text)
                .map(block => block.text)
                .join('');
            }
            if (text) {
              this.historyMessages.push({ role: 'user', text });
            }
          }
        }
        break;

      default:
        break;
    }
  }

  /**
   * End history replay mode and emit final collected history
   */
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
    // If still in replay mode when user sends a message, finalize first
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
      this.process.kill('SIGTERM');
      this.process = null;
    }

    if (this.mcpConfigPath) {
      try {
        const fs = require('fs');
        if (fs.existsSync(this.mcpConfigPath)) {
          fs.unlinkSync(this.mcpConfigPath);
        }
      } catch (error) {
      }
      this.mcpConfigPath = null;
    }
  }
}

module.exports = ClaudeProcess;
