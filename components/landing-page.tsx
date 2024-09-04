import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GAMES } from "@/constants";
import Image from "next/image";
import Link from "next/link";
import Layout from "./layout";

export function LandingPage() {
  return (
    <Layout>
      <section className="text-center py-12">
        <h2 className={`text-5xl font-extrabold text-gray-900 mb-4`}>
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
    </Layout>
  );
}
