const http = require('http');

/**
 * HTTP Server for receiving permission requests from MCP server
 *
 * This server runs inside the Electron main process and receives
 * permission requests from the MCP server, then forwards them to
 * the renderer via IPC.
 */
class PermissionHttpServer {
  constructor(port = 58472) {
    this.port = port;
    this.server = null;
    this.pendingRequests = new Map(); // requestId -> { resolve, reject }
  }

  /**
   * Start the HTTP server
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/permission-request') {
          this.handlePermissionRequest(req, res);
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });

      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`[PermissionHttpServer] Port ${this.port} is already in use`);
          reject(error);
        } else {
          console.error('[PermissionHttpServer] Server error:', error);
        }
      });

      this.server.listen(this.port, 'localhost', () => {
        console.log(`[PermissionHttpServer] Listening on http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Handle incoming permission request from MCP server
   */
  handlePermissionRequest(req, res) {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const permissionData = JSON.parse(body);
        console.log('[PermissionHttpServer] Received permission request:', permissionData);

        // Store the response handler
        const requestId = permissionData.toolUseId || Date.now().toString();

        const responsePromise = new Promise((resolve) => {
          this.pendingRequests.set(requestId, { resolve, res });
        });

        // Notify callback that we have a permission request
        if (this.onPermissionRequest) {
          this.onPermissionRequest(requestId, permissionData);
        }

        // Wait for response (will be provided via respondToPermission method)
        await responsePromise;

      } catch (error) {
        console.error('[PermissionHttpServer] Error handling request:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message, approved: false }));
      }
    });
  }

  /**
   * Respond to a pending permission request
   * Called by the session manager after user approves/denies
   */
  respondToPermission(requestId, approved) {
    const pending = this.pendingRequests.get(requestId);

    if (!pending) {
      console.error(`[PermissionHttpServer] No pending request found for ${requestId}`);
      return;
    }

    const { resolve, res } = pending;

    // Send response back to MCP server
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ approved }));

    // Resolve the promise and cleanup
    resolve();
    this.pendingRequests.delete(requestId);

    console.log(`[PermissionHttpServer] Responded to permission ${requestId}: ${approved ? 'APPROVED' : 'DENIED'}`);
  }

  /**
   * Stop the server
   */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[PermissionHttpServer] Stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = PermissionHttpServer;
