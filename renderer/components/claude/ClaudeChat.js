import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Send, Square, AlertCircle, Copy, Check } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import ToolUseBlock from './ToolUseBlock';
import ToolCallGroup from './ToolCallGroup';
import ThinkingBlock from './ThinkingBlock';
import TurnCostBadge from './TurnCostBadge';
import PermissionPrompt from './PermissionPrompt';
import StreamLoader from './StreamLoader';
import AskUserQuestionBlock from './AskUserQuestionBlock';
import WelcomeBanner from './WelcomeBanner';
import useSessionStore from '../../stores/sessionStore';
import { useShallow } from 'zustand/react/shallow';

const EMPTY_ARRAY = [];

function ClaudeChat({
  sessionId,
  isReadOnly = false,
  initialMessages = null,
  onLazyResume = null,
  placeholderText = null,
  folderName = null,
  branchName = null,
  model = 'Sonnet 4.5'
}) {
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Single shallow-compared subscription to avoid infinite re-render loops
  const { _version, isStreaming, streamingMessage, permissionQueue } = useSessionStore(
    useShallow(s => ({
      _version: s._messageCacheVersion,
      isStreaming: s.streamingState[sessionId]?.isStreaming ?? false,
      streamingMessage: s.streamingState[sessionId]?.streamingMessage ?? '',
      permissionQueue: s.permissionQueues[sessionId] ?? EMPTY_ARRAY,
    }))
  );

  const messages = isReadOnly && initialMessages
    ? initialMessages
    : useSessionStore.getState().getMessages(sessionId);

  const activePermission = permissionQueue[0] || null;

  const { updateMessages, sendMessage, respondToPermission } = useSessionStore.getState();

  // On mount: pull buffered history if no cached messages
  useEffect(() => {
    if (isReadOnly) return;
    const cached = useSessionStore.getState().getMessages(sessionId);
    if (cached.length === 0) {
      window.electron.invoke('claude:session-get-history', sessionId).then(result => {
        if (result?.success && result.messages && result.messages.length > 0) {
          useSessionStore.getState().setMessages(sessionId, result.messages);
        }
      }).catch(() => {});
    }
  }, [sessionId, isReadOnly]);

  // Persist messages to DB when they change (skip read-only)
  useEffect(() => {
    if (isReadOnly || messages.length === 0) return;
    window.electron.invoke('claude:session-save-messages', sessionId, messages).catch(() => {});
  }, [sessionId, _version, isReadOnly]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [_version, streamingMessage]);

  // Fetch system info on mount and listen for updates
  useEffect(() => {
    if (isReadOnly) return;

    // Fetch existing system info from database
    console.log('[ClaudeChat] Fetching system info for session:', sessionId);
    window.electron.invoke('claude:session-get-system-info', sessionId).then(result => {
      console.log('[ClaudeChat] System info fetch result:', result);
      if (result.success && result.systemInfo) {
        const info = {
          model: result.systemInfo.model,
          modelVersion: result.systemInfo.modelVersion,
          apiVersion: result.systemInfo.apiVersion,
          claudeSessionId: result.systemInfo.claudeSessionId
        };
        console.log('[ClaudeChat] Setting system info from DB:', info);
        setSystemInfo(info);
      }
    }).catch(err => {
      console.error('[ClaudeChat] Error fetching system info:', err);
    });

    // Also listen for real-time updates
    const unsubscribe = window.electron.on('claude:system-info', (data) => {
      console.log('[ClaudeChat] Received claude:system-info event:', data);
      if (data.sessionId === sessionId) {
        const info = {
          model: data.model,
          modelVersion: data.modelVersion,
          apiVersion: data.apiVersion,
          claudeSessionId: data.claudeSessionId
        };
        console.log('[ClaudeChat] Setting system info from event:', info);
        setSystemInfo(info);
      }
    });

    return () => unsubscribe();
  }, [sessionId, isReadOnly]);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const handleStopSession = useCallback(async () => {
    await useSessionStore.getState().stopSession(sessionId);
  }, [sessionId]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    const userMessage = input;
    setInput('');

    if (isReadOnly && onLazyResume) {
      updateMessages(sessionId, prev => [...prev, {
        id: crypto.randomUUID(), role: 'user', type: 'text', text: userMessage
      }]);
      onLazyResume(userMessage);
      return;
    }

    updateMessages(sessionId, prev => [...prev, {
      id: crypto.randomUUID(), role: 'user', type: 'text', text: userMessage
    }]);
    const result = await sendMessage(sessionId, userMessage);
    if (!result.success) {
      updateMessages(sessionId, prev => [...prev, {
        id: crypto.randomUUID(), role: 'system', type: 'error',
        text: `Failed to send: ${result.error}`
      }]);
    }
  };

  const handleCopy = useCallback((text, msgId) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const handlePermissionResponse = async (approved) => {
    if (!activePermission) return;
    await respondToPermission(sessionId, activePermission.requestId, approved);
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
        if (msg.toolName === 'AskUserQuestion') {
          return (
            <AskUserQuestionBlock
              key={msg.toolUseId || idx}
              toolInput={msg.toolInput}
              status={msg.status}
              result={msg.result}
              sessionId={sessionId}
              onSubmit={() => handlePermissionResponse(true)}
              onCancel={() => handlePermissionResponse(false)}
              hasPermission={activePermission?.tool === 'AskUserQuestion'}
            />
          );
        }
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
        return null;

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
        if (prevMsg?.type === 'text' && prevMsg?.role === 'assistant') return null;
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

  const renderItems = useMemo(() => {
    const items = [];
    let toolGroup = [];

    const flushToolGroup = () => {
      if (toolGroup.length === 0) return;
      if (toolGroup.length <= 2) {
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
        continue;
      } else {
        flushToolGroup();
        items.push({ type: 'single', msg });
      }
    }
    flushToolGroup();
    return items;
  }, [messages]);

  const showWelcome = !isReadOnly && messages.length === 0 && !isStreaming;

  // Use actual model from system info if available, otherwise fall back to prop
  const displayModel = systemInfo?.model || model;
  const displayModelVersion = systemInfo?.modelVersion;

  return (
    <div className="claude-chat">
      <div className="chat-feed">
        {showWelcome && (
          <WelcomeBanner
            model={displayModel}
            modelVersion={displayModelVersion}
            branchName={branchName}
          />
        )}

        {renderItems.map((item, idx) => {
          if (item.type === 'tool_group') {
            return <ToolCallGroup key={`tg-${idx}`} tools={item.tools} />;
          }
          const nextItem = renderItems[idx + 1];
          const prevItem = renderItems[idx - 1];
          const nextMsg = nextItem?.type === 'single' ? nextItem.msg : null;
          const prevMsg = prevItem?.type === 'single' ? prevItem.msg : null;
          return renderMessage(item.msg, idx, nextMsg, prevMsg);
        })}

        {!isReadOnly && (() => {
          const lastMsg = messages[messages.length - 1];
          const lastNonResultMsg = [...messages].reverse().find(m => m.type !== 'result');
          const hasActiveThinking = lastMsg?.type === 'thinking' && lastMsg?.isPartial;
          const hasRunningTool = messages.some(m => m.type === 'tool_use' && m.status === 'running');
          const lastUserMsg = lastNonResultMsg?.role === 'user';
          const isWaitingForResponse = (lastUserMsg || isStreaming) && !activePermission;

          // If we're waiting for a response (either streaming or just sent a message)
          if (isWaitingForResponse) {
            if (streamingMessage) {
              // Text is streaming in — show it with cursor
              return (
                <div className="chat-assistant-msg streaming">
                  <MarkdownRenderer content={streamingMessage} />
                  <span className="streaming-cursor" />
                </div>
              );
            }

            if (hasActiveThinking || hasRunningTool) {
              // Thinking or tool in progress — those blocks handle their own status
              return null;
            }

            // Waiting for any response (initial or during permissions)
            return <StreamLoader label="Waiting for response" />;
          }

          return null;
        })()}

        <div ref={messagesEndRef} />
      </div>

      {activePermission && activePermission.tool !== 'AskUserQuestion' && (
        <PermissionPrompt
          tool={activePermission.tool}
          input={activePermission.input}
          onApprove={() => handlePermissionResponse(true)}
          onDeny={() => handlePermissionResponse(false)}
        />
      )}

      <div className="chat-input-area">
        <div className="chat-input-box">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.metaKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={placeholderText || "Ask to make changes, @mention files, run /commands"}
            disabled={isStreaming && !isReadOnly}
            rows={1}
          />
          <div className="chat-input-toolbar">
            <div className="chat-input-toolbar-left" />
            {isStreaming ? (
              <button
                className="chat-stop-btn"
                onClick={handleStopSession}
                title="Stop generating"
              >
                <Square size={12} />
              </button>
            ) : (
              <button
                className="chat-send-btn"
                onClick={handleSendMessage}
                disabled={!input.trim()}
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Backward compatibility statics (used by Dashboard for session close/exit)
ClaudeChat.getCache = (sessionId) => useSessionStore.getState().getMessages(sessionId);
ClaudeChat.setCache = (sessionId, messages) => useSessionStore.getState().setMessages(sessionId, messages);
ClaudeChat.clearCache = (sessionId) => useSessionStore.getState().clearMessages(sessionId);

export default ClaudeChat;
