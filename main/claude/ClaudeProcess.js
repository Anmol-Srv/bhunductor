const { spawn } = require('child_process');
const path = require('path');

class ClaudeProcess {
  constructor(sessionId, workingDir, callbacks) {
    this.sessionId = sessionId;
    this.workingDir = workingDir;
    this.callbacks = callbacks; // { onChunk, onComplete, onPermissionRequest, onError, onExit }
    this.buffer = '';
    this.process = null;
    this.currentContentBlock = null; // Track current content block for tool usage
  }

  start() {
    // Spawn: claude --print --input-format stream-json --output-format stream-json
    // Note: --output-format and --input-format only work with --print mode
    // Use delegate permission mode to allow programmatic permission handling
    // --verbose is required when using stream-json output format
    this.process = spawn('claude', [
      '--print',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--permission-mode', 'delegate',
      '--verbose'
    ], {
      cwd: this.workingDir, // Set working directory via spawn options
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Parse stdout (NDJSON streaming)
    this.process.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    // Handle errors
    this.process.stderr.on('data', (data) => {
      const errorMsg = data.toString();
      console.error('[Claude CLI stderr]:', errorMsg);

      // Send error to renderer
      this.callbacks.onError({
        sessionId: this.sessionId,
        error: errorMsg
      });
    });

    // Handle process errors
    this.process.on('error', (err) => {
      console.error('[Claude CLI] Process error:', err);
      this.callbacks.onError({
        sessionId: this.sessionId,
        error: `Failed to start Claude CLI: ${err.message}`
      });
    });

    // Handle exit
    this.process.on('exit', (code) => {
      console.log(`[Claude CLI] Process exited with code ${code}`);
      this.callbacks.onExit(code);
    });

    console.log(`[Claude CLI] Started for session ${this.sessionId} in ${this.workingDir}`);
  }

  processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop(); // Keep incomplete line

    for (const line of lines) {
      if (line.trim()) {
        try {
          const event = JSON.parse(line);
          console.log('[Claude CLI] Received event:', event.type, JSON.stringify(event, null, 2));
          this.handleStreamEvent(event);
        } catch (err) {
          console.error('[Claude CLI] Failed to parse JSON:', err);
          console.error('[Claude CLI] Line was:', line);
        }
      }
    }
  }

  handleStreamEvent(event) {
    // Handle different event types from Claude CLI stream-json format
    switch (event.type) {
      case 'system':
        // System message (usually at start)
        console.log('[Claude CLI] System message:', event.message);
        break;

      case 'assistant':
        // Assistant's response - send as chunks
        if (event.message && event.message.content) {
          // For non-streaming, send the whole message at once
          const content = Array.isArray(event.message.content)
            ? event.message.content.map(c => c.text || '').join('')
            : event.message.content;

          this.callbacks.onChunk({
            sessionId: this.sessionId,
            text: content
          });
        }
        break;

      case 'result':
        // Message complete
        this.callbacks.onComplete({
          sessionId: this.sessionId
        });
        break;

      case 'error':
        this.callbacks.onError({
          sessionId: this.sessionId,
          error: event.error?.message || event.message || 'Unknown error'
        });
        break;

      // Keep Anthropic API streaming event types for compatibility
      case 'message_start':
        this.currentContentBlock = null;
        break;

      case 'content_block_start':
        if (event.content_block?.type === 'tool_use') {
          this.currentContentBlock = {
            type: 'tool_use',
            id: event.content_block.id,
            name: event.content_block.name,
            inputJson: ''
          };
        }
        break;

      case 'content_block_delta':
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
          try {
            const input = JSON.parse(this.currentContentBlock.inputJson);
            this.callbacks.onPermissionRequest({
              sessionId: this.sessionId,
              tool: this.currentContentBlock.name,
              input: input
            });
          } catch (err) {
            console.error('[Claude CLI] Failed to parse tool input:', err);
          }
          this.currentContentBlock = null;
        }
        break;

      case 'message_stop':
        this.callbacks.onComplete({
          sessionId: this.sessionId
        });
        break;

      default:
        console.log('[Claude CLI] Unknown event type:', event.type);
        break;
    }
  }

  sendMessage(message) {
    if (this.process && this.process.stdin.writable) {
      // Send message in stream-json format as JSON
      // Format: { type: 'user', message: { role: 'user', content: '...' } }
      const messageObj = {
        type: 'user',
        message: {
          role: 'user',
          content: message
        }
      };
      this.process.stdin.write(JSON.stringify(messageObj) + '\n');
      console.log('[Claude CLI] Sent message:', messageObj);
    }
  }

  sendPermissionResponse(approved) {
    if (this.process && this.process.stdin.writable) {
      this.process.stdin.write(JSON.stringify({
        type: 'permission_response',
        approved
      }) + '\n');
    }
  }

  stop() {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }
}

module.exports = ClaudeProcess;
