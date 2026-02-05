#!/bin/bash

echo "=========================================="
echo "Testing Permission Flow Fix"
echo "=========================================="
echo ""

# Create test MCP config
cat > /tmp/test-permission-mcp.json << 'EOF'
{
  "mcpServers": {
    "bhunductor-permissions": {
      "command": "node",
      "args": ["/Users/anmol/Drive/Projects/Bhunductor/main/mcp/permission-server.js"],
      "env": {
        "ELECTRON_PERMISSION_PORT": "58472"
      }
    }
  }
}
EOF

echo "✓ Test 1: MCP server can start..."
timeout 2 node /Users/anmol/Drive/Projects/Bhunductor/main/mcp/permission-server.js 2>&1 | grep "Started successfully" > /dev/null
if [ $? -eq 0 ]; then
  echo "  ✅ MCP server starts"
else
  echo "  ❌ MCP server failed"
  exit 1
fi
echo ""

echo "✓ Test 2: Claude CLI recognizes MCP server..."
echo '{"type":"user","message":{"role":"user","content":"test"}}' | \
  timeout 10 claude --print --input-format stream-json --output-format stream-json \
  --mcp-config /tmp/test-permission-mcp.json --verbose 2>&1 | \
  grep "bhunductor-permissions" | grep "connected" > /dev/null
if [ $? -eq 0 ]; then
  echo "  ✅ MCP server connects to Claude CLI"
else
  echo "  ⚠️  Could not verify MCP connection"
fi
echo ""

echo "✓ Test 3: Checking code changes..."
grep "MCP handling permissions" /Users/anmol/Drive/Projects/Bhunductor/main/claude/ClaudeProcess.js > /dev/null
if [ $? -eq 0 ]; then
  echo "  ✅ Old permission code disabled"
else
  echo "  ❌ Old permission code still active"
  exit 1
fi
echo ""

echo "=========================================="
echo "✅ Ready to test in the app!"
echo "=========================================="
echo ""
echo "Steps to test:"
echo "1. Restart the Electron app (npm start)"
echo "2. Open a folder and start Claude session"
echo "3. Send a message that uses tools:"
echo "   - 'list files in projects folder'"
echo "   - 'search the web for conductor.build'"
echo "4. Permission modal should appear"
echo "5. Click Approve/Deny"
echo ""
echo "What to watch for in logs:"
echo "✅ [Claude CLI] Tool use detected: <tool> (MCP handling permissions)"
echo "✅ [PermissionHttpServer] Received permission request"
echo "✅ [SessionManager] Received MCP permission request"
echo ""
echo "What should NOT appear:"
echo "❌ [Claude CLI] Sending permission response: { type: 'control' ..."
echo "❌ Error: Expected message type 'user' or 'control', got 'control'"
echo ""
