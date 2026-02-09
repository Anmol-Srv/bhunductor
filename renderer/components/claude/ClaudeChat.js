import React, { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
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
    const unsubscribeChunk = window.electron.on('claude:message-chunk', (data) => {
      if (data?.sessionId !== sessionId) return;
      setIsStreaming(true);
      setStreamingMessage(prev => prev + (data?.text || ''));
    });

    const unsubscribeComplete = window.electron.on('claude:message-complete', (data) => {
      if (data?.sessionId !== sessionId) return;
      setIsStreaming(false);
      setStreamingMessage(currentMsg => {
        if (currentMsg) {
          setMessages(prev => [...prev, { role: 'assistant', text: currentMsg }]);
        }
        return '';
      });
    });

    const unsubscribePermission = window.electron.on('claude:permission-request', (data) => {
      if (data?.session_id !== sessionId && data?.sessionId !== sessionId) return;
      setPermissionQueue(prev => [...prev, data]);
    });

    const unsubscribeError = window.electron.on('claude:session-error', (data) => {
      if (data?.sessionId !== sessionId) return;
      alert(`Claude Error: ${data.error}`);
    });

    const unsubscribeHistory = window.electron.on('claude:conversation-history', (data) => {
      if (data?.sessionId !== sessionId) return;
      setMessages(data.messages);
    });

    // Pull any buffered history that arrived before this component mounted
    window.electron.invoke('claude:session-get-history', sessionId).then(result => {
      if (result?.success && result.messages && result.messages.length > 0) {
        setMessages(result.messages);
      }
    }).catch(() => { });

    return () => {
      unsubscribeChunk();
      unsubscribeComplete();
      unsubscribePermission();
      unsubscribeError();
      unsubscribeHistory();
    };
  }, [sessionId]);

  // Sync messages to module-level cache
  useEffect(() => {
    messageCache.set(sessionId, messages);
  }, [sessionId, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);

    const result = await window.electron.invoke('claude:send-message', sessionId, userMessage);
    if (!result.success) {
      alert(`Failed to send message: ${result.error}`);
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

  return (
    <div className="claude-chat">
      <div className="message-list">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-content">{msg.text}</div>
          </div>
        ))}

        {isStreaming && streamingMessage && (
          <div className="message assistant streaming">
            <div className="message-content">{streamingMessage}</div>
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

      {activePermission && (
        <PermissionPrompt
          tool={activePermission.tool}
          input={activePermission.input}
          sessionId={activePermission.session_id}
          toolUseId={activePermission.tool_use_id}
          onApprove={() => handlePermissionResponse(true)}
          onDeny={() => handlePermissionResponse(false)}
        />
      )}
    </div>
  );
}

// Clear cache entry when a session is fully stopped
ClaudeChat.clearCache = (sessionId) => messageCache.delete(sessionId);

export default ClaudeChat;
