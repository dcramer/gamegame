'use client';

import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import Link from 'next/link';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent } from './ui/card';
import { Spinner } from './ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import {
  Dices,
  ImageIcon,
  MessageCircle,
  MessageCircleQuestion,
  Search,
  FileText,
  Brain,
  Settings,
  ExternalLink,
} from 'lucide-react';
import { useGameChat } from '@/lib/hooks/useGameChat';
import type { ChatMessage, MessageTokenUsage } from '@/lib/hooks/useAgentChat';

// Content block types for mixed media responses
type TextBlock = {
  type: 'text';
  text: string;
};

type ImageBlock = {
  type: 'image';
  id: string;
  source: {
    url: string;
    r2Key: string | null;
  };
  caption: string | null;
  pageNumber: number | null;
};

type ContentBlock = TextBlock | ImageBlock;

interface ParsedMessage {
  content?: ContentBlock[];
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
    relevance?: 'primary' | 'supporting' | 'related';
  }>;
}

// Component to render inline citation link with tooltip
const CitationLink = ({
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
    relevance?: 'primary' | 'supporting' | 'related';
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

  const anchorId = `citation-${number}`;
  const locationLabel = citation
    ? citation.pageRange && citation.pageRange.length === 2
      ? `pp${citation.pageRange[0]}-${citation.pageRange[1]}`
      : citation.pageNumber
      ? `p${citation.pageNumber}`
      : null
    : null;
  const pillLabel = citation
    ? [citation.resourceName, locationLabel].filter(Boolean).join(', ')
    : `Source ${number}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex align-middle">
          <a
            href={`#${anchorId}`}
            className="inline-flex items-center justify-center gap-1 mx-1 text-[0.7rem] leading-none font-semibold uppercase tracking-wide text-muted-foreground hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label={`Jump to citation ${number}`}
          >
            <span className="sr-only">Citation {number}: </span>
            {pillLabel}
          </a>
        </span>
      </TooltipTrigger>
      {tooltipContent && (
        <TooltipContent side="top" className="max-w-xs">
          {tooltipContent}
        </TooltipContent>
      )}
    </Tooltip>
  );
};

