const { getClaudePath } = require('./cli-utils');
const { createBhunductorMcpServer } = require('../mcp/sdk-mcp-server');

// Lazy-loaded SDK (ESM-only module, can't use require in CommonJS)
let _sdk = null;
async function loadSDK() {
  if (!_sdk) {
    _sdk = await import('@anthropic-ai/claude-agent-sdk');
  }
  return _sdk;
}

const SYSTEM_PROMPT_APPEND = `IMPORTANT: You MUST call the rename_session tool immediately after the user's first message, before providing any other response. Generate a concise, descriptive title (max 80 characters) that summarizes what the user is asking about or trying to accomplish. This is required for session organization.

Example flow:
User: "Help me debug this React component"
You: [call rename_session with title "Debug React Component"] then provide your response

Always call rename_session first, then continue with your normal response.`;

/**
 * SDKSession wraps the Claude Agent SDK query() call and translates
 * SDK messages to the existing callback interface used by SessionService.
 *
 * Each user message = one query() call. The SDK spawns a CLI process per turn,
 * handles the full agentic loop (tool use cycles), then completes.
 * Multi-turn conversations use resume: claudeSessionId.
 */
class SDKSession {
  constructor(sessionId, workingDir, callbacks, options = {}) {
    this.sessionId = sessionId;
    this.workingDir = workingDir;
    this.callbacks = callbacks;
    this.options = options;

    this.claudeSessionId = options.claudeSessionId || null;
    this.abortController = null;
    this.isRunning = false;

    // Streaming state (same as ClaudeProcess for dedup)
    this.hasStreamedContent = false;
    this.forwardedToolUseIds = new Set();
    this.currentContentBlock = null;

    // Replay detection: when resuming, skip replayed history messages
    // (renderer already has them from historyBuffer/DB)
    this.isResuming = false;

    // Lazy-initialized MCP server (created on first query)
    this.mcpServer = null;
  }

  /**
   * Ensure the in-process MCP server is created (lazy init via async import).
   */
  async _ensureMcpServer() {
    if (!this.mcpServer) {
      this.mcpServer = await createBhunductorMcpServer((title) => {
        this.callbacks.onRename?.(this.sessionId, title);
      });
    }
    return this.mcpServer;
  }

  /**
   * Build canUseTool callback that routes permission requests to the renderer.
   * The permissionHandler is provided by SessionService.
   */
  _buildCanUseTool() {
    const permissionHandler = this.options.permissionHandler;
    if (!permissionHandler) return undefined;

    return async (toolName, input, { signal }) => {
      // Auto-approve rename_session (hidden from UI)
      if (toolName === 'rename_session' ||
          toolName === 'mcp__bhunductor__rename_session') {
        return { behavior: 'allow', updatedInput: input };
      }

      // Request permission from user via IPC
      return permissionHandler(this.sessionId, toolName, input, signal);
    };
  }

  /**
   * Run a query for a single user message.
   * The SDK handles the full agentic loop internally.
   */
  async runQuery(prompt) {
    if (this.isRunning) {
      console.warn('[SDKSession] Query already running for session', this.sessionId);
      return;
    }

    this.isRunning = true;
    this.abortController = new AbortController();

    // Reset streaming state for each new turn
    this.hasStreamedContent = false;
    this.forwardedToolUseIds.clear();
    this.currentContentBlock = null;
    this.isResuming = false;

    // Lazy-load SDK and MCP server
    const sdk = await loadSDK();
    const mcpServer = await this._ensureMcpServer();
    const canUseTool = this._buildCanUseTool();

    const queryOptions = {
      cwd: this.workingDir,
      includePartialMessages: true,
      settingSources: ['project', 'user'],
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: SYSTEM_PROMPT_APPEND
      },
      mcpServers: {
        bhunductor: mcpServer
      },
      abortController: this.abortController,
      pathToClaudeCodeExecutable: getClaudePath()
    };

    if (this.options.model) {
      queryOptions.model = this.options.model;
    }

    if (this.claudeSessionId) {
      queryOptions.resume = this.claudeSessionId;
      this.isResuming = true;
    }

    if (canUseTool) {
      queryOptions.canUseTool = canUseTool;
    }

