import Heading from "@/components/heading";
import Layout from "@/components/layout";
import { getAllGames } from "@/lib/actions/games";
import GameList from "./game-list";

export default async function Page() {
  const gameList = await getAllGames(false);
  return (
    <Layout>
      <Heading>Games</Heading>
      <GameList gameList={gameList} />
    </Layout>
  );
}
