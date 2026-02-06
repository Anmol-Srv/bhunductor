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
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'request_permission') {
        throw new Error(`Unknown tool: ${request.params.name}`);
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
        console.log('[MCP Server] Received response from Electron:', JSON.stringify(permissionResponse, null, 2));
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

        // Return format expected by Claude CLI --permission-prompt-tool
        console.log('[MCP Server] Permission decision:', {
          tool: tool_name,
          tool_use_id,
          approved,
          hasUpdatedInput: updatedInput !== undefined
        });

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
          console.log('[MCP Server] Returning allow payload to Claude CLI:', JSON.stringify(payload));
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
          console.log('[MCP Server] Returning deny payload to Claude CLI:', JSON.stringify(payload));
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

    console.log('[MCP Server in requestPermissionFromElectron] Sending to Electron:', JSON.stringify(permissionData, null, 2));

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(permissionData),
        signal: controller.signal
      });

      const response = await res.json();
      console.log('[MCP Server in requestPermissionFromElectron] Received response from Electron:', JSON.stringify(response, null, 2));

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

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

    const server = new PermissionMCPServer();
    server.start().catch((error) => {
      process.exit(1);
});
