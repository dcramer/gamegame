"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { LoaderCircleIcon, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { useChat } from "ai/react";
import Markdown from "./markdown";

export function Chat({
  game,
}: {
  game: {
    id: string;
    name: string;
  };
}) {
  const { messages, input, error, isLoading, handleInputChange, handleSubmit } = useChat({
    api: `/api/ask/${game.id}`,
    maxToolRoundtrips: 2,
  });

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
          {error && (
            <div className="bg-error text-error p-4 rounded mb-4">
              {error.message}
            </div>
          )}
          <div className="flex-1 overflow-y-auto mb-4 gap-4 flex flex-col px-3">
            {messages.map((m, index) => (
              <div key={index} className="whitespace-pre-wrap flex flex-col">
                {m.role === "user" ? (
                  <div className="font-semibold rounded bg-muted text-muted-foreground self-end p-3">
                    {m.content}
                  </div>
                ) : (
                  <Markdown content={m.content} />
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
              {!isLoading ? <MessageCircle className="w-5 h-5 mr-2" /> : <LoaderCircleIcon className="w-5 h-5 mr-2" />}
              Ask
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
  );
}
