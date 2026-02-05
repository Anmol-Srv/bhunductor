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
    // Using MCP server for permission handling via --permission-prompt-tool
    // The MCP server communicates with Electron app via HTTP to show permission UI
    // --verbose is required when using stream-json output format
    const path = require('path');
    const fs = require('fs');
    const os = require('os');

    const permissionServerPath = path.join(__dirname, '../mcp/permission-server.js');

    // Create MCP config and write to temp file
    // Claude CLI expects a file path or JSON string, but file path is more reliable
    const mcpConfig = {
      mcpServers: {
        'bhunductor-permissions': {
          command: 'node',
          args: [permissionServerPath],
          env: {
            ELECTRON_PERMISSION_PORT: '58472'
          }
        }
      }
    };

    // Write to temp file
    const tempDir = os.tmpdir();
    const mcpConfigPath = path.join(tempDir, `bhunductor-mcp-${this.sessionId}.json`);
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    console.log(`[Claude CLI] MCP config written to: ${mcpConfigPath}`);

    this.mcpConfigPath = mcpConfigPath; // Store for cleanup

    this.process = spawn('claude', [
      '--print',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--mcp-config', mcpConfigPath,
      '--permission-prompt-tool', 'mcp__bhunductor-permissions__request_permission',
      '--verbose'
    ], {
      cwd: this.workingDir, // Set working directory via spawn options
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_PERMISSION_PORT: '58472'
      }
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
        // Assistant's response - check for tool use or text content
        if (event.message && event.message.content) {
          const contentArray = Array.isArray(event.message.content)
            ? event.message.content
            : [event.message.content];

          for (const contentBlock of contentArray) {
            if (contentBlock.type === 'tool_use') {
              // Tool use detected - request permission
              console.log('[Claude CLI] Tool use detected:', contentBlock.name);
              this.callbacks.onPermissionRequest({
                sessionId: this.sessionId,
                tool: contentBlock.name,
                input: contentBlock.input,
                toolUseId: contentBlock.id
              });
            } else if (contentBlock.type === 'text' && contentBlock.text) {
              // Text content - send as chunk
              this.callbacks.onChunk({
                sessionId: this.sessionId,
                text: contentBlock.text
              });
            }
          }
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
              input: input,
              toolUseId: this.currentContentBlock.id
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

      case 'user':
        // User event (can contain tool_result or other user messages)
        console.log('[Claude CLI] User event received:', JSON.stringify(event, null, 2));
        // This typically indicates tool execution result or error
        if (event.tool_use_result) {
          console.log('[Claude CLI] Tool execution result:', event.tool_use_result);
        }
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

  sendPermissionResponse(approved, toolUseId) {
    if (this.process && this.process.stdin.writable) {
      // Send permission response as a 'control' message type
      const response = {
        type: 'control',
        subtype: 'permission_response',
        tool_use_id: toolUseId,
        approved: approved
      };

      console.log('[Claude CLI] Sending permission response:', response);
      this.process.stdin.write(JSON.stringify(response) + '\n');
    }
  }

  stop() {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }

    // Cleanup temp MCP config file
    if (this.mcpConfigPath) {
      try {
        const fs = require('fs');
        if (fs.existsSync(this.mcpConfigPath)) {
          fs.unlinkSync(this.mcpConfigPath);
          console.log(`[Claude CLI] Cleaned up MCP config: ${this.mcpConfigPath}`);
        }
      } catch (error) {
        console.error(`[Claude CLI] Failed to cleanup MCP config: ${error.message}`);
      }
      this.mcpConfigPath = null;
    }
  }
}

module.exports = ClaudeProcess;
