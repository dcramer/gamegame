import Layout from "./layout";
import Heading from "./heading";
import { getAllGames } from "@/lib/actions/games";
import GameList from "./game-list";

export async function LandingPage() {
  const gameList = await getAllGames();

  return (
    <Layout>
      <section className="text-center py-3 lg:py-12">
        <Heading className="text-2xl lg:text-5xl lg:mb-6 mb-2">
          What are you playing?
        </Heading>
        <p className="text-lg lg:text-xl mb-4 lg:mb-8 text-muted-foreground">
          Select your game to start getting answers about the rules.
        </p>
      </section>

      <GameList gameList={gameList} />
    </Layout>
  );
}
