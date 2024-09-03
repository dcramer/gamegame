"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, X } from "lucide-react";
import { GAMES } from "@/constants";
import Link from "next/link";
import { Footer } from "./footer";
import { useChat } from "ai/react";
import Header from "./header";
import { CoreMessage } from "ai";
import { useState } from "react";
import { continueConversation } from "@/app/actions";
import { readStreamableValue } from "ai/rsc";

export function Chat({ game }: { game: (typeof GAMES)[number] }) {
  const [messages, setMessages] = useState<CoreMessage[]>([]);
  const [input, setInput] = useState("");
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-100 to-white">
      <Header />

      <main className="container mx-auto px-4 pb-12">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className={`text-3xl font-bold text-gray-900`}>{game.name}</h2>
            <Button
              asChild
              variant="ghost"
              className="text-gray-600 hover:text-gray-800"
            >
              <Link href="/" prefetch={false}>
                <X className="w-6 h-6" />
                <span className="sr-only">Close chat</span>
              </Link>
            </Button>
          </div>
          <Card className="bg-white">
            <CardContent className="p-4">
              <div className="h-96 overflow-y-auto mb-4 space-y-4">
                {messages.map((m, index) => (
                  <div
                    key={index}
                    className="font-semibold text-gray-800 whitespace-pre-wrap"
                  >
                    {m.role === "user" ? "User: " : "AI: "}
                    {m.content as string}
                  </div>
                ))}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const newMessages: CoreMessage[] = [
                    ...messages,
                    { content: input, role: "user" },
                  ];

                  setMessages(newMessages);
                  setInput("");

                  const result = await continueConversation(
                    game.slug,
                    newMessages
                  );

                  for await (const content of readStreamableValue(result)) {
                    setMessages([
                      ...newMessages,
                      {
                        role: "assistant",
                        content: content as string,
                      },
                    ]);
                  }
                }}
              >
                <Input
                  className="flex-grow bg-gray-100 text-gray-800 placeholder-gray-500"
                  value={input}
                  placeholder={`Ask a question about ${game.name}...`}
                  onChange={(e) => setInput(e.target.value)}
                />
                <Button
                  type="submit"
                  className="bg-gray-800 text-white hover:bg-gray-700"
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Ask
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
