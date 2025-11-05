# Jobs Management Page - Ready-to-Use Code Snippets

This file contains code snippets that can be directly used as a starting point for implementation.

---

## 1. Utility Functions

### lib/utils/format-date.ts

```typescript
/**
 * Format a timestamp as a relative date string
 * e.g., "5m ago", "just now", "11/4/2024"
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

/**
 * Format duration between two timestamps
 * e.g., "45s", "2m 30s", "1h 45m"
 */
export function formatDuration(start: number, end?: number): string {
  const endTime = end || Date.now();
  const diff = endTime - start;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes < 1) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
```

### lib/utils/jobs.ts

```typescript
import type { JobWithDetails } from '@/lib/db/schema/jobs';

export type StatusVariant = 'success' | 'error' | 'info' | 'warning' | 'neutral';

/**
 * Map job status to badge variant for styling
 */
export function getStatusVariant(status: string): StatusVariant {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    case 'processing':
      return 'info';
    case 'pending':
      return 'warning';
    default:
      return 'neutral';
  }
}

/**
 * Check if a job is active (has potential to change)
 */
export function isActiveJob(job: JobWithDetails): boolean {
  return job.status === 'pending' || job.status === 'processing';
}

/**
 * Check if a job can be cancelled
 */
export function canCancel(job: JobWithDetails): boolean {
  return job.status === 'pending' || job.status === 'processing';
}

/**
 * Check if a job can be retried
 */
export function canRetry(job: JobWithDetails): boolean {
  return job.status === 'failed';
}
```

---

## 2. UI Components

### components/ui/badge.tsx

```typescript
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        outline: "border border-input bg-background",
        success: "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400",
        warning: "bg-yellow-50 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400",
        error: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
        info: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
        neutral: "bg-gray-50 text-gray-600 dark:bg-gray-950 dark:text-gray-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
```

### components/ui/tooltip.tsx

```typescript
"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border border-slate-200 bg-slate-950 px-3 py-1.5 text-sm text-slate-50 shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:border-slate-800 dark:bg-slate-50 dark:text-slate-900",
      className
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
```

---

## 3. API Routes

### app/api/admin/jobs/route.ts

```typescript
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { db } from '@/lib/db';
import { jobs, resources, games } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 1000);
    const offset = parseInt(searchParams.get('offset') ?? '0');

    // Get jobs sorted by creation time (newest first)
    const jobsList = await db
      .select({
        id: jobs.id,
        resourceId: jobs.resourceId,
        gameId: jobs.gameId,
        status: jobs.status,
        progress: jobs.progress,
        currentStep: jobs.currentStep,
        error: jobs.error,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
        completedAt: jobs.completedAt,
        resourceName: resources.name,
        gameName: games.name,
      })
      .from(jobs)
      .leftJoin(resources, eq(jobs.resourceId, resources.id))
      .leftJoin(games, eq(jobs.gameId, games.id))
      .orderBy(desc(jobs.createdAt))
      .limit(limit)
      .offset(offset);

    // Transform to match expected format (id -> jobId)
    const transformedJobs = jobsList.map(job => ({
      jobId: job.id,
      resourceId: job.resourceId,
      gameId: job.gameId,
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep || undefined,
      error: job.error ? JSON.stringify(job.error) : undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt || undefined,
      resourceName: job.resourceName,
      gameName: job.gameName,
    }));

    return NextResponse.json({
      jobs: transformedJobs,
      hasMore: transformedJobs.length === limit,
    });
  } catch (error) {
    console.error('Failed to fetch jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}
```

### app/api/admin/jobs/[jobId]/cancel/route.ts

```typescript
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { db } from '@/lib/db';
import { jobs, resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(
  req: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = params;

    // Get the job
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId));

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Can only cancel pending or processing jobs
    if (job.status !== 'pending' && job.status !== 'processing') {
      return NextResponse.json(
        { error: 'Job cannot be cancelled - it may have already completed' },
        { status: 409 }
      );
    }

    // Mark job as failed
    await db
      .update(jobs)
      .set({
        status: 'failed',
        updatedAt: Date.now(),
      })
      .where(eq(jobs.id, jobId));

    // Update resource status
    await db
      .update(resources)
      .set({
        status: 'failed',
        processingStage: 'cancelled',
        currentJobId: null,
        updatedAt: new Date(),
      })
      .where(eq(resources.id, job.resourceId));

    return NextResponse.json({
      success: true,
      message: 'Job cancelled successfully',
    });
  } catch (error) {
    console.error('Failed to cancel job:', error);
    return NextResponse.json(
      { error: 'Failed to cancel job' },
      { status: 500 }
    );
  }
}
```

### app/api/admin/jobs/[jobId]/retry/route.ts