// Component to render answer with inline citation links
const AnswerWithCitations = ({
  answer,
  citations
}: {
  answer: string;
  citations?: ParsedMessage['citations'];
}) => {
  const citationSplitRegex = /(\[\d+\])/g;
  const citationExactRegex = /^\[(\d+)\]$/;
  let citationKey = 0;

  const renderCitationNodes = (node: any): any => {
    if (typeof node === 'string') {
      const parts = node.split(citationSplitRegex);
      const elements: any[] = [];

      for (let idx = 0; idx < parts.length; idx++) {
        const part = parts[idx];
        const match = part.match(citationExactRegex);
        if (match) {
          const citationNumber = parseInt(match[1], 10);
          const citation = citations?.[citationNumber - 1];
          const keyBase = `citation-${citationKey++}`;
          let punctuation = '';
          const nextPart = parts[idx + 1];
          if (typeof nextPart === 'string' && nextPart.length) {
            const punctMatch = nextPart.match(/^([.,!?;:]+)(.*)$/);
            if (punctMatch) {
              punctuation = punctMatch[1];
              parts[idx + 1] = punctMatch[2];
            }
          }

          if (punctuation) {
            elements.push(
              <span key={`${keyBase}-punct`}>{punctuation}</span>
            );
          }

          const prevPart = parts[idx - 1];
          let needsSpaceBefore = false;
          if (punctuation) {
            needsSpaceBefore = true;
          } else if (typeof prevPart === 'string' && prevPart.length > 0) {
            const prevChar = prevPart[prevPart.length - 1];
            needsSpaceBefore = !/\s/.test(prevChar);
          } else if (elements.length > 0) {
            needsSpaceBefore = true;
          }

          if (needsSpaceBefore) {
            elements.push(
              <span key={`${keyBase}-space`}>&nbsp;</span>
            );
          }

          elements.push(
            <CitationLink key={keyBase} number={citationNumber} citation={citation} />
          );
        } else if (part !== '') {
          elements.push(<span key={`text-${idx}`}>{part}</span>);
        }
      }

      return elements;
    }

    if (Array.isArray(node)) {
      return node.map((n, idx) => <span key={idx}>{renderCitationNodes(n)}</span>);
    }

    if (
      isValidElement(node) &&
      (typeof node.type !== 'string' || (node.type !== 'code' && node.type !== 'pre'))
    ) {
      const element = node as ReactElement<{ children?: ReactNode }>;
      if (!element.props?.children) {
        return node;
      }

      return cloneElement(
        element,
        element.props,
        renderCitationNodes(element.props.children)
      );
    }

    return node;
  };

  // Custom text renderer that handles citation links inline
  const components = {
    // Override text-heavy elements to handle citations
    p: ({ children, ...props }: any) => {
      const processedChildren = renderCitationNodes(children);
      return <p {...props}>{processedChildren}</p>;
    },
    li: ({ children, ...props }: any) => {
      const processedChildren = renderCitationNodes(children);
      return <li {...props}>{processedChildren}</li>;
    },
    blockquote: ({ children, ...props }: any) => {
      const processedChildren = renderCitationNodes(children);
      return <blockquote {...props}>{processedChildren}</blockquote>;
    },
    h1: ({ children, ...props }: any) => {
      const processedChildren = renderCitationNodes(children);
      return <h1 {...props}>{processedChildren}</h1>;
    },
    h2: ({ children, ...props }: any) => {
      const processedChildren = renderCitationNodes(children);
      return <h2 {...props}>{processedChildren}</h2>;
    },
    h3: ({ children, ...props }: any) => {
      const processedChildren = renderCitationNodes(children);
      return <h3 {...props}>{processedChildren}</h3>;
    },
    h4: ({ children, ...props }: any) => {
      const processedChildren = renderCitationNodes(children);
      return <h4 {...props}>{processedChildren}</h4>;
    },
    h5: ({ children, ...props }: any) => {
      const processedChildren = renderCitationNodes(children);
      return <h5 {...props}>{processedChildren}</h5>;
    },
    h6: ({ children, ...props }: any) => {
      const processedChildren = renderCitationNodes(children);
      return <h6 {...props}>{processedChildren}</h6>;
    },
    ul: ({ children, ...props }: any) => <ul {...props}>{children}</ul>,
    ol: ({ children, ...props }: any) => <ol {...props}>{children}</ol>,
    code: ({ children, ...props }: any) => <code {...props}>{children}</code>,
    pre: ({ children, ...props }: any) => <pre {...props}>{children}</pre>,
    a: ({ children, ...props }: any) => <a {...props}>{children}</a>,
    strong: ({ children, ...props }: any) => <strong {...props}>{children}</strong>,
    em: ({ children, ...props }: any) => <em {...props}>{children}</em>,
  };

  return (
    <div className="prose prose-invert lg:prose-base prose-sm max-w-none">
      <Markdown components={components}>{answer}</Markdown>
    </div>
  );
};

