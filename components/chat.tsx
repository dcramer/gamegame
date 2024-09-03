"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dices, MessageCircle, X } from "lucide-react";
import { Comfortaa } from "next/font/google";
import { GAMES } from "@/constants";
import Link from "next/link";

const comfortaa = Comfortaa({ subsets: ["latin"] });

export function Chat({ game }: { game: (typeof GAMES)[number] }) {
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatMessage.trim()) {
      setChatHistory([
        ...chatHistory,
        {
          user: chatMessage,
          ai: `Here's a simulated answer about ${selectedGame.name}: ${chatMessage}`,
        },
      ]);
      setChatMessage("");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-100 to-white">
      <header className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center space-x-2">
          <Dices className="w-8 h-8 text-gray-800" />
          <h1
            className={`text-4xl font-bold text-center text-gray-800 ${comfortaa.className}`}
          >
            gamegame
          </h1>
        </div>
      </header>

      <main className="container mx-auto px-4 pb-12">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h2
              className={`text-3xl font-bold text-gray-900 ${comfortaa.className}`}
            >
              {game.name}
            </h2>
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
                {chatHistory.map((chat, index) => (
                  <div key={index}>
                    <p className="font-semibold text-gray-800">
                      You: {chat.user}
                    </p>
                    <p className="ml-4 text-gray-600">AI: {chat.ai}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={handleChatSubmit} className="flex space-x-2">
                <Input
                  type="text"
                  placeholder={`Ask a question about ${game.name}...`}
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  className="flex-grow bg-gray-100 text-gray-800 placeholder-gray-500"
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

      <footer className="container mx-auto px-4 py-8 text-center text-gray-600">
        <p>&copy; 2023 gamegame.ai. All rights reserved.</p>
      </footer>
    </div>
  );
}
