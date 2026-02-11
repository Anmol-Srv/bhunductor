import React, { useState, useEffect, useRef } from 'react';
import { Send, AlertCircle } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import ToolUseBlock from './ToolUseBlock';
import ThinkingBlock from './ThinkingBlock';
import TurnCostBadge from './TurnCostBadge';
import PermissionPrompt from './PermissionPrompt';

// Module-level cache: survives component mount/unmount cycles
const messageCache = new Map();

function ClaudeChat({ sessionId }) {
  const [messages, setMessages] = useState(() => messageCache.get(sessionId) || []);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [permissionQueue, setPermissionQueue] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Text streaming chunks
    const unsubChunk = window.electron.on('claude:message-chunk', (data) => {
      if (data?.sessionId !== sessionId) return;
      setIsStreaming(true);
      setStreamingMessage(prev => prev + (data?.text || ''));
    });

    // Message complete — commit streaming text to messages
    const unsubComplete = window.electron.on('claude:message-complete', (data) => {
      if (data?.sessionId !== sessionId) return;
      setIsStreaming(false);
      setStreamingMessage(currentMsg => {
        if (currentMsg) {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(), role: 'assistant', type: 'text', text: currentMsg
          }]);
        }
        return '';
      });
    });

    // Tool use events (start + input update)
    const unsubToolUse = window.electron.on('claude:tool-use', (data) => {
      if (data?.sessionId !== sessionId) return;
      // Commit any streaming text before showing tool block
      setStreamingMessage(currentMsg => {
        if (currentMsg) {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(), role: 'assistant', type: 'text', text: currentMsg
          }]);
        }
        return '';
      });
      setMessages(prev => {
        const idx = prev.findIndex(m => m.type === 'tool_use' && m.toolUseId === data.toolUseId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            toolInput: data.toolInput || updated[idx].toolInput,
            status: data.status
          };
          return updated;
        }
        return [...prev, {
          id: data.toolUseId,
          role: 'assistant',
          type: 'tool_use',
          toolUseId: data.toolUseId,
          toolName: data.toolName,
          toolInput: data.toolInput,
          status: data.status || 'running'
        }];
      });
    });

    // Tool result events — attach to matching tool_use
    const unsubToolResult = window.electron.on('claude:tool-result', (data) => {
      if (data?.sessionId !== sessionId) return;
      setMessages(prev => prev.map(m => {
        if (m.type === 'tool_use' && m.toolUseId === data.toolUseId) {
          return {
            ...m,
            result: data.result,
            isError: data.isError,
            status: data.isError ? 'error' : 'complete'
          };
        }
        return m;
      }));
    });

    // Thinking events
    const unsubThinking = window.electron.on('claude:thinking', (data) => {
      if (data?.sessionId !== sessionId) return;
      if (data.isPartial) {
        setMessages(prev => {
          const lastIdx = prev.length - 1;
          if (lastIdx >= 0 && prev[lastIdx].type === 'thinking' && prev[lastIdx].isPartial) {
            const updated = [...prev];
            updated[lastIdx] = {
              ...updated[lastIdx],
              thinking: updated[lastIdx].thinking + data.thinking
            };
            return updated;
          }
          return [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            type: 'thinking',
            thinking: data.thinking,
            isPartial: true
          }];
        });
      } else {
        setMessages(prev => {
          const lastIdx = prev.length - 1;
          if (lastIdx >= 0 && prev[lastIdx].type === 'thinking' && prev[lastIdx].isPartial) {
            const updated = [...prev];
            updated[lastIdx] = {
              ...updated[lastIdx],
              thinking: data.thinking,
              isPartial: false
            };
            return updated;
          }
          return [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            type: 'thinking',
            thinking: data.thinking,
            isPartial: false
          }];
        });
      }
    });

    // Turn complete (cost/usage)
    const unsubTurnComplete = window.electron.on('claude:turn-complete', (data) => {
      if (data?.sessionId !== sessionId) return;
      if (data.costUsd || data.usage) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'system',
          type: 'result',
          costUsd: data.costUsd,
          usage: data.usage,
          durationMs: data.durationMs
        }]);
      }
    });

    // Permission requests
    const unsubPermission = window.electron.on('claude:permission-request', (data) => {
      if (data?.session_id !== sessionId && data?.sessionId !== sessionId) return;
      setPermissionQueue(prev => [...prev, data]);
    });

    // Errors — show inline instead of alert
    const unsubError = window.electron.on('claude:session-error', (data) => {
      if (data?.sessionId !== sessionId) return;
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        type: 'error',
        text: data.error
      }]);
    });

    // Conversation history (from resume/continue)
    const unsubHistory = window.electron.on('claude:conversation-history', (data) => {
      if (data?.sessionId !== sessionId) return;
      setMessages(data.messages || []);
    });

    // Pull buffered history on mount
    window.electron.invoke('claude:session-get-history', sessionId).then(result => {
      if (result?.success && result.messages && result.messages.length > 0) {
        setMessages(result.messages);
      }
    }).catch(() => {});

    return () => {
      unsubChunk();
      unsubComplete();
      unsubToolUse();
      unsubToolResult();
      unsubThinking();
      unsubTurnComplete();
      unsubPermission();
      unsubError();
      unsubHistory();
    };
  }, [sessionId]);

  // Sync messages to module-level cache and persist to DB
  useEffect(() => {
    messageCache.set(sessionId, messages);
    if (messages.length > 0) {
      window.electron.invoke('claude:session-save-messages', sessionId, messages).catch(() => {});
    }
  }, [sessionId, messages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(), role: 'user', type: 'text', text: userMessage
    }]);
    const result = await window.electron.invoke('claude:send-message', sessionId, userMessage);
    if (!result.success) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'system', type: 'error',
        text: `Failed to send: ${result.error}`
      }]);
    }
  };

  const activePermission = permissionQueue[0] || null;

  const handlePermissionResponse = async (approved) => {
    if (!activePermission) return;
    const result = await window.electron.invoke(
      'claude:permission-respond',
      activePermission.requestId,
      approved
    );
    if (result.success) {
      setPermissionQueue(prev => prev.slice(1));
    }
  };

  const renderMessage = (msg, idx) => {
    switch (msg.type) {
      case 'text':
        if (msg.role === 'user') {
          return (
            <div key={msg.id || idx} className="message user">
              <div className="message-content">{msg.text}</div>
            </div>
          );
        }
        return (
          <div key={msg.id || idx} className="message assistant">
            <div className="message-content">
              <MarkdownRenderer content={msg.text} />
            </div>
          </div>
        );

      case 'tool_use':
        return (
          <ToolUseBlock
            key={msg.toolUseId || idx}
            toolName={msg.toolName}
            toolInput={msg.toolInput}
            toolUseId={msg.toolUseId}
            status={msg.status}
            result={msg.result}
            isError={msg.isError}
          />
        );

      case 'tool_result':
        return (
          <div key={msg.id || idx} className="message tool-result-standalone">
            <div className="message-content">
              <pre className="tool-result-text">
                {typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result, null, 2)}
              </pre>
            </div>
          </div>
        );

      case 'thinking':
        return (
          <ThinkingBlock
            key={msg.id || idx}
            thinking={msg.thinking}
            isPartial={msg.isPartial}
          />
        );

      case 'error':
        return (
          <div key={msg.id || idx} className="message error-message">
            <AlertCircle size={16} />
            <span>{msg.text}</span>
          </div>
        );

      case 'result':
        return (
          <TurnCostBadge
            key={msg.id || idx}
            costUsd={msg.costUsd}
            usage={msg.usage}
            durationMs={msg.durationMs}
          />
        );

      default:
        // Legacy messages without type field (backward compat)
        if (msg.role === 'user') {
          return (
            <div key={msg.id || idx} className="message user">
              <div className="message-content">{msg.text}</div>
            </div>
          );
        }
        return (
          <div key={msg.id || idx} className="message assistant">
            <div className="message-content">
              <MarkdownRenderer content={msg.text || ''} />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="claude-chat">
      <div className="message-list">
        {messages.map(renderMessage)}

        {isStreaming && streamingMessage && (
          <div className="message assistant streaming">
            <div className="message-content">
              <MarkdownRenderer content={streamingMessage} />
              <span className="streaming-cursor"></span>
            </div>
          </div>
        )}

        {activePermission && (
          <div className="message permission-inline">
            <PermissionPrompt
              tool={activePermission.tool}
              input={activePermission.input}
              sessionId={activePermission.session_id}
              toolUseId={activePermission.tool_use_id}
              onApprove={() => handlePermissionResponse(true)}
              onDeny={() => handlePermissionResponse(false)}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="message-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder="Type your message..."
          disabled={isStreaming}
        />
        <button
          className="send-btn"
          onClick={handleSendMessage}
          disabled={!input.trim() || isStreaming}
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
}

// Get cached messages for a session (for persisting before stop/exit)
ClaudeChat.getCache = (sessionId) => messageCache.get(sessionId) || [];

// Clear cache entry when a session is fully stopped
ClaudeChat.clearCache = (sessionId) => messageCache.delete(sessionId);

export default ClaudeChat;
