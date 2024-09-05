"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { useChat } from "ai/react";
import Layout from "./layout";
import Markdown from "./markdown";

export function Chat({
  game,
}: {
  game: {
    id: string;
    name: string;
  };
}) {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: `/api/ask/${game.id}`,
    maxToolRoundtrips: 2,
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold pl-4">{game.name}</h2>
        <Button asChild variant="ghost">
          <Link href="/" prefetch={false}>
            <X className="w-6 h-6" />
            <span className="sr-only">Close chat</span>
          </Link>
        </Button>
      </div>
      <Card className="bg-muted text-muted-foreground">
        <CardContent className="p-4">
          <div className="h-96 overflow-y-auto mb-4">
            {messages.map((m, index) => (
              <div key={index} className="font-semibold whitespace-pre-wrap">
                {m.role === "user" ? (
                  <strong className="text-accent-foreground">
                    You: <Markdown content={m.content} />
                  </strong>
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
            <Button type="submit" size="sm">
              <MessageCircle className="w-4 h-4 mr-2" />
              Ask
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
