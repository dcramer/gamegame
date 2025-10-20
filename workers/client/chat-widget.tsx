import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useChat, type Message } from '@ai-sdk/react';

// Simple markdown renderer (subset of react-markdown features)
function Markdown({ children }: { children: string }) {
  const html = children
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Images (will be handled separately for attachments)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    // Line breaks
    .replace(/\n/g, '<br />');

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

interface ParsedMessage {
  answer?: string;
  followUps?: string[];
  resources?: { name: string; id: string }[];
}

function SystemMessage({
  message,
  isStreaming,
  isCurrent,
  onFollowUp,
}: {
  message: Message;
  isStreaming: boolean;
  isCurrent: boolean;
  onFollowUp: (text: string) => void;
}) {
  const content = message.content;

  if (!content) {
    if (isStreaming) return null;
    return (
      <div style={{
        padding: '0.75rem 1rem',
        background: '#991b1b',
        color: '#fee2e2',
        borderRadius: '8px',
        fontWeight: 600,
      }}>
        There was an error processing your request. Please try again.
      </div>
    );
  }

  let parsed: ParsedMessage;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    if (isStreaming) return null;
    return (
      <div style={{
        padding: '0.75rem 1rem',
        background: '#991b1b',
        color: '#fee2e2',
        borderRadius: '8px',
        fontWeight: 600,
      }}>
        There was an error processing your request. Please try again.
      </div>
    );
  }

  const { answer, followUps, resources } = parsed;

  if (!answer) {
    return (
      <div style={{
        padding: '0.75rem 1rem',
        background: '#991b1b',
        color: '#fee2e2',
        borderRadius: '8px',
        fontWeight: 600,
      }}>
        There was an error processing your request. Please try again.
      </div>
    );
  }

  // Extract attachments from markdown images
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const attachments: Array<{ url: string; alt: string }> = [];
  let match;

  while ((match = imageRegex.exec(answer)) !== null) {
    const alt = match[1];
    const url = match[2];
    if (url.includes('/attachments/') || url.includes('/uploads/')) {
      attachments.push({ url, alt });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        style={{
          maxWidth: '100%',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: '#252525',
          color: '#e5e5e5',
          lineHeight: '1.6',
        }}
      >
        <Markdown>{answer}</Markdown>
      </div>

      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h4
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
            }}
          >
            🖼️ Attachments
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {attachments.map((attachment, index) => (
              <a
                key={`${attachment.url}-${index}`}
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: '96px',
                  height: '96px',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  display: 'block',
                  transition: 'border-color 0.2s',
                }}
                title={attachment.alt || 'Attachment'}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#2563eb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#333';
                }}
              >
                <img
                  src={attachment.url}
                  alt={attachment.alt || 'Attachment'}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {resources && resources.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h4
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
            }}
          >
            🔗 Resources
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {resources.map((resource) => (
              <a
                key={resource.id}
                href={`/api/resources/${resource.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '0.5rem 1rem',
                  background: '#374151',
                  color: '#e5e5e5',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  textDecoration: 'none',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#4b5563';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#374151';
                }}
              >
                {resource.name}
              </a>
            ))}
          </div>
        </div>
      )}

      {isCurrent && followUps && followUps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h4
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
            }}
          >
            💬 Follow Up Questions
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {followUps.map((followUp) => (
              <button
                key={followUp}
                onClick={() => onFollowUp(followUp)}
                style={{
                  padding: '0.75rem 1rem',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.2s',
                  whiteSpace: 'normal',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#1d4ed8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#2563eb';
                }}
              >
                {followUp}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMessage({ message }: { message: Message }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div
        style={{
          maxWidth: '80%',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: '#374151',
          color: '#e5e5e5',
          fontWeight: 600,
        }}
      >
        <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
      </div>
    </div>
  );
}

const defaultQuestions = [
  'How does GameGame work?',
  'Where can I find more information about this game?',
  'How does setup work?',
];

function ChatWidget({ gameId, gameName }: { gameId: string; gameName: string }) {
  const { messages, input, setInput, append, isLoading } = useChat({
    api: `/api/games/${gameId}/chat`,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      append({ role: 'user', content: input });
      setInput('');
    }
  };

  const handleFollowUp = (text: string) => {
    append({ role: 'user', content: text });
  };

  const handleDefaultQuestion = (question: string) => {
    append({ role: 'user', content: question });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#1a1a1a',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1.5rem',
              color: '#9ca3af',
            }}
          >
            <div style={{ fontSize: '4rem' }}>🎲</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
              {defaultQuestions.map((question) => (
                <button
                  key={question}
                  onClick={() => handleDefaultQuestion(question)}
                  style={{
                    padding: '0.75rem 1rem',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    whiteSpace: 'normal',
                    textAlign: 'center',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#1d4ed8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#2563eb';
                  }}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={message.id}>
            {message.role === 'user' ? (
              <UserMessage message={message} />
            ) : (
              <SystemMessage
                message={message}
                isStreaming={index === messages.length - 1 && isLoading}
                isCurrent={index === messages.length - 1}
                onFollowUp={handleFollowUp}
              />
            )}
          </div>
        ))}

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                background: '#252525',
                color: '#9ca3af',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#9ca3af',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#9ca3af',
                  animation: 'pulse 1.5s ease-in-out 0.2s infinite',
                }}
              />
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#9ca3af',
                  animation: 'pulse 1.5s ease-in-out 0.4s infinite',
                }}
              />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '1.5rem',
          borderTop: '1px solid #333',
          display: 'flex',
          gap: '0.75rem',
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask about ${gameName}...`}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            background: '#0a0a0a',
            border: '1px solid #333',
            borderRadius: '6px',
            color: '#e5e5e5',
            fontSize: '1rem',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          style={{
            padding: '0.75rem 1.5rem',
            background: isLoading || !input.trim() ? '#374151' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!isLoading && input.trim()) {
              e.currentTarget.style.background = '#1d4ed8';
            }
          }}
          onMouseLeave={(e) => {
            if (!isLoading && input.trim()) {
              e.currentTarget.style.background = '#2563eb';
            }
          }}
        >
          {isLoading ? '...' : 'Send'}
        </button>
      </form>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Mount the widget when the script loads
const container = document.getElementById('chat-widget');
if (container) {
  const gameId = container.dataset.gameId;
  const gameName = container.dataset.gameName || 'this game';
  if (gameId) {
    const root = ReactDOM.createRoot(container);
    root.render(
      <React.StrictMode>
        <ChatWidget gameId={gameId} gameName={gameName} />
      </React.StrictMode>
    );
  }
}
