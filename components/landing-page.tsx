import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GAMES } from "@/constants";
import { Dices } from "lucide-react";
import { Comfortaa } from "next/font/google";
import Image from "next/image";
import Link from "next/link";

const comfortaa = Comfortaa({ subsets: ["latin"] });

export function LandingPage() {
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
        <section className="text-center py-12">
          <h2
            className={`text-5xl font-extrabold text-gray-900 mb-4 ${comfortaa.className}`}
          >
            Choose Your Game
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Select a board game to start asking questions about its rules.
          </p>
        </section>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {GAMES.map((game) => (
            <Card key={game.slug} className="relative">
              <CardHeader>
                <CardTitle className="text-center text-2xl">
                  {game.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <div className="w-64 h-64 relative">
                  <Image
                    src={game.image}
                    alt={game.name}
                    layout="fill"
                    objectFit="cover"
                  />
                </div>
              </CardContent>
              <Link
                href={game.gptUrl}
                prefetch={false}
                className="inset-0 absolute"
              />
            </Card>
          ))}
        </div>
      </main>

      <footer className="container mx-auto px-4 py-8 text-center text-gray-600">
        <p>&copy; 2023 gamegame.ai. All rights reserved.</p>
      </footer>
    </div>
  );
}