// Component to render a single tool-call message
const ToolCallMessage = ({ message }: { message: Extract<ChatMessage, { type: 'tool-call' }> }) => {
  const isActive = message.status === 'running';
  const duration = message.durationMs;

  const getToolIcon = (name: string, isActive: boolean) => {
    if (isActive) {
      return <Spinner size="sm" className="w-3 h-3" />;
    }
    // Use lucide icons for tools
    if (name === 'search_resources') return <Search className="w-3 h-3" />;
    if (name === 'search_images') return <ImageIcon className="w-3 h-3" />;
    if (name === 'list_resources') return <FileText className="w-3 h-3" />;
    if (name === 'get_attachment') return <ImageIcon className="w-3 h-3" />;
    // Generic completed icon
    return <span className="w-3 h-3 text-green-500">✓</span>;
  };

  const getToolLabel = (name: string, args?: any) => {
    if (name === 'search_resources') return 'Searching rulebook';
    if (name === 'search_images') return 'Searching for images';
    if (name === 'list_resources') return 'Checking available resources';
    if (name === 'get_attachment') {
      // Include attachment ID in the label to differentiate multiple image loads
      const id = args?.attachmentId ? `#${args.attachmentId.slice(0, 8)}` : '';
      return `Loading image ${id}`;
    }
    return name;
  };

  const getToolParams = (name: string, args?: any): string | null => {
    if (!args) return null;

    // Format search queries
    if (name === 'search_resources' || name === 'search_images') {
      return args.query ? `"${args.query}"` : null;
    }

    // Don't show params for get_attachment since ID is now in label
    // No params for list_resources
    return null;
  };

  // Regular tool rendering - with background and border
  // Layout: [icon] [tool name --- duration]
  //                [tool description]
  const toolParams = getToolParams(message.name, message.args);

  return (
    <div className="flex items-start gap-2 p-2 bg-muted/30 rounded border border-muted text-muted-foreground">
      {/* First column: icon */}
      <div className="shrink-0 mt-0.5">
        {getToolIcon(message.name, isActive)}
      </div>

      {/* Second column: everything else */}
      <div className="flex-1 flex flex-col gap-1">
        {/* First line: tool name and duration */}
        <div className="flex items-center gap-2">
          <span className="text-xs">{getToolLabel(message.name, message.args)}</span>
          {duration && (
            <span className="text-muted-foreground/50 text-xs ml-auto">
              {duration}ms
            </span>
          )}
          {isActive && !duration && <span className="text-muted-foreground/50 text-xs ml-auto">...</span>}
        </div>

        {/* Second line: tool params/description if present */}
        {toolParams && (
          <div className="text-muted-foreground/60 text-xs">
            {toolParams}
          </div>
        )}
      </div>
    </div>
  );
};

const tokenNumberFormatter = new Intl.NumberFormat('en-US');

const formatConfidenceLabel = (confidence?: 'high' | 'medium' | 'low') => {
  if (!confidence) {
    return '—';
  }

  return confidence.charAt(0).toUpperCase() + confidence.slice(1);
};

const formatResponseDurationLabel = (durationMs?: number | null) => {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
    return undefined;
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  const seconds = durationMs / 1000;
  const precision = seconds >= 10 ? 0 : 1;
  return `${seconds.toFixed(precision)} s`;
};

const formatTokensLabel = (tokens?: MessageTokenUsage | null) => {
  if (!tokens) {
    return undefined;
  }

  const parts: string[] = [];

  if (tokens.inputTokens != null) {
    parts.push(`${tokenNumberFormatter.format(tokens.inputTokens)} in`);
  }

  if (tokens.outputTokens != null) {
    parts.push(`${tokenNumberFormatter.format(tokens.outputTokens)} out`);
  }

  if (tokens.totalTokens != null) {
    parts.push(`${tokenNumberFormatter.format(tokens.totalTokens)} total`);
  }

  if (!parts.length) {
    return undefined;
  }

  return parts.join(' · ');
};

const getFallbackResponseTimeMs = (messages: ChatMessage[], index: number) => {
  const current = messages[index];
  if (!current || current.type !== 'assistant') {
    return undefined;
  }

  for (let i = index - 1; i >= 0; i--) {
    const candidate = messages[i];
    if (candidate.type === 'user') {
      return current.timestamp - candidate.timestamp;
    }
  }

  return undefined;
};

