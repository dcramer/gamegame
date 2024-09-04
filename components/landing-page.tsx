import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GAMES } from "@/constants";
import Image from "next/image";
import Link from "next/link";
import Layout from "./layout";
import Heading from "./heading";

export function LandingPage() {
  return (
    <Layout>
      <section className="text-center py-12">
        <Heading>Choose Your Game</Heading>
        <p className="text-xl mb-8">
          Select a board game to start asking questions about its rules.
        </p>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {GAMES.map((game) => (
          <Card key={game.slug} className="relative">
            <CardContent className="flex flex-col items-center">
              <div className="w-full aspect-[3/2] overflow-hidden relative">
                <Image
                  src={game.image}
                  alt={game.name}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  style={{
                    objectFit: "cover",
                    objectPosition: game.imagePosition || "center",
                  }}
                />
              </div>
            </CardContent>
            <CardHeader>
              <CardTitle className="text-center text-2xl">
                {game.name}
              </CardTitle>
            </CardHeader>
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
