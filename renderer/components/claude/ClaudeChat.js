import React, { useState, useEffect, useRef } from 'react';
import { X, Send } from 'lucide-react';
import PermissionPrompt from './PermissionPrompt';

function ClaudeChat({ sessionId, activeSessions, onSwitchSession, onStopSession }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [pendingPermission, setPendingPermission] = useState(null);
  const messagesEndRef = useRef(null);

  console.log('[ClaudeChat] Rendered with:', { sessionId, activeSessions });

  useEffect(() => {
    const unsubscribeChunk = window.electron.on('claude:message-chunk', (data) => {
      if (data.sessionId === sessionId) {
        setIsStreaming(true);
        setStreamingMessage(prev => prev + data.text);
      }
    });

    const unsubscribeComplete = window.electron.on('claude:message-complete', (data) => {
      if (data.sessionId === sessionId) {
        setIsStreaming(false);
        // Use functional update to get the latest streamingMessage value
        setStreamingMessage(currentMsg => {
          if (currentMsg) {
            setMessages(prev => [...prev, { role: 'assistant', text: currentMsg }]);
          }
          return '';
        });
      }
    });

    const unsubscribePermission = window.electron.on('claude:permission-request', (data) => {
      if (data.sessionId === sessionId) {
        setPendingPermission(data);
      }
    });

    const unsubscribeError = window.electron.on('claude:session-error', (data) => {
      if (data.sessionId === sessionId) {
        alert(`Claude Error: ${data.error}`);
      }
    });

    return () => {
      unsubscribeChunk();
      unsubscribeComplete();
      unsubscribePermission();
      unsubscribeError();
    };
  }, [sessionId]);

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

  const handlePermissionResponse = async (approved) => {
    const result = await window.electron.invoke('claude:permission-respond', pendingPermission.requestId, approved);
    if (result.success) {
      setPendingPermission(null);
    }
  };

  return (
    <div className="claude-chat">
      <div className="session-tabs">
        {activeSessions.map(session => {
          const sessId = session.sessionId || session.id;
          if (!sessId) {
            console.error('Session missing ID:', session);
            return null;
          }

          return (
            <div
              key={sessId}
              className={`session-tab ${sessId === sessionId ? 'active' : ''}`}
              onClick={() => onSwitchSession(sessId)}
            >
              <span>Session {sessId.slice(0, 8)}</span>
              <button
                className="close-tab"
                onClick={(e) => {
                  e.stopPropagation();
                  onStopSession(sessId);
                }}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

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

      {pendingPermission && (
        <PermissionPrompt
          tool={pendingPermission.tool}
          input={pendingPermission.input}
          onApprove={() => handlePermissionResponse(true)}
          onDeny={() => handlePermissionResponse(false)}
        />
      )}
    </div>
  );
}

export default ClaudeChat;
