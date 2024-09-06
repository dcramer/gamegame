"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DotIcon,
  ExternalLink,
  LoaderCircleIcon,
  MessageCircle,
  MessageCircleQuestion,
  X,
} from "lucide-react";
import Link from "next/link";
import { useChat } from "ai/react";
import Markdown from "react-markdown";
import { useEffect, useRef } from "react";
import Image from "next/image";

function renderMessage(
  message: string,
  isStreaming: boolean,
  activeAnswer: boolean,
  onFollowUp: (followUp: string) => void
) {
  let parsed;
  try {
    parsed = JSON.parse(message);
  } catch (err) {
    if (isStreaming) return null;
    console.error("invalid payload", message);
    return renderError(
      new Error("There was an error processing your request. Please try again.")
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
    message = error.message;
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
    <div className="absolute inset-0 mx-auto flex flex-col items-stretch">
      <div className="flex justify-between items-center mb-2 lg:mb-6">
        <div className="flex items-center">
          {game.imageUrl && (
            <div className="w-32 h-32 relative hidden lg:block">
              <Image
                src={game.imageUrl}
                alt={game.name}
                fill
                style={{
                  objectFit: "cover",
                  objectPosition: "top",
                }}
              />
            </div>
          )}
          <div>
            <h2 className="text-3xl font-bold pl-4">{game.name}</h2>
            <p className="text-muted-foreground text-sm pl-4">
              {game.resourceCount} resources{" "}
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
      <Card className="flex-1 flex rounded-none lg:rounded-xl">
        <CardContent className="p-4 flex-1 flex items-stretch flex-col">
          {error && renderError(error)}
          <div className="flex-1 overflow-y-auto mb-4 gap-2 flex flex-col">
            {visibleMessages.length > 0 ? (
              visibleMessages.map((m, index) => (
                <div key={index} className="flex flex-col gap-0">
                  {m.role === "user" ? (
                    <div className="font-semibold rounded bg-muted text-muted-foreground self-end p-3">
                      <Markdown className="prose prose-invert">
                        {m.content}
                      </Markdown>
                    </div>
                  ) : (
                    renderMessage(
                      m.content,
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
            <Button type="submit" size="sm" disabled={isLoading}>
              {!isLoading ? (
                <MessageCircle className="w-5 h-5 mr-2" />
              ) : (
                <LoaderCircleIcon className="w-5 h-5 mr-2 animate-spin" />
              )}
              Ask
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
