"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, X } from "lucide-react";
import { GAMES } from "@/constants";
import Link from "next/link";
import { useChat } from "ai/react";
import Layout from "./layout";

export function Chat({ game }: { game: (typeof GAMES)[number] }) {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    maxToolRoundtrips: 2,
  });

  return (
    <Layout>
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
                  {m.content}
                </div>
              ))}
            </div>
            <form onSubmit={handleSubmit}>
              <Input
                className="flex-grow bg-gray-100 text-gray-800 placeholder-gray-500"
                value={input}
                placeholder={`Ask a question about ${game.name}...`}
                onChange={handleInputChange}
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
    </Layout>
  );
}
