'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useChat, type UIMessage } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import Markdown from 'react-markdown';
import { Link } from 'react-router';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent } from './ui/card';
import { Spinner } from './ui/spinner';
import {
  Dices,
  ExternalLink,
  ImageIcon,
  MessageCircle,
  MessageCircleQuestion,
} from 'lucide-react';

interface ParsedMessage {
  answer?: string;
  followUps?: string[];
  resources?: { name: string; id: string }[];
}

const SystemMessage = ({
  message,
  isStreaming,
  isCurrent,
  onFollowUp,
  onResourceClick,
}: {
  message: UIMessage;
  isStreaming: boolean;
  isCurrent: boolean;
  onFollowUp: (followUp: string) => void;
  onResourceClick: (resourceId: string) => void;
}) => {
  // Extract text content from message parts
  const textContent = message.parts
    ?.filter((part: any) => part.type === "text")
    .map((part: any) => (part.type === "text" ? part.text : ""))
    .join("");

  if (!textContent) {
    if (isStreaming) return null;
    console.error("no text content in message", message);
    return (
      <div className="bg-destructive text-destructive-foreground font-bold p-2 lg:p-3 rounded mb-4">
        There was an error processing your request. Please try again.
      </div>
    );
  }

  let parsed: ParsedMessage;
  try {
    parsed = JSON.parse(textContent);
  } catch (err) {
    if (isStreaming) return null;
    console.error("invalid payload", message);
    return (
      <div className="bg-destructive text-destructive-foreground font-bold p-2 lg:p-3 rounded mb-4">
        There was an error processing your request. Please try again.
      </div>
    );
  }

  const { answer, followUps, resources } = parsed;

  if (!answer) {
    console.error("no answer in JSON payload", message);
    return (
      <div className="bg-destructive text-destructive-foreground font-bold p-2 lg:p-3 rounded mb-4">
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
    <div className="flex flex-col">
      <div className="prose prose-invert lg:prose-base prose-sm">
        <Markdown>{answer}</Markdown>
      </div>
      {!!attachments.length && (
        <div className="mt-4 flex flex-col gap-2 text-sm">
          <h4 className="text-xs font-bold uppercase tracking-tight text-muted-foreground inline-flex items-center gap-1.5">
            <ImageIcon className="w-3 h-3" />
            Attachments
          </h4>
          <div className="flex flex-row gap-2 flex-wrap">
            {attachments.map((attachment, index) => (
              <a
                key={`${attachment.url}-${index}`}
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative w-24 h-24 border border-border rounded overflow-hidden hover:border-primary transition-colors"
                title={attachment.alt || 'Attachment'}
              >
                <img
                  src={attachment.url}
                  alt={attachment.alt || 'Attachment'}
                  className="w-full h-full object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      )}
      {!!resources?.length && (
        <div className="mt-4 flex flex-col gap-2 text-sm flex-wrap">
          <h4 className="text-xs font-bold uppercase tracking-tight text-muted-foreground inline-flex items-center gap-1.5">
            <ExternalLink className="w-3 h-3" />
            Resources
          </h4>
          <div className="flex flex-row gap-2 text-xs flex-wrap">
            {resources.map((resource) => (
              <Button
                key={resource.id}
                variant="secondary"
                size="sm"
                className="whitespace-normal h-auto py-2"
                onClick={() => onResourceClick(resource.id)}
              >
                {resource.name}
              </Button>
            ))}
          </div>
        </div>
      )}
      {isCurrent && !!followUps?.length && (
        <div className="mt-4 flex flex-col gap-2 text-sm flex-wrap">
          <h4 className="text-xs font-bold uppercase tracking-tight text-muted-foreground inline-flex items-center gap-1.5">
            <MessageCircleQuestion className="w-3 h-3" />
            Follow Ups
          </h4>
          <ul className="flex flex-col gap-2 text-sm flex-wrap">
            {followUps.map((followUp) => (
              <li key={followUp}>
                <Button
                  variant="default"
                  size="sm"
                  className="whitespace-normal text-left py-2 block h-auto"
                  onClick={() => onFollowUp(followUp)}
                >
                  {followUp}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const UserMessage = ({ message }: { message: UIMessage }) => {
  // Extract text from message parts
  const textContent = message.parts
    ?.filter((part: any) => part.type === "text")
    .map((part: any) => (part.type === "text" ? part.text : ""))
    .join("");

  return (
    <div className="font-semibold rounded bg-muted text-muted-foreground self-end p-2 lg:p-3">
      <div className="prose prose-invert lg:prose-base prose-sm">
        <Markdown>{textContent}</Markdown>
      </div>
    </div>
  );
};

const defaultQuestions = [
  'How does GameGame work?',
  'Where can I find more information about this game?',
  'How does setup work?',
];

export function Chat({
  game,
  imageError,
  setImageError,
}: {
  game: {
    id: string;
    name: string;
    imageUrl: string | null;
    bggUrl: string | null;
    resourceCount?: number;
  };
  imageError: boolean;
  setImageError: (error: boolean) => void;
}) {
  const [input, setInput] = useState("");
  const [resourceUrls, setResourceUrls] = useState<Record<string, string>>({});
  const [resourceError, setResourceError] = useState<string | null>(null);

  const {
    messages,
    error,
    sendMessage,
    status,
  } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/games/${game.id}/chat`,
    }),
  });

  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isLoading = status === "streaming" || status === "submitted";

  const visibleMessages = messages.filter(
    (m, index) => {
      const hasContent = m.parts && m.parts.length > 0;
      return (
        hasContent &&
        (index !== messages.length - 1 || !isLoading || m.role === "user")
      );
    }
  );

  useEffect(() => {
    setTimeout(() => ref.current?.scrollIntoView());
  }, [visibleMessages.length]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const openResource = useCallback(
    async (resourceId: string) => {
      try {
        let targetUrl = resourceUrls[resourceId];

        if (!targetUrl) {
          const response = await fetch(`/api/resources/${resourceId}`);
          if (!response.ok) {
            throw new Error(`Failed to load resource: ${response.status}`);
          }
          const data = await response.json() as { url?: string };
          if (!data?.url) {
            throw new Error('Resource missing URL');
          }
          targetUrl = String(data.url);
          setResourceUrls((prev) => ({ ...prev, [resourceId]: targetUrl }));
        }

        const resolvedUrl = targetUrl.startsWith('http')
          ? targetUrl
          : new URL(targetUrl, window.location.origin).toString();

        window.open(resolvedUrl, '_blank', 'noopener');
      } catch (error) {
        console.error('Failed to open resource', error);
        setResourceError('Unable to open the resource. Please try again later.');
      }
    },
    [resourceUrls]
  );

  return (
    <>
      <Card className="flex-1 flex absolute inset-0 max-w-full overflow-hidden w-full">
      <CardContent className="flex-1 flex items-stretch flex-col pt-20 lg:pt-32 pb-4 px-4">
        {error && (
          <div className="bg-destructive text-destructive-foreground font-bold p-2 lg:p-3 rounded mb-4">
            {error.message || 'An error occurred'}
          </div>
        )}
        {resourceError && (
          <div className="bg-destructive text-destructive-foreground font-bold p-2 lg:p-3 rounded mb-4 flex items-center justify-between">
            <span>{resourceError}</span>
            <button
              onClick={() => setResourceError(null)}
              className="hover:opacity-80 transition-opacity"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto mb-4 gap-6 flex flex-col">
          {visibleMessages.length > 0 ? (
            visibleMessages.map((m, index) => (
              <div key={m.id} className="flex flex-col gap-0">
                {m.role === 'user' ? (
                  <UserMessage message={m} />
                ) : (
                  <SystemMessage
                    message={m}
                    isStreaming={index === visibleMessages.length - 1 && isLoading}
                    isCurrent={index === visibleMessages.length - 1}
                    onFollowUp={(followUp) => {
                      sendMessage({ text: followUp });
                    }}
                    onResourceClick={openResource}
                  />
                )}
              </div>
            ))
          ) : (
            <div className="flex-1 flex flex-col gap-6 items-center justify-center text-muted-foreground lg:text-lg">
              <Dices className="w-24 h-24" />
              <ul className="flex flex-col items-center gap-2 text-sm flex-wrap">
                {defaultQuestions.map((question) => (
                  <li key={question}>
                    <Button
                      variant="default"
                      size="sm"
                      className="whitespace-normal text-left py-2 block h-auto"
                      onClick={() => {
                        sendMessage({ text: question });
                      }}
                    >
                      {question}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isLoading && (
            <div>
              <div className="inline-flex flex-row items-center bg-muted text-muted-foreground rounded p-2 lg:p-3">
                <Spinner size="sm" />
              </div>
            </div>
          )}

          <div ref={ref} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) {
              sendMessage({ text: input });
              setInput("");
            }
          }}
          className="flex items-center gap-2 h-12"
        >
          <Input
            className="bg-background text-foreground placeholder-text-muted-foreground px-3 py-3 lg:py-5 h-full lg:text-base text-lg"
            value={input}
            placeholder={`Ask about ${game.name}...`}
            onChange={(e) => setInput(e.target.value)}
            ref={inputRef}
          />
          <Button type="submit" disabled={isLoading} className="gap-2 h-full">
            <MessageCircle className="w-5 h-5" />
            <span className="hidden lg:inline">Ask</span>
          </Button>
        </form>
      </CardContent>
    </Card>
    <div className="flex justify-between items-center h-16 lg:h-24 overflow-hidden absolute top-0 left-0 right-0 pl-4 lg:px-4 gap-4 border-b bg-card">
      <div className="flex items-end gap-4 overflow-hidden whitespace-nowrap">
        <div className="w-8 h-8 lg:w-20 lg:h-20 relative">
          {game.imageUrl && !imageError ? (
            <img
              src={game.imageUrl}
              alt={game.name}
              className="w-full h-full object-cover object-top"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
              🎲
            </div>
          )}
        </div>

        <div>
          <h2 className="text-xl lg:text-3xl font-bold">{game.name}</h2>
          <div className="gap-4 items-center hidden lg:flex">
            {!!game.bggUrl && (
              <a
                href={game.bggUrl}
                className="group"
                target="_blank"
                rel="noopener noreferrer"
                title={`${game.name} on Board Game Geek`}
              >
                <img
                  src="/bgg.png"
                  alt="Board Game Geek"
                  className="w-5 h-5 grayscale group-hover:grayscale-0 rounded"
                />
              </a>
            )}
            <p className="text-muted-foreground text-sm hidden lg:block">
              {game.resourceCount || 0} resources{' '}
              <Button
                size="sm"
                variant="link"
                onClick={() => {
                  sendMessage({ text: 'What resources are you using?' });
                }}
              >
                What are they?
              </Button>
            </p>
          </div>
        </div>
      </div>
      <Link to="/games">
        <Button variant="ghost">
          <span className="text-2xl">✕</span>
          <span className="sr-only">Close chat</span>
        </Button>
      </Link>
    </div>
  </>
  );
}
