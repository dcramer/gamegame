import AdminLayout from '@/components/admin-layout';
import { getAllGames } from '@/lib/actions/games';
import GameList from './game-list';

export default async function Page() {
  const gameList = await getAllGames(false);
  return (
    <AdminLayout>
      <GameList gameList={gameList} />
    </AdminLayout>
  );
}
