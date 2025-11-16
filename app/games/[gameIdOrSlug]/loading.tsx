import { Spinner } from '@/components/ui/spinner';

export default function GameLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <p className="text-sm text-muted-foreground">Loading game...</p>
      </div>
    </div>
  );
}
