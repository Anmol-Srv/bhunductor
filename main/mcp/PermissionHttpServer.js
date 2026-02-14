const Fastify = require('fastify');

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
    this.pendingRequests = new Map();
    this.requestTimeoutMs = 300000;
    this.fastify = null;
  }

  start() {
    this.fastify = Fastify({ logger: false });

    this.fastify.post('/permission-request', {
      schema: {
        body: {
          type: 'object',
          required: ['tool_use_id'],
          properties: {
            tool_use_id: { type: 'string' },
            tool: { type: 'string' },
            input: { type: 'object' },
            session_id: { type: 'string' }
          },
          additionalProperties: true
        }
      }
    }, (request, reply) => this.handlePermissionRequest(request, reply));

    this.fastify.post('/rename-session', {
      schema: {
        body: {
          type: 'object',
          required: ['session_id', 'title'],
          properties: {
            session_id: { type: 'string' },
            title: { type: 'string' }
          }
        }
      }
    }, (request, reply) => this.handleRenameSession(request, reply));

    this.fastify.setNotFoundHandler((request, reply) => {
      reply.code(404).send({ error: 'Not found' });
    });

    this.fastify.setErrorHandler((error, request, reply) => {
      if (error.validation) {
        reply.code(400).send({ error: error.message, approved: false });
        return;
      }
      reply.code(500).send({ error: error.message, approved: false });
    });

    return this.fastify.listen({ port: this.port, host: 'localhost' }).then((address) => {
      this.actualPort = this.fastify.server.address().port;
      return address;
    });
  }

  getPort() {
    return this.actualPort || this.port;
  }

  async handlePermissionRequest(request, reply) {
    const permissionData = request.body;
    const requestId = permissionData.tool_use_id;

    if (this.onPermissionRequest) {
      this.onPermissionRequest(requestId, permissionData);
    }

    const result = await new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.respondToPermission(requestId, false, 'Permission request timed out');
      }, this.requestTimeoutMs);

      this.pendingRequests.set(requestId, {
        resolve,
        timeoutId,
        createdAt: Date.now()
      });
    });

    return result;
  }

  async handleRenameSession(request, reply) {
    const { session_id, title } = request.body;

    if (this.onRenameSession) {
      try {
        await this.onRenameSession(session_id, title);
        return { success: true };
      } catch (error) {
        reply.code(500);
        return { success: false, error: error.message };
      }
    } else {
      reply.code(503);
      return { success: false, error: 'Rename handler not configured' };
    }
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

    clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(requestId);
    pending.resolve({ approved, message });
    return true;
  }

  async stop() {
    // Deny all pending requests before shutting down
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.resolve({ approved: false, message: 'Server shutting down' });
    }
    this.pendingRequests.clear();

    if (this.fastify) {
      await this.fastify.close();
    }
  }
}

module.exports = PermissionHttpServer;
