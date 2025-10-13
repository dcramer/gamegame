"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dices,
  ExternalLink,
  ImageIcon,
  LoaderCircleIcon,
  MessageCircle,
  MessageCircleQuestion,
  X,
} from "lucide-react";
import Link from "next/link";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Markdown from "react-markdown";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import LoadingIndicator from "./loadingIndicator";

const defaultQuestions = [
  "How does GameGame work?",
  "Where can I find more information about this game?",
  "How does setup work?",
];

const SystemMessage = ({
  message,
  isStreaming,
  isCurrent,
  onFollowUp,
}: {
  message: UIMessage;
  isStreaming: boolean;
  isCurrent: boolean;
  onFollowUp: (followUp: string) => void;
}) => {
  // Extract text content from message parts
  const textContent = message.parts
    ?.filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");

  if (!textContent) {
    if (isStreaming) return null;
    console.error("no text content in message", message);
    return (
      <ErrorMessage
        error={
          new Error(
            "There was an error processing your request. Please try again."
          )
        }
      />
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(textContent);
  } catch (err) {
    if (isStreaming) return null;
    console.error("invalid payload", message);
    return (
      <ErrorMessage
        error={
          new Error(
            "There was an error processing your request. Please try again.",
            {
              cause: err,
            }
          )
        }
      />
    );
  }

  const { answer, followUps, resources } = parsed as {
    answer?: string;
    followUps?: string[];
    resources?: { name: string; id: string }[];
  };
  if (!answer) {
    console.error("no answer in JSON payload", message);
    return (
      <ErrorMessage
        error={
          new Error(
            "There was an error processing your request. Please try again."
          )
        }
      />
    );
  }

  // Extract attachment URLs from markdown
  // Match markdown images: ![alt](url) where url contains /attachments/
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const attachments: Array<{ url: string; alt: string }> = [];
  let match;

  while ((match = imageRegex.exec(answer)) !== null) {
    const alt = match[1];
    const url = match[2];

    // Only include URLs that are attachments (contain /attachments/ in path)
    if (url.includes('/attachments/')) {
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
                title={attachment.alt || "Attachment"}
              >
                <Image
                  src={attachment.url}
                  alt={attachment.alt || "Attachment"}
                  fill
                  style={{
                    objectFit: "cover",
                  }}
                  sizes="96px"
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
          <ul className="flex flex-row gap-2 text-xs flex-wrap">
            {resources.map((resource) => (
              <li key={resource.id}>
                <Button variant="secondary" size="sm" asChild>
                  <a
                    href={`/resources/${resource.id}/download`}
                    target="_blank"
                  >
                    {resource.name}
                  </a>
                </Button>
              </li>
            ))}
          </ul>
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
  const textContent = message.parts
    ?.filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");

  return (
    <div className="font-semibold rounded bg-muted text-muted-foreground self-end p-2 lg:p-3">
      <div className="prose prose-invert lg:prose-base prose-sm">
        <Markdown>{textContent}</Markdown>
      </div>
    </div>
  );
};

const ErrorMessage = ({ error }: { error: Error }) => {
  let message;
  if (error.message.includes("Rate limit exceeded")) {
    message = "Rate limit exceeded. Try again in a bit.";
  } else {
    message = error.toString();
  }

  return (
    <div className="bg-destructive text-destructive-foreground font-bold p-2 lg:p-3 rounded mb-4">
      {message}
    </div>
  );
};

export function Chat({
  game,
}: {
  game: {
    id: string;
    name: string;
    imageUrl: string | null;
    bggUrl: string | null;
    resourceCount: number;
  };
}) {
  const [input, setInput] = useState("");

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

  return (
    <>
      <Card className="flex-1 flex absolute inset-0 max-w-full overflow-hidden w-full">
        <CardContent className="flex-1 flex items-stretch flex-col pt-20 lg:pt-32 pb-4 px-4">
          {error && <ErrorMessage error={error} />}
          <div className="flex-1 overflow-y-auto mb-4 gap-2 flex flex-col">
            <AnimatePresence>
              {visibleMessages.length > 0 ? (
                visibleMessages.map((m, index) => (
                  <motion.div
                    key={m.id}
                    className="flex flex-col gap-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {m.role === "user" ? (
                      <UserMessage message={m} />
                    ) : (
                      <SystemMessage
                        message={m}
                        isStreaming={
                          index === visibleMessages.length - 1 && isLoading
                        }
                        isCurrent={index === visibleMessages.length - 1}
                        onFollowUp={(followUp) => {
                          sendMessage({ text: followUp });
                        }}
                      />
                    )}
                  </motion.div>
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
            </AnimatePresence>
            {isLoading && (
              <div>
                <div className="inline-flex flex-row items-center bg-muted text-muted-foreground rounded p-2 lg:p-3">
                  <LoadingIndicator />
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
              {!isLoading ? (
                <MessageCircle className="w-5 h-5" />
              ) : (
                <LoaderCircleIcon className="w-5 h-5 animate-spin" />
              )}
              <span className="hidden lg:inline">Ask</span>
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="flex justify-between items-center h-16 lg:h-24 overflow-hidden absolute top-0 left-0 right-0 pl-4 lg:px-4 gap-4 border-b bg-card">
        <div className="flex items-end gap-4 overflow-hidden whitespace-nowrap">
          <div className="w-8 h-8 lg:w-20 lg:h-20 relative">
            {game.imageUrl ? (
              <Image
                src={game.imageUrl}
                alt={game.name}
                fill
                style={{
                  objectFit: "cover",
                  objectPosition: "top",
                }}
              />
            ) : (
              <ImageIcon className="w-20 h-20 text-muted-foreground" />
            )}
          </div>

          <div>
            <h2 className="text-xl lg:text-3xl font-bold">{game.name}</h2>
            <div className="gap-4 items-center hidden lg:flex">
              {!!game.bggUrl && (
                <Link
                  href={game.bggUrl}
                  className="group"
                  prefetch={false}
                  title={`${game.name} on Board Game Geek`}
                >
                  <Image
                    src="/bgg.png"
                    alt="Board Game Geek"
                    width={16}
                    height={16}
                    className="w-5 h-5 grayscale group-hover:grayscale-0 rounded"
                  />
                </Link>
              )}
              <p className="text-muted-foreground text-sm hidden lg:block">
                {game.resourceCount} resources
                <Button
                  size="sm"
                  variant="link"
                  onClick={() => {
                    sendMessage({ text: "What resources are you using?" });
                  }}
                >
                  What are they?
                </Button>
              </p>
            </div>
          </div>
        </div>
        <Button asChild variant="ghost">
          <Link href="/" prefetch={false}>
            <X className="w-6 h-6 lg:w-8 lg:h-8" />
            <span className="sr-only">Close chat</span>
          </Link>
        </Button>
      </div>
    </>
  );
}
