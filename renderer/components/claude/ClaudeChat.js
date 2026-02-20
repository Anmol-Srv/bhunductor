import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { Send, Square, AlertCircle, Copy, Check } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import ToolUseBlock from './ToolUseBlock';
import ToolCallGroup from './ToolCallGroup';
import ThinkingBlock from './ThinkingBlock';
import TurnCostBadge from './TurnCostBadge';
import PermissionPrompt from './PermissionPrompt';
import StreamLoader from './StreamLoader';
import AskUserQuestionBlock from './AskUserQuestionBlock';
import InstructionCard from './InstructionCard';
import WelcomeBanner from './WelcomeBanner';
import useSessionStore from '../../stores/sessionStore';
import { useShallow } from 'zustand/react/shallow';

const ActiveStreamBlock = memo(({ sessionId }) => {
  const streamingMessage = useSessionStore(s => s.streamingState[sessionId]?.streamingMessage ?? '');

  if (!streamingMessage) return null;

  return (
    <div className="chat-assistant-msg streaming">
      <MarkdownRenderer content={streamingMessage} />
      <span className="streaming-cursor" />
    </div>
  );
});

const ChatInputBox = memo(({
  onSend,
  onStop,
  isStreaming,
  isReadOnly,
  placeholderText
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, []);

  useEffect(() => {
    autoResize();
  }, [input, autoResize]);

  const handleSendMessage = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  return (
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
              onClick={onStop}
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
  );
});


const EMPTY_ARRAY = [];

