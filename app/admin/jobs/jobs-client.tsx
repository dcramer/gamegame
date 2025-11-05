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
import type { JobWithDetails } from '@/app/api/admin/jobs/route';
import { EmptyState } from '@/components/empty-state';

type JobsClientProps = {
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
    case 'processing':
      return 'info';
    case 'pending':
      return 'warning';
    default:
      return 'neutral';
  }
}

export default function JobsClient({ initialJobs }: JobsClientProps) {
  const [jobs, setJobs] = useState<JobWithDetails[]>(initialJobs);
  const [canceling, setCanceling] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

  // Memoize whether there are active jobs to avoid recreating interval
  const hasActiveJobs = useMemo(
    () => jobs.some((job) => job.status === 'pending' || job.status === 'processing'),
    [jobs]
  );

  // Auto-refresh every 5 seconds for active jobs
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
      } else {
        const errorData = (await response.json()) as { error?: string };
        alert(errorData.error || 'Failed to cancel job');
      }
    } catch (error) {
      console.error('Cancel error:', error);
      alert('Failed to cancel job. Please try again.');
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
      } else {
        const errorData = (await response.json()) as { error?: string };
        alert(errorData.error || 'Failed to retry job');
      }
    } catch (error) {
      console.error('Retry error:', error);
      alert('Failed to retry job. Please try again.');
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
        title="No jobs found"
        description="Jobs appear here when resources are being processed."
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
              <TableHead>Progress</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="w-[80px] text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const canCancel = job.status === 'pending' || job.status === 'processing';
              const canRetry = job.status === 'failed' || job.status === 'cancelled';
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
                      <div className="text-xs text-red-500 mt-1" title={job.error}>
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
                              onClick={() => handleCancel(job.jobId)}
                            >
                              <X className="h-4 w-4 text-red-500" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Cancel job</TooltipContent>
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
