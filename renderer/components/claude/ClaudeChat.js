import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { ArrowRight, ArrowDown, Pause, Copy, Check, ChevronDown } from 'lucide-react';
import { CLAUDE_MODELS, DEFAULT_MODEL } from '../../../shared/constants';
import MarkdownRenderer from './MarkdownRenderer';
import ToolUseBlock from './ToolUseBlock';
import ToolCallGroup from './ToolCallGroup';
import ThinkingBlock from './ThinkingBlock';
import TurnCostBadge from './TurnCostBadge';
import PermissionPrompt from './PermissionPrompt';
import StreamLoader from './StreamLoader';
import ErrorBlock from './ErrorBlock';
import AskUserQuestionBlock from './AskUserQuestionBlock';
import InstructionCard from './InstructionCard';
import WelcomeBanner from './WelcomeBanner';
import useSessionStore from '../../stores/sessionStore';
import { useShallow } from 'zustand/react/shallow';

const ActiveStreamBlock = memo(({ sessionId }) => {
  const streamingMessage = useSessionStore(s => s.streamingState[sessionId]?.streamingMessage ?? '');

  if (!streamingMessage) return null;

  return (
    <div className="chat-assistant-msg streaming fade-in-stream">
      <MarkdownRenderer content={streamingMessage} />
      <span className="streaming-cursor" />
    </div>
  );
});

const ModelSelector = memo(({ selectedModel, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const current = CLAUDE_MODELS.find(m => m.id === selectedModel) || CLAUDE_MODELS[0];

  return (
    <div className="model-selector" ref={ref}>
      <button
        className="model-selector-trigger"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className="model-selector-label">{current.label}</span>
        <ChevronDown size={12} className={`model-selector-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="model-selector-dropdown">
          {CLAUDE_MODELS.map(m => (
            <button
              key={m.id}
              className={`model-selector-option ${m.id === selectedModel ? 'active' : ''}`}
              onClick={() => { onChange(m.id); setOpen(false); }}
              type="button"
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

const ChatInputBox = memo(({
  sessionId,
  onSend,
  onStop,
  isStreaming,
  isReadOnly,
  placeholderText,
  defaultModel
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  const storeModel = useSessionStore(s => s.sessionModels[sessionId]);
  const selectedModel = storeModel || defaultModel || DEFAULT_MODEL;
  const setSelectedModel = useCallback((modelId) => {
    useSessionStore.getState().setSessionModel(sessionId, modelId);
  }, [sessionId]);

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
    onSend(input.trim(), selectedModel);
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
          <div className="chat-input-toolbar-left">
            <ModelSelector selectedModel={selectedModel} onChange={setSelectedModel} />
          </div>
          {isStreaming ? (
            <button
              className="chat-stop-btn"
              onClick={onStop}
              title="Stop generating"
            >
              <Pause size={14} />
            </button>
          ) : (
            <button
              className="chat-send-btn"
              onClick={handleSendMessage}
              disabled={!input.trim()}
            >
              <ArrowRight size={16} />
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
  const [defaultModel, setDefaultModel] = useState(DEFAULT_MODEL);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const messagesEndRef = useRef(null);
  const chatFeedRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    window.electron.invoke('config:get', 'defaultModel').then(r => {
      if (r?.success && r.value) setDefaultModel(r.value);
    });
  }, []);

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
      setIsAtBottom(isNearBottom);
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

  const handleSendMessage = async (userMessage, selectedModel) => {
    // Always auto-scroll when sending a new message
    shouldAutoScrollRef.current = true;

    if (isReadOnly && onLazyResume) {
      updateMessages(sessionId, prev => [...prev, {
        id: crypto.randomUUID(), role: 'user', type: 'text', text: userMessage
      }]);
      onLazyResume(userMessage);
      return;
    }

    // Check if model changed mid-conversation and insert a notification
    const { lastSentModels, markModelSent } = useSessionStore.getState();
    const prevModel = lastSentModels[sessionId];
    if (prevModel && prevModel !== selectedModel) {
      const modelLabel = CLAUDE_MODELS.find(m => m.id === selectedModel)?.label || selectedModel;
      updateMessages(sessionId, prev => [...prev, {
        id: crypto.randomUUID(), type: 'model_switch', modelId: selectedModel, modelLabel
      }]);
    }
    markModelSent(sessionId, selectedModel);

    updateMessages(sessionId, prev => [...prev, {
      id: crypto.randomUUID(), role: 'user', type: 'text', text: userMessage
    }]);

    const result = await sendMessage(sessionId, userMessage, selectedModel);
    if (!result.success) {
      updateMessages(sessionId, prev => [...prev, {
        id: crypto.randomUUID(), role: 'system', type: 'error',
        text: `Failed to send: ${result.error}`
      }]);
    }
  };

  const handleRetry = useCallback(() => {
    // Find the last user message and re-send it
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user' && m.type === 'text');
    if (lastUserMsg?.text) {
      sendMessage(sessionId, lastUserMsg.text);
      useSessionStore.getState().setStreaming(sessionId, true);
    }
  }, [messages, sessionId, sendMessage]);

  const handleCopy = useCallback((text, msgId) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const handlePermissionResponse = async (action, message = null) => {
    if (!activePermission) return;

    // For AskUserQuestion, send answers object as JSON string in message parameter
    if (activePermission.tool === 'AskUserQuestion' && action === true) {
      // backward compat: AskUserQuestion passes (true, answers)
      const answersJSON = JSON.stringify({ answers: message });
      await window.electron.invoke('claude:permission-respond', activePermission.requestId, 'allow', answersJSON);
      useSessionStore.getState().shiftPermission(sessionId);
    } else {
      await respondToPermission(sessionId, activePermission.requestId, action, message);
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
          <ErrorBlock
            key={msg.id || idx}
            text={msg.text}
            errorType={msg.errorType || 'unknown'}
            isRecoverable={msg.isRecoverable || false}
            onRetry={!isReadOnly ? handleRetry : null}
          />
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

      case 'model_switch':
        return (
          <div key={msg.id || idx} className="model-switch-notice">
            <span className="model-switch-line" />
            <span className="model-switch-label">switched to {msg.modelLabel}</span>
            <span className="model-switch-line" />
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
          hasSuggestions={activePermission.hasSuggestions}
          decisionReason={activePermission.decisionReason}
          onRespond={(action, message) => handlePermissionResponse(action, message)}
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
              handlePermissionResponse('deny');
            }
          }}
          hasPermission={true}
        />
      )}

      {!isAtBottom && (
        <button
          className="scroll-to-bottom"
          onClick={() => {
            shouldAutoScrollRef.current = true;
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          title="Scroll to bottom"
        >
          <ArrowDown size={14} />
        </button>
      )}

      <ChatInputBox
        sessionId={sessionId}
        onSend={handleSendMessage}
        onStop={handleStopSession}
        isStreaming={isStreaming}
        isReadOnly={isReadOnly}
        placeholderText={placeholderText}
        defaultModel={defaultModel}
      />
    </div>
  );
}

// Backward compatibility statics (used by Dashboard for session close/exit)
ClaudeChat.getCache = (sessionId) => useSessionStore.getState().getMessages(sessionId);
ClaudeChat.setCache = (sessionId, messages) => useSessionStore.getState().setMessages(sessionId, messages);
ClaudeChat.clearCache = (sessionId) => useSessionStore.getState().clearMessages(sessionId);

export default ClaudeChat;
