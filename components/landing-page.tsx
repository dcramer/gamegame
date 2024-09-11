import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";
import Layout from "./layout";
import Heading from "./heading";
import { getAllGames } from "@/lib/actions/games";

export async function LandingPage() {
  const gameList = await getAllGames();

  return (
    <Layout>
      <section className="text-center py-6 lg:py-12">
        <Heading className="text-2xl lg:text-5xl lg:mb-6 mb-2">
          What are you playing?
        </Heading>
        <p className="text-lg lg:text-xl mb-4 lg:mb-8 text-muted-foreground">
          Select your game to start getting answers about the rules.
        </p>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {gameList.map((game) => (
          <Card
            key={game.id}
            className="relative rounded-none lg:rounded hover:ring-ring hover:ring-offset-2 ring-offset-background hover:ring-2"
          >
            <CardContent className="flex flex-col items-center">
              <div className="w-full aspect-[3/2] overflow-hidden relative">
                {game.imageUrl ? (
                  <Image
                    src={game.imageUrl}
                    alt={game.name}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    style={{
                      objectFit: "cover",
                      objectPosition: "top",
                    }}
                  />
                ) : null}
              </div>
            </CardContent>
            <CardHeader>
              <CardTitle className="text-center text-2xl">
                {game.name}
              </CardTitle>
            </CardHeader>
            <Link
              href={`/ask/${game.id}`}
              prefetch={false}
              className="inset-0 absolute"
            />
          </Card>
        ))}
      </div>
    </Layout>
  );
}
