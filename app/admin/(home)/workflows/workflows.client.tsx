'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { orpc } from '@/lib/procedures/client';
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
import type { JobWithDetails } from '@/app/api/admin/workflows/route';
import { EmptyState } from '@/components/empty-state';

type WorkflowsClientProps = {
  initialJobs: JobWithDetails[];
};

function getStatusVariant(
  status: string
): 'success' | 'error' | 'info' | 'warning' | 'neutral' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
    case 'cancelled':
      return 'error';
    case 'running':
      return 'info';
    case 'pending':
      return 'warning';
    default:
      return 'neutral';
  }
}

export default function WorkflowsClient({ initialJobs }: WorkflowsClientProps) {
  const [jobs, setJobs] = useState<JobWithDetails[]>(initialJobs);
  const [canceling, setCanceling] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

  // Memoize whether there are active jobs to avoid recreating interval
  const hasActiveJobs = useMemo(
    () => jobs.some((job) => job.status === 'pending' || job.status === 'running'),
    [jobs]
  );

  // Auto-refresh every 5 seconds for active jobs
  useEffect(() => {
    if (!hasActiveJobs) return;

    const refreshJobs = async () => {
      try {
        const data = await orpc.workflows.list({ limit: 100 });
        setJobs(data.jobs);
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
        'Cancel this workflow?\n\nThe resource will not be processed and the workflow will be marked as cancelled.'
      )
    ) {
      return;
    }

    setCanceling((prev) => new Set(prev).add(jobId));

    try {
      await orpc.workflows.cancel({ runId: jobId });

      // Refresh jobs list
      const data = await orpc.workflows.list({ limit: 100 });
      setJobs(data.jobs);
    } catch (error) {
      console.error('Cancel error:', error);
      const message = error instanceof Error ? error.message : 'Failed to cancel workflow';
      alert(message);
    } finally{
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
        'Retry this workflow?\n\nIt will be re-queued with the original parameters and processing will start again.'
      )
    ) {
      return;
    }

    setRetrying((prev) => new Set(prev).add(jobId));

    try {
      await orpc.workflows.retry({ runId: jobId });

      // Refresh jobs list
      const data = await orpc.workflows.list({ limit: 100 });
      setJobs(data.jobs);
    } catch (error) {
      console.error('Retry error:', error);
      const message = error instanceof Error ? error.message : 'Failed to retry workflow';
      alert(message);
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
      <EmptyState
        title="No workflows found"
        description="Workflow runs appear here when resources are being processed."
        action={{ label: "Back to Games", href: "/admin" }}
      />
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
              <TableHead>Error</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="w-[80px] text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const canCancel = job.status === 'pending' || job.status === 'running';
              const canRetry = job.status === 'failed' || job.status === 'cancelled';
              const isCanceling = canceling.has(job.runId);
              const isRetrying = retrying.has(job.runId);

              return (
                <TableRow key={job.runId}>
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
                      <span className="text-sm text-muted-foreground">Unknown</span>
                    )}
                  </TableCell>
                  <TableCell className="align-middle">
                    {job.resourceName ? (
                      <Link
                        href={`/admin/games/${job.gameId}/${job.resourceId}`}
                        className="hover:underline text-sm"
                      >
                        {job.resourceName}
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">Unknown</span>
                    )}
                  </TableCell>
                  <TableCell className="align-middle">
                    {job.error && (
                      <div className="text-xs text-destructive" title={job.error}>
                        {job.error.length > 100
                          ? `${job.error.slice(0, 100)}...`
                          : job.error}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground align-middle">
                    {formatDate(job.createdAt)}
                  </TableCell>
                  <TableCell
                    className="text-sm text-muted-foreground align-middle"
                    suppressHydrationWarning
                  >
                    {formatDuration(job.createdAt, job.completedAt ?? undefined)}
                  </TableCell>
                  <TableCell className="align-middle">
                    <div className="flex items-center justify-center gap-2">
                      {canCancel && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              disabled={isCanceling}
                              onClick={() => handleCancel(job.runId)}
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Cancel workflow</TooltipContent>
                        </Tooltip>
                      )}
                      {canRetry && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              disabled={isRetrying}
                              onClick={() => handleRetry(job.runId)}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Retry workflow</TooltipContent>
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
