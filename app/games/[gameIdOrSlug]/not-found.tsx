import Link from 'next/link';
import { Dices } from 'lucide-react';

export default function GameNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <Dices className="w-16 h-16 text-muted-foreground mb-4" />
      <h1 className="text-2xl font-bold mb-2">Game not found</h1>
      <p className="text-muted-foreground mb-4">
        The game you're looking for doesn't exist or has been removed.
      </p>
      <Link href="/games" className="text-primary hover:underline">
        ← Back to games
      </Link>
    </div>
  );
}
