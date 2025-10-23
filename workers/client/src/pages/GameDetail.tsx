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
  const [error, setError] = useState<'not_found' | 'server' | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!gameId) return;

    fetch(`/api/games/${gameId}`)
      .then((res) => {
        if (res.status === 404) {
          setError('not_found');
          setLoading(false);
          return null;
        }
        if (!res.ok) {
          setError('server');
          throw new Error(`Failed to fetch game (${res.status})`);
        }
        return res.json();
      })
      .then((gameData) => {
        if (!gameData) {
          return;
        }
        if (gameData.error) {
          console.error('Game error:', gameData.error);
          setError('server');
          setLoading(false);
          return;
        }
        setGame(gameData);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load game:', err);
        if (!error) {
          setError('server');
        }
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

  if (!game || error === 'not_found') {
    return (
      <ErrorState
        title="Game not found"
        message="The game you're looking for doesn't exist or has been removed."
      />
    );
  }

  if (error === 'server') {
    return (
      <ErrorState
        title="Something went wrong"
        message="We couldn't load this game right now. Please try again later."
      />
    );
  }

  return <Chat game={game} imageError={imageError} setImageError={setImageError} />;
}