const SystemMessage = ({
  message,
  isCurrent,
  onFollowUp,
  fallbackResponseTimeMs,
}: {
  message: Extract<ChatMessage, { type: 'assistant' }>;
  isCurrent: boolean;
  onFollowUp: (followUp: string) => void;
  fallbackResponseTimeMs?: number;
}) => {
  const textContent = message.content;

  if (!textContent) {
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
    // JSON parse errors during streaming are expected (incomplete/interrupted responses)
    // Don't log - just show error to user
    return (
      <div className="bg-destructive text-destructive-foreground font-bold p-2 lg:p-3 rounded mb-4">
        There was an error processing your request. Please try again.
      </div>
    );
  }

  const { content, followUps, confidence, ambiguities, citations } = parsed;

  if (!content || content.length === 0) {
    console.error("no content in JSON payload", message);
    return (
      <div className="bg-destructive text-destructive-foreground font-bold p-2 lg:p-3 rounded mb-4">
        There was an error processing your request. Please try again.
      </div>
    );
  }

  // Separate content blocks by type for rendering
  const imageBlocks = content.filter((block): block is ImageBlock => block.type === 'image');
  const responseTimeMs = message.metadata?.responseTimeMs ?? fallbackResponseTimeMs ?? null;
  const metadataLine = [
    `Confidence: ${formatConfidenceLabel(confidence)}`,
    `Response: ${formatResponseDurationLabel(responseTimeMs) ?? '—'}`,
    `Tokens: ${formatTokensLabel(message.metadata?.tokens) ?? '—'}`,
  ].join(' • ');

  return (
    <TooltipProvider>
      <div className="flex flex-col">
        {citations?.length ? (
          <div className="sr-only" aria-hidden="true">
            {citations.map((_, index) => (
              <span key={`citation-anchor-${index}`} id={`citation-${index + 1}`} />
            ))}
          </div>
        ) : null}
        {/* Render content blocks in sequence */}
        <div className="flex flex-col gap-3">
          {content.map((block, index) => {
            if (block.type === 'text') {
              return (
                <div key={index}>
                  <AnswerWithCitations answer={block.text} citations={citations} />
                </div>
              );
            } else if (block.type === 'image') {
              return (
                <div key={index} className="my-2">
                  <a
                    href={block.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block border border-border rounded overflow-hidden hover:border-primary transition-colors max-w-full"
                  >
                    <img
                      src={block.source.url}
                      alt={block.caption || 'Diagram'}
                      className="max-w-2xl max-h-96 object-contain"
                    />
                    {block.caption && (
                      <div className="text-xs text-muted-foreground p-2 bg-muted/30">
                        {block.caption}
                        {block.pageNumber && ` (page ${block.pageNumber})`}
                      </div>
                    )}
                  </a>
                </div>
              );
            }
            return null;
          })}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          {metadataLine}
        </div>
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
      {!!imageBlocks.length && (
        <div className="mt-4 flex flex-col gap-2 text-sm">
          <h4 className="text-xs font-bold uppercase tracking-tight text-muted-foreground inline-flex items-center gap-1.5">
            <ImageIcon className="w-3 h-3" />
            Attachments ({imageBlocks.length})
          </h4>
          <div className="flex flex-row gap-2 flex-wrap">
            {imageBlocks.map((block, index) => (
              <a
                key={`${block.id}-${index}`}
                href={block.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative w-24 h-24 border border-border rounded overflow-hidden hover:border-primary transition-colors"
                title={block.caption || 'Attachment'}
              >
                <img
                  src={block.source.url}
                  alt={block.caption || 'Attachment'}
                  className="w-full h-full object-cover"
                />
              </a>
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

const UserMessage = ({ message }: { message: Extract<ChatMessage, { type: 'user' }> }) => {
  return (
    <div className="font-semibold rounded bg-muted text-muted-foreground self-end p-2 lg:p-3">
      <div className="prose prose-invert lg:prose-base prose-sm max-w-none">
        <Markdown>{message.content}</Markdown>
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
  isAdmin = false,
}: {
  game: {
    id: string;
    name: string;
    imageUrl: string | null;
    bggUrl: string | null;
    resourceCount?: number;
    bggGame?: {
      yearPublished: number | null;
      minPlayers: number | null;
      maxPlayers: number | null;
      playingTime: number | null;
      designers: string[] | null;
      publishers: string[] | null;
    } | null;
  };
  isAdmin?: boolean;
}) {
  const [input, setInput] = useState("");
  const [imageError, setImageError] = useState(false);

  const {
    messages,
    error,
    sendMessage,
    stop,
    isLoading,
  } = useGameChat({
    api: `/api/games/${game.id}/chat`,
    onError: (err) => {
      console.error('Chat error:', err);
    },
  });

  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // All messages are visible with the new format
  const visibleMessages = messages;

  useEffect(() => {
    setTimeout(() => ref.current?.scrollIntoView());
  }, [visibleMessages.length]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  return (
    <>
      <Card className="flex-1 flex absolute inset-0 max-w-full overflow-hidden w-full">
      <CardContent className="flex-1 flex items-stretch flex-col pt-20 lg:pt-32 pb-4 px-4">
        {error && (
          <div className="bg-destructive text-destructive-foreground font-bold p-2 lg:p-3 rounded mb-4">
            {error.message || 'An error occurred'}
          </div>
        )}

        <div className="flex-1 overflow-y-auto mb-4 gap-y-4 flex flex-col">
          {visibleMessages.length > 0 ? (
            <>
              {visibleMessages.map((m, index) => {
                // Render based on message type
                if (m.type === 'user') {
                  return <UserMessage key={m.id} message={m} />;
                } else if (m.type === 'tool-call') {
                  return <ToolCallMessage key={m.id} message={m} />;
                } else if (m.type === 'assistant') {
                  const fallbackResponseTimeMs = getFallbackResponseTimeMs(visibleMessages, index);
                  return (
                    <SystemMessage
                      key={m.id}
                      message={m}
                      isCurrent={index === visibleMessages.length - 1}
                      onFollowUp={(followUp) => {
                        sendMessage(followUp);
                      }}
                      fallbackResponseTimeMs={fallbackResponseTimeMs}
                    />
                  );
                }
                return null;
              })}

              {/* Show generic thinking indicator while loading if no tool calls are visible */}
              {isLoading && !messages.some(m => m.type === 'tool-call' && m.status === 'running') && (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Brain className="w-3 h-3 animate-pulse" />
                  <span>Thinking...</span>
                </div>
              )}
            </>
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
                        sendMessage(question);
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
              sendMessage(input);
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
          <div className="flex items-center gap-2">
            <h2 className="text-xl lg:text-3xl font-bold">{game.name}</h2>
            {!!game.bggUrl && (
              <a
                href={game.bggUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`View ${game.name} on BoardGameGeek`}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-4 h-4 lg:w-5 lg:h-5" />
              </a>
            )}
          </div>
          <div className="gap-4 items-center hidden lg:flex">
            {game.bggGame && (
              <div className="flex gap-3 text-muted-foreground text-sm items-center">
                {game.bggGame.yearPublished && (
                  <span>{game.bggGame.yearPublished}</span>
                )}
                {(game.bggGame.minPlayers || game.bggGame.maxPlayers) && (
                  <span>
                    {game.bggGame.minPlayers === game.bggGame.maxPlayers
                      ? `${game.bggGame.minPlayers} players`
                      : `${game.bggGame.minPlayers || '?'}-${game.bggGame.maxPlayers || '?'} players`}
                  </span>
                )}
                {game.bggGame.playingTime && (
                  <span>{game.bggGame.playingTime} min</span>
                )}
              </div>
            )}
            <p className="text-muted-foreground text-sm hidden lg:block">
              <Button
                size="sm"
                variant="link"
                onClick={() => {
                  sendMessage('What resources are you using?');
                }}
                className="p-0 h-auto"
              >
                {game.resourceCount || 0} resources
              </Button>
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {isAdmin && (
          <Link href={`/admin/games/${game.id}`}>
            <Button variant="ghost" size="sm" title="Edit game">
              <Settings className="w-5 h-5" />
              <span className="sr-only">Edit game</span>
            </Button>
          </Link>
        )}
        <Link href="/games">
          <Button variant="ghost">
            <span className="text-2xl">✕</span>
            <span className="sr-only">Close chat</span>
          </Button>
        </Link>
      </div>
    </div>
  </>
  );
}
