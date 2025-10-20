import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Spinner } from '../components/ui/spinner';
import ErrorState from '../components/ErrorState';
import { Chat } from '../components/Chat';

interface Game {
  id: string;
  name: string;
  slug: string;
  year?: number | null;
  imageUrl: string | null;
  bggUrl: string | null;
  resourceCount?: number;
}

export default function GameDetail() {
  const { gameId } = useParams<{ gameId: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!gameId) return;

    fetch(`/api/games/${gameId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch game');
        return res.json();
      })
      .then((gameData) => {
        if (gameData.error) {
          console.error('Game error:', gameData.error);
          setLoading(false);
          return;
        }
        setGame(gameData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load game:', err);
        setLoading(false);
      });
  }, [gameId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!game) {
    return (
      <ErrorState
        title="Game not found"
        message="The game you're looking for doesn't exist or has been removed."
      />
    );
  }

  return <Chat game={game} imageError={imageError} setImageError={setImageError} />;
}
