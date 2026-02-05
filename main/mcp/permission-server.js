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
const http = require('http');

// Configuration - port where Electron app listens for permission requests
const ELECTRON_PORT = process.env.ELECTRON_PERMISSION_PORT || 58472;

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
                tool_input: {
                  type: 'object',
                  description: 'The input parameters for the tool',
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

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'request_permission') {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      const { tool_name, tool_input, tool_use_id } = request.params.arguments;

      try {
        // Send permission request to Electron app via HTTP
        const approved = await this.requestPermissionFromElectron({
          tool: tool_name,
          input: tool_input,
          toolUseId: tool_use_id,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                approved,
                tool_use_id,
                message: approved
                  ? `Permission granted for ${tool_name}`
                  : `Permission denied for ${tool_name}`,
              }),
            },
          ],
        };
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
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(permissionData);

      const options = {
        hostname: 'localhost',
        port: ELECTRON_PORT,
        path: '/permission-request',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 300000, // 5 minutes timeout for user response
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve(response.approved);
          } catch (error) {
            reject(new Error(`Invalid response from Electron: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Failed to connect to Electron app: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Permission request timed out'));
      });

      req.write(postData);
      req.end();
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('[MCP Permission Server] Started successfully');
  }
}

// Start the server
const server = new PermissionMCPServer();
server.start().catch((error) => {
  console.error('[MCP Permission Server] Failed to start:', error);
  process.exit(1);
});
