import { Spinner } from '@/components/ui/spinner';

export default function GamesLoading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <p className="text-sm text-muted-foreground">Loading games...</p>
      </div>
    </div>
  );
}
