"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DotIcon,
  ExternalLink,
  ImageIcon,
  LoaderCircleIcon,
  MessageCircle,
  MessageCircleQuestion,
  X,
} from "lucide-react";
import Link from "next/link";
import { Message, useChat } from "ai/react";
import Markdown from "react-markdown";
import { useEffect, useRef } from "react";
import Image from "next/image";

function renderMessage(
  message: Message,
  isStreaming: boolean,
  activeAnswer: boolean,
  onFollowUp: (followUp: string) => void
) {
  let parsed;
  try {
    parsed = JSON.parse(message.content);
  } catch (err) {
    if (isStreaming) return null;
    console.error("invalid payload", message);
    return renderError(
      new Error(
        "There was an error processing your request. Please try again.",
        {
          cause: err,
        }
      )
    );
  }

  const { answer, followUps, resources } = parsed as {
    answer: string;
    followUps: string[];
    resources: { name: string; id: string }[];
  };
  if (!answer) {
    console.error("no answer in JSON payload", message);
    return renderError(
      new Error("There was an error processing your request. Please try again.")
    );
  }
  return (
    <div className="flex flex-col">
      <Markdown className="prose prose-invert">{answer}</Markdown>
      {!!resources.length && (
        <div className="mt-4 flex flex-col gap-2 text-sm flex-wrap">
          <h4 className="text-xs font-bold uppercase tracking-tight text-muted-foreground flex items-center gap-2">
            Resources
            <ExternalLink className="w-3 h-3" />
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
      {activeAnswer && followUps && followUps.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 text-sm flex-wrap">
          <h4 className="text-xs font-bold uppercase tracking-tight text-muted-foreground flex items-center gap-2">
            Follow Ups
            <MessageCircleQuestion className="w-3 h-3" />
          </h4>
          <ul className="flex flex-col gap-2 text-sm flex-wrap">
            {followUps.map((followUp) => (
              <li key={followUp}>
                <Button
                  variant="default"
                  size="sm"
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
}

function renderError(error: Error) {
  let message;
  if (error.message.includes("Rate limit exceeded")) {
    message = "Rate limit exceeded. Try again in a bit.";
  } else {
    message = error.toString();
  }

  return (
    <div className="bg-destructive text-destructive-foreground font-bold p-4 rounded mb-4">
      {message}
    </div>
  );
}

export function Chat({
  game,
}: {
  game: {
    id: string;
    name: string;
    imageUrl: string | null;
    resourceCount: number;
  };
}) {
  const {
    messages,
    input,
    error,
    append,
    isLoading,
    handleInputChange,
    handleSubmit,
  } = useChat({
    api: `/api/ask/${game.id}`,
    maxToolRoundtrips: 2,
  });

  const ref = useRef<HTMLDivElement | null>(null);

  const visibleMessages = messages.filter(
    (m, index) =>
      m.content &&
      m.content !== "" &&
      (index !== messages.length - 1 || !isLoading || m.role === "user")
  );

  useEffect(() => {
    setTimeout(() => ref.current?.scrollIntoView());
  }, [visibleMessages.length]);

  return (
    <>
      <div className="flex justify-between items-center h-16 lg:h-24 overflow-hidden absolute top-0 left-0 right-0 px-4 gap-4 border-b bg-card">
        <div className="flex items-end gap-4">
          <div className="w-20 h-20 relative hidden lg:block">
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
            <h2 className="text-3xl font-bold">{game.name}</h2>
            <p className="text-muted-foreground text-sm hidden lg:block">
              {game.resourceCount} resources
              <Button
                size="sm"
                variant="link"
                onClick={() => {
                  append({
                    role: "user",
                    content: "What resources are you using?",
                  });
                }}
              >
                What are they?
              </Button>
            </p>
          </div>
        </div>
        <Button asChild variant="ghost">
          <Link href="/" prefetch={false}>
            <X className="w-8 h-8" />
            <span className="sr-only">Close chat</span>
          </Link>
        </Button>
      </div>
      <Card className="flex-1 flex rounded-none lg:rounded-xl min-h-screen pt-20 lg:pt-32 pb-4 overflow-hidden h-screen px-4">
        <CardContent className="flex-1 flex items-stretch flex-col">
          {error && renderError(error)}
          <div className="flex-1 overflow-y-auto mb-4 gap-2 flex flex-col">
            {visibleMessages.length > 0 ? (
              visibleMessages.map((m, index) => (
                <div key={m.id} className="flex flex-col gap-0">
                  {m.role === "user" ? (
                    <div className="font-semibold rounded bg-muted text-muted-foreground self-end p-3">
                      <Markdown className="prose prose-invert">
                        {m.content}
                      </Markdown>
                    </div>
                  ) : (
                    renderMessage(
                      m,
                      index === visibleMessages.length - 1 && isLoading,
                      index === visibleMessages.length - 1,
                      (followUp) => {
                        append({
                          role: "user",
                          content: followUp,
                        });
                      }
                    )
                  )}
                </div>
              ))
            ) : (
              <div className="flex-1 flex flex-col gap-6 items-center justify-center text-muted-foreground text-lg">
                <MessageCircleQuestion className="w-24 h-24" />
                What are you about to start fisticuffs over?
              </div>
            )}
            {isLoading && (
              <div className="flex flex-row items-center">
                <DotIcon className="w-5 h-5 animate-pulse" />
                <DotIcon className="w-5 h-5 animate-pulse" />
                <DotIcon className="w-5 h-5 animate-pulse" />
              </div>
            )}
            <div ref={ref} />
          </div>
          <form onSubmit={handleSubmit} className="flex items-center gap-4">
            <Input
              className="bg-background text-foreground placeholder-text-muted-foreground"
              value={input}
              placeholder={`Ask a question about ${game.name}...`}
              onChange={handleInputChange}
              autoFocus
            />
            <Button
              type="submit"
              size="sm"
              disabled={isLoading}
              className="gap-2"
            >
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
    </>
  );
}
