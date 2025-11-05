'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Chat } from '@/components/chat';

interface Game {
  id: string;
  name: string;
  slug: string;
  year?: number | null;
  imageUrl: string | null;
  bggUrl: string | null;
  resourceCount?: number;
}

export default function GameChatPage() {
  const params = useParams();
  const gameIdOrSlug = params.gameIdOrSlug as string;

  const [game, setGame] = useState<Game | null>(null);
  const [imageError, setImageError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/games/${gameIdOrSlug}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Game not found');
        }
        return res.json();
      })
      .then((data) => {
        setGame(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch game:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [gameIdOrSlug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
        <h1 className="text-2xl font-bold mb-2">Game not found</h1>
        <p className="text-muted-foreground mb-4">
          The game you're looking for doesn't exist or has been removed.
        </p>
        <a href="/games" className="text-primary hover:underline">
          ← Back to games
        </a>
      </div>
    );
  }

  return (
    <div className="relative h-screen">
      <Chat game={game} imageError={imageError} setImageError={setImageError} />
    </div>
  );
}