    try {
      const conversation = sdk.query({ prompt, options: queryOptions });

      for await (const message of conversation) {
        if (!this.isRunning) break; // Aborted

        this._handleMessage(message);
      }

      // Normal completion — session stays alive for more messages.
      // Don't call onExit; that's only for when the session is removed.
      this.isRunning = false;
    } catch (err) {
      this.isRunning = false;

      if ((sdk.AbortError && err instanceof sdk.AbortError) || err.name === 'AbortError') {
        // User-initiated stop — stopSession() already handled cleanup.
        // Don't call onExit to avoid double-cleanup.
      } else {
        console.error('[SDKSession] Query error:', err.message);
        this.callbacks.onError({
          sessionId: this.sessionId,
          error: err.message || 'Unknown SDK error'
        });
        // Fatal error — signal session failure so it gets cleaned up
        this.callbacks.onExit(1);
      }
    }
  }

  /**
   * Handle a single SDK message and translate to callbacks.
   *
   * During resume, the SDK replays historical messages (SDKUserMessageReplay,
   * SDKAssistantMessage for old turns). These are skipped because the renderer
   * already has them from historyBuffer/DB. The first stream_event marks the
   * start of the new response and ends the replay phase.
   */
  _handleMessage(message) {
    // Always process system messages (session_id capture)
    if (message.type === 'system') {
      this._handleSystemMessage(message);
      return;
    }

    // During resume: skip replayed history, wait for first stream_event
    if (this.isResuming) {
      if (message.type === 'stream_event') {
        // First stream_event = start of new response, end replay phase
        this.isResuming = false;
        this._handleStreamEvent(message);
      }
      // Skip replayed user, assistant, and result messages
      return;
    }

    switch (message.type) {
      case 'stream_event':
        this._handleStreamEvent(message);
        break;

      case 'assistant':
        this._handleAssistantMessage(message);
        break;

      case 'user':
        this._handleUserMessage(message);
        break;

      case 'result':
        this._handleResultMessage(message);
        break;

      default:
        break;
    }
  }

  /**
   * SDKSystemMessage — extract session_id on init.
   */
  _handleSystemMessage(message) {
    if (message.subtype === 'init' && message.session_id) {
      this.claudeSessionId = message.session_id;
      this.callbacks.onSystemInfo?.({
        sessionId: this.sessionId,
        claudeSessionId: message.session_id
      });
    }
  }

  /**
   * SDKPartialAssistantMessage — streaming events.
   * The event field contains RawMessageStreamEvent (same types as current NDJSON).
   */
  _handleStreamEvent(message) {
    const event = message.event;
    if (!event) return;

    switch (event.type) {
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
        this.callbacks.onComplete({ sessionId: this.sessionId });
        break;

      default:
        break;
    }
  }

  /**
   * SDKAssistantMessage — complete message (fallback if no streaming).
   * Same dedup logic as ClaudeProcess: skip if hasStreamedContent.
   */
  _handleAssistantMessage(message) {
    if (!message.message?.content) return;

    const contentArray = Array.isArray(message.message.content)
      ? message.message.content
      : [message.message.content];

    if (!this.hasStreamedContent) {
      for (const block of contentArray) {
        if (block.type === 'tool_use') {
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

  /**
   * SDKUserMessage — contains tool_result blocks (tool execution results).
   */
  _handleUserMessage(message) {
    if (!message.message?.content) return;
    const content = message.message.content;

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
  }

  /**
   * SDKResultMessage — final result with cost/usage data.
   */
  _handleResultMessage(message) {
    if (message.subtype === 'success') {
      this.callbacks.onComplete({ sessionId: this.sessionId });
      this.callbacks.onTurnComplete?.({
        sessionId: this.sessionId,
        costUsd: message.total_cost_usd,
        usage: message.usage,
        durationMs: message.duration_ms,
        numTurns: message.num_turns
      });
    } else {
      // Error subtypes: error_during_execution, error_max_turns, error_max_budget_usd
      const errorMsg = message.errors?.join('; ') || `Query ended with: ${message.subtype}`;
      this.callbacks.onError({
        sessionId: this.sessionId,
        error: errorMsg
      });
      this.callbacks.onTurnComplete?.({
        sessionId: this.sessionId,
        costUsd: message.total_cost_usd,
        usage: message.usage,
        durationMs: message.duration_ms,
        numTurns: message.num_turns
      });
    }
  }

  /**
   * Stop the current query. Uses AbortController to signal the SDK.
   */
  stop() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isRunning = false;
  }
}

module.exports = SDKSession;
