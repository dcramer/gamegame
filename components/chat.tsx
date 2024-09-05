"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { LoaderCircleIcon, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { useChat } from "ai/react";
import Markdown from "react-markdown";
import { useEffect, useRef } from "react";

function renderMessage(message: string) {
  let parsed;
  try {
    parsed = JSON.parse(message);
  } catch (err) {
    console.error("invalid payload", message);
    return renderError(
      "There was an error processing your request. Please try again."
    );
  }

  const { answer, resourceName, resourceId } = parsed;
  if (!answer) {
    console.error("no answer in JSON payload", message);
    return renderError(
      "There was an error processing your request. Please try again."
    );
  }
  return (
    <div className="flex flex-col">
      <Markdown className="prose prose-invert">{answer}</Markdown>
      <a
        href={`/resources/${resourceId}/download`}
        className="text-xs underline"
        target="_blank"
      >
        {resourceName}
      </a>
    </div>
  );
}

function renderError(message: string) {
  return <div className="bg-error text-error p-4 rounded mb-4">{message}</div>;
}

export function Chat({
  game,
}: {
  game: {
    id: string;
    name: string;
  };
}) {
  const { messages, input, error, isLoading, handleInputChange, handleSubmit } =
    useChat({
      api: `/api/ask/${game.id}`,
      maxToolRoundtrips: 2,
    });

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="absolute inset-0 mx-auto flex flex-col items-stretch">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold pl-4">{game.name}</h2>
        <Button asChild variant="ghost">
          <Link href="/" prefetch={false}>
            <X className="w-6 h-6" />
            <span className="sr-only">Close chat</span>
          </Link>
        </Button>
      </div>
      <Card className="flex-1 flex">
        <CardContent className="p-4 flex-1 flex items-stretch flex-col">
          {error && renderError(error.message)}
          <div
            className="flex-1 overflow-y-auto mb-4 gap-2 flex flex-col"
            ref={containerRef}
          >
            {messages
              .filter((m) => m.content && m.content !== "")
              .map((m, index) => (
                <div key={index} className="flex flex-col gap-0">
                  {m.role === "user" ? (
                    <div className="font-semibold rounded bg-muted text-muted-foreground self-end p-3">
                      <Markdown className="prose prose-invert">
                        {m.content}
                      </Markdown>
                    </div>
                  ) : (
                    renderMessage(m.content)
                  )}
                </div>
              ))}
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
