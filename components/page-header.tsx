import { type ReactNode } from 'react';
import { Breadcrumbs, type BreadcrumbItem } from './breadcrumbs';

export interface PageHeaderProps {
  /**
   * Breadcrumb items for navigation hierarchy
   */
  breadcrumbs?: BreadcrumbItem[];

  /**
   * Page title (required) - can be a string or a React node
   */
  title: string | ReactNode;

  /**
   * Optional description or subtitle
   */
  description?: string;

  /**
   * Optional stats or metadata (e.g., "5 resources • 120 pages")
   */
  stats?: string;

  /**
   * Action buttons to display on the right side
   */
  actions?: ReactNode;

  /**
   * Additional CSS classes for the container
   */
  className?: string;
}

/**
 * Standard page header component for admin pages
 *
 * Provides consistent layout for:
 * - Breadcrumb navigation
 * - Page title
 * - Description/subtitle
 * - Stats/metadata
 * - Action buttons
 *
 * @example
 * <PageHeader
 *   breadcrumbs={[
 *     { label: 'Admin', href: '/admin' },
 *     { label: 'Games' }
 *   ]}
 *   title="Games"
 *   actions={<Button asChild><Link href="/admin/add-game">Add Game</Link></Button>}
 * />
 *
 * @example
 * <PageHeader
 *   breadcrumbs={[
 *     { label: 'Admin', href: '/admin' },
 *     { label: 'Games', href: '/admin' },
 *     { label: 'Arcs' }
 *   ]}
 *   title="Arcs"
 *   description="Manage game resources and settings"
 *   stats="3 resources • 45 pages"
 *   actions={
 *     <>
 *       <Button>Add Resource</Button>
 *       <Button variant="destructive">Delete Game</Button>
 *     </>
 *   }
 * />
 */
export function PageHeader({
  breadcrumbs,
  title,
  description,
  stats,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`mb-8 ${className}`}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs items={breadcrumbs} />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight">
            {title}
          </h1>

          {description && (
            <p className="mt-2 text-base text-muted-foreground max-w-3xl">
              {description}
            </p>
          )}

          {stats && (
            <p className="mt-2 text-sm text-muted-foreground">
              {stats}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
