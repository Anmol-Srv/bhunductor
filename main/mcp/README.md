# MCP Permission System

This directory contains the Model Context Protocol (MCP) server implementation for handling Claude CLI permissions in Bhunductor.

## Architecture

```
┌─────────────────┐
│  Claude CLI     │
│  (--print mode) │
└────────┬────────┘
         │ Tool use detected
         │
         ▼
┌─────────────────────────────────┐
│  MCP Permission Server          │
│  (permission-server.js)         │
│  - Runs as separate Node process│
│  - Communicates via stdio       │
└────────┬────────────────────────┘
         │ HTTP POST
         │
         ▼
┌─────────────────────────────────┐
│  PermissionHttpServer           │
│  (PermissionHttpServer.js)      │
│  - Runs in Electron main        │
│  - Listens on localhost:58472   │
└────────┬────────────────────────┘
         │ IPC
         │
         ▼
┌─────────────────────────────────┐
│  ClaudeSessionManager           │
│  - Forwards to renderer         │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Renderer (ClaudeChat.js)       │
│  - Shows permission modal       │
│  - User approves/denies         │
└─────────────────────────────────┘
```

## How It Works

1. **Claude CLI** detects a tool use and calls the MCP permission prompt tool
2. **MCP Permission Server** receives the tool call via stdio
3. **MCP Server** makes HTTP POST to Electron's HTTP server with permission request
4. **PermissionHttpServer** receives the request and forwards to SessionManager
5. **SessionManager** sends IPC message to renderer to show permission modal
6. **User** clicks Approve or Deny in the UI
7. **Renderer** sends response back via IPC
8. **SessionManager** calls `respondToPermission()`
9. **PermissionHttpServer** responds to the HTTP request
10. **MCP Server** returns the approval decision to Claude CLI
11. **Claude CLI** proceeds or denies the tool execution

## Files

- **permission-server.js**: MCP server that implements the `request_permission` tool
- **PermissionHttpServer.js**: HTTP server running in Electron main process
- **mcp-config.json**: Static config file (not used, config is generated dynamically)

## Configuration

The MCP server is configured dynamically in `ClaudeProcess.js`:

```javascript
{
  mcpServers: {
    'bhunductor-permissions': {
      command: 'node',
      args: [permissionServerPath],
      env: {
        ELECTRON_PERMISSION_PORT: '58472'
      }
    }
  }
}
```

Claude CLI is invoked with:
- `--mcp-config <json>`: The MCP server configuration
- `--permission-prompt-tool mcp__bhunductor-permissions__request_permission`: The tool to call for permissions

## Port Configuration

The HTTP server listens on `localhost:58472` by default. This can be changed by:
1. Updating `ELECTRON_PERMISSION_PORT` in the MCP config
2. Updating the port in `ClaudeSessionManager.js`

## Debugging

Enable verbose logging:
- MCP server logs to stderr (visible in Claude CLI stderr output)
- HTTP server logs to Electron console
- Check Electron DevTools for renderer logs

## Dependencies

- `@modelcontextprotocol/sdk`: Official MCP SDK for Node.js

## References

- [Claude Code CLI Documentation](https://code.claude.com/docs/en/cli-reference.md)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [Claude Code Permissions](https://code.claude.com/docs/en/permissions.md)
