import { type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from './ui/button';

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  minHeight?: string;
  className?: string;
}

/**
 * Reusable empty state component for displaying when no data is available.
 * Replaces repetitive empty state patterns across admin and list pages.
 *
 * @example
 * <EmptyState
 *   title="No games yet"
 *   description="Create your first game to get started."
 *   action={{ label: "Create Game", href: "/admin/add-game" }}
 * />
 *
 * @example
 * <EmptyState
 *   title="No resources"
 *   description="Upload a PDF rulebook to start."
 *   icon={<FileIcon />}
 *   action={{ label: "Upload", onClick: handleUpload }}
 *   minHeight="min-h-96"
 * />
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  minHeight = 'min-h-64',
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-1 flex-col gap-6 items-center justify-center rounded-lg border border-dashed shadow-sm p-6 bg-muted ${minHeight} ${className}`}
    >
      <div className="flex flex-col items-center gap-1 text-center max-w-md">
        {icon && <div className="mb-2 text-muted-foreground">{icon}</div>}
        <h3 className="text-2xl font-bold tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action && (
        <>
          {action.href ? (
            <Button asChild>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            <Button onClick={action.onClick}>{action.label}</Button>
          )}
        </>
      )}
    </div>
  );
}
