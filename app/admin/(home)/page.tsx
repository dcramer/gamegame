import { serverClient } from '@/lib/procedures/client.server';
import GameList from './game-list';

export default async function Page() {
  // Fetch games using oRPC server client (Server Component)
  const gameList = await serverClient.games.list();

  return <GameList gameList={gameList} />;
}
