const { z } = require('zod');

// Lazy-loaded SDK (ESM-only module, can't use require)
let _sdk = null;
async function loadSDK() {
  if (!_sdk) {
    _sdk = await import('@anthropic-ai/claude-agent-sdk');
  }
  return _sdk;
}

/**
 * Create an in-process MCP server for Bhunductor with the rename_session tool.
 * Replaces the external permission-server.js subprocess.
 *
 * Must be called with await (SDK is loaded lazily via dynamic import).
 *
 * @param {(title: string) => void} onRename - Callback when Claude renames the session
 * @returns {Promise<object>} SDK MCP server config ({ type: 'sdk', name, instance })
 */
async function createBhunductorMcpServer(onRename) {
  const { tool, createSdkMcpServer } = await loadSDK();

  const renameTool = tool(
    'rename_session',
    'Rename the current chat session with a descriptive title based on the conversation context. Call this after the first user message to set an appropriate session name.',
    {
      title: z.string().max(80).describe('A concise, descriptive title for the session (max 80 characters)')
    },
    async (args) => {
      try {
        onRename(args.title);
        return {
          content: [{ type: 'text', text: `Session renamed to: "${args.title}"` }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Failed to rename session: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  return createSdkMcpServer({
    name: 'bhunductor',
    version: '1.0.0',
    tools: [renameTool]
  });
}

module.exports = { createBhunductorMcpServer };