```typescript
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { db } from '@/lib/db';
import { jobs, resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function POST(
  req: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = params;

    // Get the failed job
    const [failedJob] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId));

    if (!failedJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (failedJob.status !== 'failed') {
      return NextResponse.json(
        { error: 'Only failed jobs can be retried' },
        { status: 400 }
      );
    }

    // Get resource to check its current state
    const [resource] = await db
      .select()
      .from(resources)
      .where(eq(resources.id, failedJob.resourceId));

    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    }

    // Create new job
    const newJobId = nanoid();
    await db.insert(jobs).values({
      id: newJobId,
      type: 'process-resource',
      resourceId: failedJob.resourceId,
      gameId: failedJob.gameId,
      status: 'pending',
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update resource with new job
    await db
      .update(resources)
      .set({
        status: 'processing',
        currentJobId: newJobId,
        updatedAt: new Date(),
      })
      .where(eq(resources.id, failedJob.resourceId));

    // TODO: Re-enqueue for processing in your job queue/workflow system

    return NextResponse.json({
      success: true,
      message: 'Job retrying!',
    });
  } catch (error) {
    console.error('Failed to retry job:', error);
    return NextResponse.json(
      { error: 'Failed to retry job' },
      { status: 500 }
    );
  }
}
```

---

## 4. Page Components

### app/admin/jobs/page.tsx

```typescript
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { jobs, resources, games } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import JobsClient from './jobs-client';

async function getInitialJobs() {
  try {
    const jobsList = await db
      .select({
        id: jobs.id,
        resourceId: jobs.resourceId,
        gameId: jobs.gameId,
        status: jobs.status,
        progress: jobs.progress,
        currentStep: jobs.currentStep,
        error: jobs.error,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
        completedAt: jobs.completedAt,
        resourceName: resources.name,
        gameName: games.name,
      })
      .from(jobs)
      .leftJoin(resources, eq(jobs.resourceId, resources.id))
      .leftJoin(games, eq(jobs.gameId, games.id))
      .orderBy(desc(jobs.createdAt))
      .limit(100);

    return jobsList.map(job => ({
      jobId: job.id,
      resourceId: job.resourceId,
      gameId: job.gameId,
      status: job.status as 'pending' | 'processing' | 'completed' | 'failed',
      progress: job.progress,
      currentStep: job.currentStep || undefined,
      error: job.error ? JSON.stringify(job.error) : undefined,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt || undefined,
      resourceName: job.resourceName || undefined,
      gameName: job.gameName || undefined,
    }));
  } catch (error) {
    console.error('Failed to fetch jobs:', error);
    return [];
  }
}

export default async function JobsPage() {
  const user = await getCurrentUser();

  if (!user?.isAdmin) {
    return redirect('/');
  }

  const initialJobs = await getInitialJobs();

  return <JobsClient initialJobs={initialJobs} />;
}
```

### app/admin/jobs/jobs-client.tsx

