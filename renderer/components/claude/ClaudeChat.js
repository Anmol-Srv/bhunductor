import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Send, AlertCircle, Copy, Check, Paperclip, ChevronDown, Lightbulb } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import ToolUseBlock from './ToolUseBlock';
import ToolCallGroup from './ToolCallGroup';
import ThinkingBlock from './ThinkingBlock';
import TurnCostBadge from './TurnCostBadge';
import PermissionPrompt from './PermissionPrompt';

// Module-level cache: survives component mount/unmount cycles
const messageCache = new Map();

function ClaudeChat({ sessionId, isReadOnly = false, initialMessages = null, onLazyResume = null, placeholderText = null }) {
  const [messages, setMessages] = useState(() => {
    if (isReadOnly && initialMessages) return initialMessages;
    return messageCache.get(sessionId) || [];
  });
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [permissionQueue, setPermissionQueue] = useState([]);
  const messagesEndRef = useRef(null);

  // In read-only mode, skip all IPC listeners
  useEffect(() => {
    if (isReadOnly) return;

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

    // Pull buffered history on mount (skip if we already have messages from cache seed)
    const cached = messageCache.get(sessionId);
    if (!cached || cached.length === 0) {
      window.electron.invoke('claude:session-get-history', sessionId).then(result => {
        if (result?.success && result.messages && result.messages.length > 0) {
          setMessages(result.messages);
        }
      }).catch(() => {});
    }

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

  // Sync messages to module-level cache and persist to DB (skip in read-only mode)
  useEffect(() => {
    if (isReadOnly) return;
    messageCache.set(sessionId, messages);
    if (messages.length > 0) {
      window.electron.invoke('claude:session-save-messages', sessionId, messages).catch(() => {});
    }
  }, [sessionId, messages, isReadOnly]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    const userMessage = input;
    setInput('');

    // In read-only mode, add the user message visually then trigger lazy resume
    if (isReadOnly && onLazyResume) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'user', type: 'text', text: userMessage
      }]);
      onLazyResume(userMessage);
      return;
    }

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

  const [copiedId, setCopiedId] = useState(null);
  const [selectedModel, setSelectedModel] = useState('sonnet');
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const modelMenuRef = useRef(null);

  const models = [
    { id: 'sonnet', label: 'Sonnet 4.5' },
    { id: 'opus', label: 'Opus 4.6' },
    { id: 'haiku', label: 'Haiku 4.5' },
  ];

  const selectedModelLabel = models.find(m => m.id === selectedModel)?.label || 'Sonnet 4.5';

  // Close model menu on outside click
  useEffect(() => {
    if (!showModelMenu) return;
    const handleClick = (e) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showModelMenu]);

  const handleCopy = useCallback((text, msgId) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

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

  const renderMessage = (msg, idx, nextMsg, prevMsg) => {
    switch (msg.type) {
      case 'text':
        if (msg.role === 'user') {
          return (
            <div key={msg.id || idx} className="chat-user-msg">
              {msg.text}
            </div>
          );
        }
        // Check if next message is a 'result' (turn cost) — render it inline as footer
        const hasCostFooter = nextMsg && nextMsg.type === 'result';
        return (
          <div key={msg.id || idx} className="chat-assistant-block">
            <div className="chat-assistant-msg">
              <MarkdownRenderer content={msg.text} />
            </div>
            <div className="chat-response-footer">
              <div className="chat-response-meta">
                {hasCostFooter && (
                  <TurnCostBadge
                    costUsd={nextMsg.costUsd}
                    usage={nextMsg.usage}
                    durationMs={nextMsg.durationMs}
                  />
                )}
              </div>
              <button
                className="copy-response-btn"
                onClick={() => handleCopy(msg.text, msg.id)}
                title="Copy response"
              >
                {copiedId === msg.id
                  ? <Check size={13} />
                  : <Copy size={13} />}
              </button>
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
        return null; // Results are shown inside ToolUseBlock

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
          <div key={msg.id || idx} className="chat-error">
            <AlertCircle size={12} />
            <span>{msg.text}</span>
          </div>
        );

      case 'result':
        // Skip if preceding assistant text already rendered this inline
        if (prevMsg?.type === 'text' && prevMsg?.role === 'assistant') return null;
        // Standalone fallback (e.g. after tool groups with no trailing text)
        return (
          <div key={msg.id || idx} className="chat-response-footer" style={{ opacity: 1 }}>
            <div className="chat-response-meta">
              <TurnCostBadge costUsd={msg.costUsd} usage={msg.usage} durationMs={msg.durationMs} />
            </div>
          </div>
        );

      default:
        if (msg.role === 'user') {
          return (
            <div key={msg.id || idx} className="chat-user-msg">
              {msg.text}
            </div>
          );
        }
        return (
          <div key={msg.id || idx} className="chat-assistant-msg">
            <MarkdownRenderer content={msg.text || ''} />
          </div>
        );
    }
  };

  // Group consecutive tool_use messages for collapsed rendering
  const renderItems = useMemo(() => {
    const items = [];
    let toolGroup = [];

    const flushToolGroup = () => {
      if (toolGroup.length === 0) return;
      if (toolGroup.length <= 2) {
        // Small groups: render individually
        items.push(...toolGroup.map(t => ({ type: 'single', msg: t })));
      } else {
        items.push({ type: 'tool_group', tools: [...toolGroup] });
      }
      toolGroup = [];
    };

    for (const msg of messages) {
      if (msg.type === 'tool_use') {
        toolGroup.push(msg);
      } else if (msg.type === 'tool_result') {
        // Skip — results are attached to tool_use
        continue;
      } else {
        flushToolGroup();
        items.push({ type: 'single', msg });
      }
    }
    flushToolGroup();
    return items;
  }, [messages]);

  return (
    <div className="claude-chat">
      <div className="chat-feed">
        {renderItems.map((item, idx) => {
          if (item.type === 'tool_group') {
            return <ToolCallGroup key={`tg-${idx}`} tools={item.tools} />;
          }
          // Look ahead/behind for context
          const nextItem = renderItems[idx + 1];
          const prevItem = renderItems[idx - 1];
          const nextMsg = nextItem?.type === 'single' ? nextItem.msg : null;
          const prevMsg = prevItem?.type === 'single' ? prevItem.msg : null;
          return renderMessage(item.msg, idx, nextMsg, prevMsg);
        })}

        {isStreaming && streamingMessage && (
          <div className="chat-assistant-msg streaming">
            <MarkdownRenderer content={streamingMessage} />
            <span className="streaming-cursor" />
          </div>
        )}

        {activePermission && (
          <div className="chat-permission">
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

      <div className="chat-input-area">
        <div className="chat-input-box">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={placeholderText || "Ask to make changes, @mention files, run /commands"}
            disabled={isStreaming && !isReadOnly}
            rows={1}
          />
          <div className="chat-input-toolbar">
            <div className="chat-input-toolbar-left">
              <div className="model-selector" ref={modelMenuRef}>
                <button
                  className="model-selector-btn"
                  onClick={() => setShowModelMenu(!showModelMenu)}
                >
                  <span>{selectedModelLabel}</span>
                  <ChevronDown size={12} />
                </button>
                {showModelMenu && (
                  <div className="model-selector-menu">
                    {models.map(m => (
                      <div
                        key={m.id}
                        className={`model-selector-item ${m.id === selectedModel ? 'active' : ''}`}
                        onClick={() => { setSelectedModel(m.id); setShowModelMenu(false); }}
                      >
                        {m.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                className={`input-icon-btn ${thinkingEnabled ? 'active' : ''}`}
                onClick={() => setThinkingEnabled(!thinkingEnabled)}
                title={thinkingEnabled ? 'Thinking enabled' : 'Enable thinking'}
              >
                <Lightbulb size={14} />
              </button>
              <button
                className="input-icon-btn"
                title="Attach file"
              >
                <Paperclip size={14} />
              </button>
            </div>
            <button
              className="chat-send-btn"
              onClick={handleSendMessage}
              disabled={!input.trim() || isStreaming}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Get cached messages for a session (for persisting before stop/exit)
ClaudeChat.getCache = (sessionId) => messageCache.get(sessionId) || [];

// Pre-seed cache for a session (used for lazy resume transition)
ClaudeChat.setCache = (sessionId, messages) => messageCache.set(sessionId, messages);

// Clear cache entry when a session is fully stopped
ClaudeChat.clearCache = (sessionId) => messageCache.delete(sessionId);

export default ClaudeChat;