function ClaudeChat({
  sessionId,
  isReadOnly = false,
  initialMessages = null,
  onLazyResume = null,
  placeholderText = null,
  folderName = null,
  branchName = null,
  model = 'Opus 4.6'
}) {
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);
  const chatFeedRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);

  // Single shallow-compared subscription to avoid infinite re-render loops
  const { _version, isStreaming, permissionQueue } = useSessionStore(
    useShallow(s => ({
      _version: s._messageCacheVersion,
      isStreaming: s.streamingState[sessionId]?.isStreaming ?? false,
      permissionQueue: s.permissionQueues[sessionId] ?? EMPTY_ARRAY,
    }))
  );

  const messages = isReadOnly && initialMessages
    ? initialMessages
    : useSessionStore.getState().getMessages(sessionId);

  const activePermission = permissionQueue[0] || null;

  // Find active AskUserQuestion tool (not complete)
  const activeAskQuestion = messages.find(m =>
    m.type === 'tool_use' &&
    m.toolName === 'AskUserQuestion' &&
    m.status !== 'complete'
  );

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
      }).catch(() => { });
    }
  }, [sessionId, isReadOnly]);

  // Persist messages to DB when they change (skip read-only)
  useEffect(() => {
    if (isReadOnly || messages.length === 0) return;
    window.electron.invoke('claude:session-save-messages', sessionId, messages).catch(() => { });
  }, [sessionId, _version, isReadOnly]);

  // Track scroll position to determine if we should auto-scroll
  useEffect(() => {
    const chatFeed = chatFeedRef.current;
    if (!chatFeed) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = chatFeed;
      // Consider "at bottom" if within 100px of bottom
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      shouldAutoScrollRef.current = isNearBottom;
    };

    chatFeed.addEventListener('scroll', handleScroll);
    return () => chatFeed.removeEventListener('scroll', handleScroll);
  }, []);

  // Subscribe to streaming updates specifically for auto-scrolling
  // This does not trigger ClaudeChat re-renders, just calls imperative scroll!
  useEffect(() => {
    const unsub = useSessionStore.subscribe(
      (state) => state.streamingState[sessionId]?.streamingMessage,
      (newMsg, oldMsg) => {
        if (newMsg !== oldMsg && shouldAutoScrollRef.current) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }
      }
    );
    return unsub;
  }, [sessionId]);

  // Auto-scroll on normal _version changes (new messages)
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [_version]);

  const handleStopSession = useCallback(async () => {
    await useSessionStore.getState().stopSession(sessionId);
  }, [sessionId]);

  const handleSendMessage = async (userMessage) => {
    // Always auto-scroll when sending a new message
    shouldAutoScrollRef.current = true;

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

  const handlePermissionResponse = async (approved, answers = null) => {
    if (!activePermission) return;

    // For AskUserQuestion, send answers object as JSON string in message parameter
    if (activePermission.tool === 'AskUserQuestion' && answers) {
      const answersJSON = JSON.stringify({ answers });
      await window.electron.invoke('claude:permission-respond', activePermission.requestId, true, answersJSON);
      useSessionStore.getState().shiftPermission(sessionId);
    } else {
      await respondToPermission(sessionId, activePermission.requestId, approved);
    }
  };

  const renderMessage = (msg, idx, nextMsg, prevMsg) => {
    switch (msg.type) {
      case 'text':
        if (msg.role === 'user') {
          if (msg.isInstruction && msg.instructionMeta) {
            return (
              <InstructionCard
                key={msg.id || idx}
                text={msg.text}
                meta={msg.instructionMeta}
              />
            );
          }
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
        // AskUserQuestion is rendered above chat input, not inline
        if (msg.toolName === 'AskUserQuestion') {
          return null;
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
      // Always group tool calls together, regardless of count
      items.push({ type: 'tool_group', tools: [...toolGroup] });
      toolGroup = [];
    };

    for (const msg of messages) {
      if (msg.type === 'tool_use') {
        // AskUserQuestion should be rendered separately with its interactive UI
        if (msg.toolName === 'AskUserQuestion') {
          flushToolGroup();
          items.push({ type: 'single', msg });
        } else {
          toolGroup.push(msg);
        }
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

  return (
    <div className="claude-chat">
      <div className="chat-feed" ref={chatFeedRef}>
        {!isReadOnly && (
          <WelcomeBanner
            model={model}
            branchName={branchName}
            folderName={folderName}
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
            // If genuinely streaming now, use the independent component
            if (isStreaming) {
              return <ActiveStreamBlock sessionId={sessionId} />;
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

      {activeAskQuestion && (
        <AskUserQuestionBlock
          toolInput={activeAskQuestion.toolInput}
          status={activeAskQuestion.status}
          result={activeAskQuestion.result}
          sessionId={sessionId}
          toolUseId={activeAskQuestion.toolUseId}
          onSubmit={(answers) => {
            // Mark tool as complete with answers
            updateMessages(sessionId, prev => prev.map(m =>
              m.toolUseId === activeAskQuestion.toolUseId
                ? { ...m, status: 'complete', result: JSON.stringify({ answers }) }
                : m
            ));
            // Send answers to CLI via permission response
            if (activePermission?.tool === 'AskUserQuestion') {
              handlePermissionResponse(true, answers);
            }
          }}
          onCancel={() => {
            // Mark tool as error/cancelled
            updateMessages(sessionId, prev => prev.map(m =>
              m.toolUseId === activeAskQuestion.toolUseId
                ? { ...m, status: 'error', result: 'Cancelled by user' }
                : m
            ));
            if (activePermission?.tool === 'AskUserQuestion') {
              handlePermissionResponse(false);
            }
          }}
          hasPermission={true}
        />
      )}

      <ChatInputBox
        onSend={handleSendMessage}
        onStop={handleStopSession}
        isStreaming={isStreaming}
        isReadOnly={isReadOnly}
        placeholderText={placeholderText}
      />
    </div>
  );
}

// Backward compatibility statics (used by Dashboard for session close/exit)
ClaudeChat.getCache = (sessionId) => useSessionStore.getState().getMessages(sessionId);
ClaudeChat.setCache = (sessionId, messages) => useSessionStore.getState().setMessages(sessionId, messages);
ClaudeChat.clearCache = (sessionId) => useSessionStore.getState().clearMessages(sessionId);

export default ClaudeChat;