```typescript
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatDuration } from '@/lib/utils/format-date';
import { getStatusVariant, isActiveJob, canCancel, canRetry } from '@/lib/utils/jobs';
import type { JobWithDetails } from '@/lib/db/schema/jobs';

interface JobsClientProps {
  initialJobs: JobWithDetails[];
}

export default function JobsClient({ initialJobs }: JobsClientProps) {
  const [jobs, setJobs] = useState<JobWithDetails[]>(initialJobs);
  const [canceling, setCanceling] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

  const hasActiveJobs = useMemo(
    () => jobs.some(isActiveJob),
    [jobs]
  );

  // Auto-refresh every 5 seconds when there are active jobs
  useEffect(() => {
    if (!hasActiveJobs) return;

    const refreshJobs = async () => {
      try {
        const res = await fetch('/api/admin/jobs');
        if (res.ok) {
          const data = await res.json();
          setJobs(data.jobs);
        }
      } catch (error) {
        console.error('Failed to refresh jobs:', error);
      }
    };

    const interval = setInterval(refreshJobs, 5000);
    return () => clearInterval(interval);
  }, [hasActiveJobs]);

  const handleCancel = async (jobId: string) => {
    if (
      !confirm(
        'Cancel this job?\n\nThe resource will not be processed and the job will be marked as cancelled.'
      )
    ) {
      return;
    }

    setCanceling((prev) => new Set(prev).add(jobId));

    try {
      const response = await fetch(`/api/admin/jobs/${jobId}/cancel`, {
        method: 'POST',
      });

      if (response.ok) {
        // Refresh jobs list
        const res = await fetch('/api/admin/jobs');
        if (res.ok) {
          const data = await res.json();
          setJobs(data.jobs);
        }
        // TODO: Show success toast
      } else {
        const errorData = (await response.json()) as { error?: string };
        // TODO: Show error toast
        console.error('Cancel failed:', errorData.error);
      }
    } catch (error) {
      console.error('Cancel error:', error);
      // TODO: Show error toast
    } finally {
      setCanceling((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  const handleRetry = async (jobId: string) => {
    if (
      !confirm(
        'Retry this job?\n\nIt will be re-queued and processing will start again from the beginning.'
      )
    ) {
      return;
    }

    setRetrying((prev) => new Set(prev).add(jobId));

    try {
      const response = await fetch(`/api/admin/jobs/${jobId}/retry`, {
        method: 'POST',
      });

      if (response.ok) {
        // Refresh jobs list
        const res = await fetch('/api/admin/jobs');
        if (res.ok) {
          const data = await res.json();
          setJobs(data.jobs);
        }
        // TODO: Show success toast
      } else {
        const errorData = (await response.json()) as { error?: string };
        // TODO: Show error toast
        console.error('Retry failed:', errorData.error);
      }
    } catch (error) {
      console.error('Retry error:', error);
      // TODO: Show error toast
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  if (jobs.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-6 items-center justify-center rounded-lg border border-dashed shadow-sm p-6 bg-muted min-h-64">
        <div className="flex flex-col items-center gap-1 text-center">
          <h3 className="text-2xl font-bold tracking-tight">
            No jobs found
          </h3>
          <p className="text-sm text-muted-foreground">
            Jobs appear here when resources are being processed.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin">Back to Admin</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TooltipProvider>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Game</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="w-[80px] text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const isCanceling = canceling.has(job.jobId);
              const isRetrying = retrying.has(job.jobId);

              return (
                <TableRow key={job.jobId}>
                  <TableCell className="align-middle">
                    <Badge variant={getStatusVariant(job.status)}>
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-middle">
                    {job.gameName ? (
                      <Link
                        href={`/admin/games/${job.gameId}`}
                        className="hover:underline text-sm"
                      >
                        {job.gameName}
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Unknown
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="align-middle">
                    {job.resourceName ? (
                      <Link
                        href={`/admin/games/${job.gameId}`}
                        className="hover:underline text-sm"
                      >
                        {job.resourceName}
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Unknown
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="align-middle">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {job.progress}%
                      </span>
                    </div>
                    {job.currentStep && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {job.currentStep}
                      </div>
                    )}
                    {job.error && (
                      <div
                        className="text-xs text-red-500 mt-1"
                        title={job.error}
                      >
                        {job.error.length > 50
                          ? `${job.error.slice(0, 50)}...`
                          : job.error}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground align-middle">
                    {formatDate(job.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground align-middle">
                    {formatDuration(job.createdAt, job.completedAt)}
                  </TableCell>
                  <TableCell className="align-middle">
                    <div className="flex items-center justify-center gap-2">
                      {canCancel(job) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              disabled={isCanceling}
                              onClick={() => handleCancel(job.jobId)}
                            >
                              <X className="h-4 w-4 text-red-500" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Cancel job</TooltipContent>
                        </Tooltip>
                      )}
                      {canRetry(job) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              disabled={isRetrying}
                              onClick={() => handleRetry(job.jobId)}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Retry job</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TooltipProvider>
    </div>
  );
}
```

---

## 5. Database Type Definition Update

Update `lib/db/schema/jobs.ts` to ensure the type matches what we use in the UI:

```typescript
// Add to lib/db/schema/jobs.ts

export interface JobWithDetails extends Job {
  jobId?: string;        // Alias for id
  resourceName?: string; // From resource join
  gameName?: string;     // From game join
}
```

---

## 6. Toast Notification Integration

Add this to each handler once you have a toast implementation:

```typescript
// Example with a hypothetical toast hook
import { useToast } from '@/hooks/use-toast'; // or similar

const { toast } = useToast();

// In handleCancel:
if (response.ok) {
  toast({
    title: 'Success',
    description: 'Job cancelled successfully!',
    variant: 'default',
  });
} else {
  toast({
    title: 'Error',
    description: 'Failed to cancel job. Please try again.',
    variant: 'destructive',
  });
}
```

---

## Implementation Checklist

- [ ] Copy Badge component code to `components/ui/badge.tsx`
- [ ] Copy Tooltip component code to `components/ui/tooltip.tsx`
- [ ] Copy utilities to `lib/utils/format-date.ts` and `lib/utils/jobs.ts`
- [ ] Create API routes (3 files)
- [ ] Create page component and client component
- [ ] Verify database schema includes jobs table
- [ ] Add toast notification integration
- [ ] Add link to jobs page in admin navigation
- [ ] Test all functionality

