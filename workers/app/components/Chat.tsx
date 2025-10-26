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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import {
  Dices,
  ExternalLink,
  ImageIcon,
  MessageCircle,
  MessageCircleQuestion,
} from 'lucide-react';
import { apiClient } from '../../load-context';

interface ParsedMessage {
  answer?: string;
  followUps?: string[] | Array<{ question: string; category?: string }>;
  resources?: Array<{ name: string; id: string }>;
  questionType?: 'gameplay' | 'knowledge' | 'external' | 'gamegame';
  // Optional enhanced fields from structuredAnswerSchema
  confidence?: 'high' | 'medium' | 'low';
  ambiguities?: string[];
  citations?: Array<{
    resourceId: string;
    resourceName: string;
    pageNumber?: number;
    pageRange?: [number, number];
    section?: string;
    quote?: string;
  }>;
}

// Component to render citation pill badge with tooltip
const CitationPill = ({
  number,
  citation
}: {
  number: number;
  citation?: {
    resourceName: string;
    pageNumber?: number;
    pageRange?: [number, number];
    section?: string;
    quote?: string;
  };
}) => {
  const tooltipContent = citation ? (
    <div className="max-w-xs">
      <div className="font-semibold">{citation.resourceName}</div>
      {citation.pageNumber && <div className="text-xs">Page {citation.pageNumber}</div>}
      {citation.pageRange && <div className="text-xs">Pages {citation.pageRange[0]}-{citation.pageRange[1]}</div>}
      {citation.section && <div className="text-xs text-gray-400">{citation.section}</div>}
      {citation.quote && <div className="mt-1 text-xs italic border-l-2 border-gray-600 pl-2">"{citation.quote}"</div>}
    </div>
  ) : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={`#cite-${number}`}
          className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-1.5 py-0.5 rounded no-underline transition-colors mx-0.5"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(`cite-${number}`)?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          {number}
        </a>
      </TooltipTrigger>
      {tooltipContent && (
        <TooltipContent side="top" className="max-w-xs">
          {tooltipContent}
        </TooltipContent>
      )}
    </Tooltip>
  );
};

// Component to render answer with inline citation pills
const AnswerWithCitations = ({
  answer,
  citations
}: {
  answer: string;
  citations?: ParsedMessage['citations'];
}) => {
  // Parse [1], [2], etc. and replace with citation pills
  const parts = answer.split(/(\[\d+\])/g);

  return (
    <div className="prose prose-invert lg:prose-base prose-sm">
      {parts.map((part, index) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (match) {
          const citationNumber = parseInt(match[1], 10);
          const citation = citations?.[citationNumber - 1]; // Array is 0-indexed
          return <CitationPill key={index} number={citationNumber} citation={citation} />;
        }
        // Render markdown for non-citation parts
        return <Markdown key={index}>{part}</Markdown>;
      })}
    </div>
  );
};

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

  const { answer, followUps, resources, confidence, ambiguities, citations } = parsed;

  // Use citations if available, otherwise fall back to resources
  const displayResources = citations || resources;

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
    <TooltipProvider>
      <div className="flex flex-col">
        <AnswerWithCitations answer={answer} citations={citations} />
      {confidence && confidence !== 'high' && (
        <div className="mt-3 text-sm text-yellow-400 bg-yellow-950/30 border border-yellow-900/50 rounded p-2">
          ⚠️ Confidence: {confidence}
        </div>
      )}
      {!!ambiguities?.length && (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <h4 className="text-xs font-bold uppercase tracking-tight text-yellow-400">
            ⚠️ Ambiguities
          </h4>
          <ul className="list-disc list-inside text-yellow-200/80 space-y-1">
            {ambiguities.map((amb, index) => (
              <li key={index}>{amb}</li>
            ))}
          </ul>
        </div>
      )}
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
      {!!displayResources?.length && (
        <div className="mt-4 flex flex-col gap-2 text-sm flex-wrap">
          <h4 className="text-xs font-bold uppercase tracking-tight text-muted-foreground inline-flex items-center gap-1.5">
            <ExternalLink className="w-3 h-3" />
            {citations ? 'Citations' : 'Resources'}
          </h4>
          <div className="flex flex-col gap-2 text-xs">
            {displayResources.map((resource: any, index) => {
              const isCitation = 'resourceId' in resource;
              const id = isCitation ? resource.resourceId : resource.id;
              const name = isCitation ? resource.resourceName : resource.name;

              // Format citation details
              let details = '';
              if (isCitation) {
                if (resource.pageNumber) {
                  details = ` (page ${resource.pageNumber})`;
                } else if (resource.pageRange) {
                  details = ` (pages ${resource.pageRange[0]}-${resource.pageRange[1]})`;
                }
                if (resource.section) {
                  details += ` - ${resource.section}`;
                }
              }

              return (
                <div
                  key={`${id}-${index}`}
                  id={`cite-${index + 1}`}
                  className="flex flex-row gap-2 items-start scroll-mt-4"
                >
                  <span className="inline-flex items-center justify-center bg-blue-600 text-white text-xs font-medium px-1.5 py-0.5 rounded min-w-[1.5rem] h-5">
                    {index + 1}
                  </span>
                  <div className="flex flex-col gap-1 flex-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="whitespace-normal h-auto py-2 text-left justify-start w-full"
                      onClick={() => onResourceClick(id)}
                    >
                      {name}{details}
                    </Button>
                    {isCitation && resource.quote && (
                      <p className="text-muted-foreground italic pl-3 border-l-2 border-muted text-xs">
                        "{resource.quote}"
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
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
            {followUps.map((followUp, index) => {
              // Handle both string format and structured object format
              const question = typeof followUp === 'string' ? followUp : followUp.question;
              const category = typeof followUp === 'object' && followUp.category ? followUp.category : null;

              return (
                <li key={`${question}-${index}`}>
                  <Button
                    variant="default"
                    size="sm"
                    className="whitespace-normal text-left py-2 block h-auto"
                    onClick={() => onFollowUp(question)}
                  >
                    {category && <span className="text-xs opacity-70">[{category}] </span>}
                    {question}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      </div>
    </TooltipProvider>
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
          const response = await apiClient.fetch(`/resources/${resourceId}`);
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
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <Dices className="w-12 h-12 text-muted-foreground" />
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
