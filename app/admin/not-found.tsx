import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <FileQuestion className="w-16 h-16 text-muted-foreground mb-4" />
      <h1 className="text-2xl font-bold mb-2">Page not found</h1>
      <p className="text-muted-foreground mb-6">
        The page or resource you're looking for doesn't exist or has been removed.
      </p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/admin">
            Back to admin dashboard
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">
            Go to homepage
          </Link>
        </Button>
      </div>
    </div>
  );
}
