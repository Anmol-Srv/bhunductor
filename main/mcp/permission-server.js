#!/usr/bin/env node

/**
 * MCP Permission Server
 *
 * This MCP server provides a permission prompt tool that communicates
 * with the Electron app to handle permission requests from Claude CLI.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
// Configuration - port where Electron app listens for permission requests
const ELECTRON_PORT = process.env.ELECTRON_PERMISSION_PORT || 58472;
const SESSION_ID = process.env.SESSION_ID;

class PermissionMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'bhunductor-permission-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'request_permission',
            description: 'Request permission from the user to execute a tool',
            inputSchema: {
              type: 'object',
              properties: {
                tool_name: {
                  type: 'string',
                  description: 'The name of the tool requesting permission',
                },
                input: {
                  type: 'object',
                  description: 'The input parameters for the tool like query for a search',
                },
                tool_use_id: {
                  type: 'string',
                  description: 'The unique ID for this tool use',
                },
              },
              required: ['tool_name', 'tool_use_id'],
            },
          },
          {
            name: 'rename_session',
            description: 'Rename the current chat session with a descriptive title based on the conversation context. Call this after the first user message to set an appropriate session name.',
            inputSchema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'A concise, descriptive title for the session (max 80 characters). Should summarize the main topic or purpose of the conversation.',
                },
              },
              required: ['title'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;

      // Handle rename_session tool
      if (toolName === 'rename_session') {
        const args = request.params.arguments || {};
        const { title } = args;

        console.error('[MCP Server] rename_session called with title:', title);

        if (!title || typeof title !== 'string') {
          console.error('[MCP Server] rename_session error: title missing or invalid');
          return {
            content: [{
              type: 'text',
              text: 'Error: title parameter is required and must be a string'
            }],
            isError: true
          };
        }

        try {
          await this.renameSession(title);
          console.error('[MCP Server] rename_session succeeded:', title);
          return {
            content: [{
              type: 'text',
              text: `Session renamed to: "${title}"`
            }]
          };
        } catch (error) {
          console.error('[MCP Server] rename_session failed:', error.message);
          return {
            content: [{
              type: 'text',
              text: `Failed to rename session: ${error.message}`
            }],
            isError: true
          };
        }
      }

      // Handle request_permission tool
      if (toolName !== 'request_permission') {
        throw new Error(`Unknown tool: ${toolName}`);
      }

      const args = request.params.arguments || {};
      console.error('[MCP Server] Received request_permission call with args:', JSON.stringify(args, null, 2));
      const { tool_name, input, tool_use_id } = args;

      try {
        const permissionData = {
          tool: tool_name,
          input: input,
          tool_use_id,
          session_id: SESSION_ID,
        };
        console.error('[MCP Server] Sending to Electron:', JSON.stringify(permissionData, null, 2));
        const permissionResponse = await this.requestPermissionFromElectron(permissionData);
        const approved =
          typeof permissionResponse === 'boolean'
            ? permissionResponse
            : Boolean(permissionResponse?.approved);
        const updatedInput =
          typeof permissionResponse === 'object'
            ? permissionResponse.updatedInput
            : undefined;
        const denyMessage =
          typeof permissionResponse === 'object'
            ? permissionResponse.message
            : undefined;

        if (approved) {
          // Build response - only include updatedInput if we have tool_input
          // If tool_input is undefined, omit updatedInput so Claude uses original input
          const response = { behavior: 'allow' };

          const finalInput = updatedInput !== undefined ? updatedInput : input;
          if (finalInput !== undefined) {
            response.updatedInput = finalInput;
          }

          const payload = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response),
              },
            ],
          };
          return payload;
        } else {
          const payload = {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  behavior: 'deny',
                  message: denyMessage || `User denied permission for ${tool_name}`,
                }),
              },
            ],
          };
          return payload;
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: true,
                message: `Failed to request permission: ${error.message}`,
              }),
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Request permission from Electron app via HTTP
   */
  async requestPermissionFromElectron(permissionData) {
    const url = `http://localhost:${ELECTRON_PORT}/permission-request`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(permissionData),
        signal: controller.signal
      });

      const response = await res.json();

      if (typeof response === 'boolean') {
        return { approved: response };
      }
      if (response && typeof response === 'object') {
        return response;
      }
      throw new Error('Invalid response payload from Electron');
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Permission request timed out');
      }
      throw new Error(`Failed to connect to Electron app: ${error.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Rename session via HTTP request to Electron app
   */
  async renameSession(title) {
    const url = `http://localhost:${ELECTRON_PORT}/rename-session`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: SESSION_ID, title }),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const response = await res.json();
      if (!response.success) {
        throw new Error(response.error || 'Failed to rename session');
      }

      return response;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Rename request timed out');
      }
      throw new Error(`Failed to rename session: ${error.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[MCP Server] Bhunductor permission server started');
    console.error('[MCP Server] Session ID:', SESSION_ID);
    console.error('[MCP Server] Electron port:', ELECTRON_PORT);
  }
}

const server = new PermissionMCPServer();
server.start().catch((error) => {
  console.error('[MCP Server] Failed to start:', error);
  process.exit(1);
});
