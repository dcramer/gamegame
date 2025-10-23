import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useChat, type Message } from '@ai-sdk/react';

// Lightweight markdown renderer (subset of markdown features we care about)
function Markdown({ children }: { children: string }) {
  const html = useMemo(() => {
    return children
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline">$1</a>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="mt-2 rounded" />')
      .replace(/\n/g, '<br />');
  }, [children]);

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
  const content = message.content ?? '';

  if (!content) {
    if (isStreaming) return null;
    return (
      <div className="rounded-lg bg-red-900/70 px-4 py-3 text-sm font-semibold text-red-100">
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
      <div className="rounded-lg bg-red-900/70 px-4 py-3 text-sm font-semibold text-red-100">
        There was an error processing your request. Please try again.
      </div>
    );
  }

  const { answer, followUps, resources } = parsed;

  if (!answer) {
    return (
      <div className="rounded-lg bg-red-900/70 px-4 py-3 text-sm font-semibold text-red-100">
        There was an error processing your request. Please try again.
      </div>
    );
  }

  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const attachments: Array<{ url: string; alt: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = imageRegex.exec(answer)) !== null) {
    const alt = match[1];
    const url = match[2];
    if (url.includes('/attachments/') || url.includes('/uploads/')) {
      attachments.push({ url, alt });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-full rounded-lg bg-zinc-800/80 px-4 py-3 text-sm leading-relaxed text-zinc-100">
        <Markdown>{answer}</Markdown>
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-col gap-2 text-sm">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-tight text-zinc-400">
            <span role="img" aria-hidden="true">
              🖼️
            </span>
            Attachments
          </h4>
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, index) => (
              <a
                key={`${attachment.url}-${index}`}
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block h-24 w-24 overflow-hidden rounded border border-zinc-700 transition hover:border-blue-500"
                title={attachment.alt || 'Attachment'}
              >
                <img
                  src={attachment.url}
                  alt={attachment.alt || 'Attachment'}
                  className="h-full w-full object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {resources && resources.length > 0 && (
        <div className="flex flex-col gap-2 text-sm">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-tight text-zinc-400">
            <span role="img" aria-hidden="true">
              🔗
            </span>
            Resources
          </h4>
          <div className="flex flex-wrap gap-2">
            {resources.map((resource) => (
              <a
                key={resource.id}
                href={`/uploads/resources/${resource.id}/source.pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md bg-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-600"
              >
                {resource.name}
              </a>
            ))}
          </div>
        </div>
      )}

      {isCurrent && followUps && followUps.length > 0 && (
        <div className="flex flex-col gap-2 text-sm">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-tight text-zinc-400">
            <span role="img" aria-hidden="true">
              💬
            </span>
            Follow Up Questions
          </h4>
          <div className="flex flex-col gap-2">
            {followUps.map((followUp) => (
              <button
                key={followUp}
                type="button"
                onClick={() => onFollowUp(followUp)}
                className="whitespace-normal rounded-md bg-blue-600 px-4 py-2 text-left text-sm font-medium text-white transition hover:bg-blue-500"
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
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-lg bg-zinc-700 px-4 py-2 font-semibold text-zinc-100">
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
      </div>
    </div>
  );
}

const defaultQuestions = [
  'How does GameGame work?',
  'Where can I find more information about this game?',
  'How does setup work?',
];

interface GameDetails {
  id: string;
  name: string;
  imageUrl: string | null;
  bggUrl: string | null;
  resourceCount?: number;
}

function ChatWidget({ gameId, gameName }: { gameId: string; gameName: string }) {
  const { messages, input, setInput, append, isLoading } = useChat({
    api: `/api/games/${gameId}/chat`,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [gameDetails, setGameDetails] = useState<GameDetails | null>(null);
  const [imageError, setImageError] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);
  const [loadingGame, setLoadingGame] = useState(true);

  useEffect(() => {
    const node = messagesEndRef.current;
    node?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingGame(true);
    setImageError(false);

    fetch(`/api/games/${gameId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load game: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data?.error) {
          throw new Error(String(data.error));
        }
        setGameDetails({
          id: data.id,
          name: data.name,
          imageUrl: data.imageUrl ?? null,
          bggUrl: data.bggUrl ?? null,
          resourceCount: data.resourceCount ?? data._count?.resources ?? 0,
        });
        setGameError(null);
        setLoadingGame(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to fetch game details', err);
        setGameError('Unable to load game details.');
        setLoadingGame(false);
      });

    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    append({ role: 'user', content: input });
    setInput('');
  };

  const handleFollowUp = (text: string) => {
    append({ role: 'user', content: text });
  };

  const handleDefaultQuestion = (question: string) => {
    append({ role: 'user', content: question });
  };

  const handleResourceQuestion = () => {
    append({ role: 'user', content: 'What resources are you using?' });
  };

  const displayName = gameDetails?.name || gameName;
  const resourceCount =
    typeof gameDetails?.resourceCount === 'number' ? gameDetails.resourceCount : undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg bg-zinc-900 text-zinc-100">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-950 px-6 py-4">
        <div className="flex items-end gap-4 overflow-hidden whitespace-nowrap">
          <div className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800">
            {gameDetails?.imageUrl && !imageError ? (
              <img
                src={gameDetails.imageUrl}
                alt={displayName}
                className="h-full w-full object-cover object-top"
                onError={() => setImageError(true)}
              />
            ) : (
              <span className="text-2xl">🎲</span>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="truncate text-xl font-bold text-zinc-50" title={displayName}>
              {displayName}
            </h2>
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              {gameDetails?.bggUrl && (
                <a
                  href={gameDetails.bggUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center"
                  title={`${displayName} on BoardGameGeek`}
                >
                  <img
                    src="/bgg.png"
                    alt="Board Game Geek"
                    className="h-5 w-5 rounded transition hover:grayscale-0 grayscale"
                  />
                </a>
              )}

              {typeof resourceCount === 'number' && !Number.isNaN(resourceCount) && (
                <span className="inline-flex items-center gap-2">
                  <span>{resourceCount} resources</span>
                  <button
                    type="button"
                    onClick={handleResourceQuestion}
                    disabled={isLoading}
                    className="text-xs font-semibold underline transition disabled:cursor-not-allowed disabled:text-zinc-600 hover:text-blue-300"
                  >
                    What are they?
                  </button>
                </span>
              )}
            </div>

            {gameError && (
              <p className="text-xs text-red-400">{gameError}</p>
            )}
          </div>
        </div>

        {loadingGame && <span className="text-xs text-zinc-500">Loading…</span>}
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 && !isLoading ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-zinc-400">
            <div className="text-6xl">🎲</div>
            <ul className="flex flex-col items-center gap-3 text-sm">
              {defaultQuestions.map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    onClick={() => handleDefaultQuestion(question)}
                    className="whitespace-normal rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                  >
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((message, index) => (
              <div key={message.id} className="flex flex-col gap-2">
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
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-500" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-500 delay-150" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-500 delay-300" />
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-3 border-t border-zinc-800 bg-zinc-900 px-6 py-4"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask about ${displayName}...`}
          disabled={isLoading}
          className="flex-1 rounded-md border border-zinc-700 bg-black/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

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
