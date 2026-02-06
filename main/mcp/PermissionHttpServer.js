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
    this.pendingRequests = new Map();
    this.requestTimeoutMs = 300000;
  }

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
          reject(error);
        }
      });

      this.server.listen(this.port, 'localhost', () => {
        resolve();
      });
    });
  }

  handlePermissionRequest(req, res) {

    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const permissionData = JSON.parse(body || '{}');
        if (!permissionData || typeof permissionData !== 'object') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid permission request', approved: false }));
          return;
        }

        if (!permissionData.tool_use_id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid permission request, tool_use_id is required', approved: false }));
          return;
        }
        const requestId = permissionData.tool_use_id;
        console.log('[PermissionHttpServer] received permission request:', {
          requestId,
          tool: permissionData.tool,
          sessionId: permissionData.session_id
        });

        const responsePromise = new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            this.respondToPermission(requestId, false, 'Permission request timed out');
          }, this.requestTimeoutMs);

          this.pendingRequests.set(requestId, {
            resolve,
            res,
            timeoutId,
            createdAt: Date.now()
          });
        });

        if (this.onPermissionRequest) {
          this.onPermissionRequest(requestId, permissionData);
        }

        res.on('close', () => {
          const pending = this.pendingRequests.get(requestId);
          if (pending && pending.res === res) {
            clearTimeout(pending.timeoutId);
            this.pendingRequests.delete(requestId);
            console.warn('[PermissionHttpServer] response closed before decision:', {
              requestId
            });
          }
        });

        res.on('finish', () => {
          const pending = this.pendingRequests.get(requestId);
          if (pending && pending.res === res) {
            clearTimeout(pending.timeoutId);
            this.pendingRequests.delete(requestId);
          }
        });

        await responsePromise;

      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message, approved: false }));
      }
    });
  }

  respondToPermission(requestId, approved, message) {
    const pending = this.pendingRequests.get(requestId);

    if (!pending) {
      console.warn('[PermissionHttpServer] respondToPermission: no pending request', {
        requestId,
        approved
      });
      return false;
    }

    const { resolve, res, timeoutId } = pending;

    if (!res.writableEnded) {
      console.log('[PermissionHttpServer] responding to MCP with decision:', {
        requestId,
        approved,
        message
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ approved, message }));
    }

    resolve();
    clearTimeout(timeoutId);
    this.pendingRequests.delete(requestId);
    return true;
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = PermissionHttpServer;
