import { useState, useEffect, useMemo } from 'react';
import { Link, useLoaderData } from 'react-router';
import { X, RotateCcw } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';
import { PageHeader } from '../components/PageHeader';
import { useFlashNotifications } from '../hooks/useFlashNotifications';
import { EmptyState } from '../components/EmptyState';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { type JobWithDetails, jobsListResponseSchema } from '../lib/schemas';
import { apiClient } from '../../load-context';
import { createMeta, createAdminTitle } from '../lib/meta';

export const meta = () => {
  return createMeta({
    title: createAdminTitle('Jobs'),
    description: 'View and manage resource processing jobs.',
    noIndex: true,
  });
};

export async function loader({ context }: any) {
  const { requireAdmin } = await import('../lib/auth');
  await requireAdmin(context.api);

  const res = await context.api.fetch('/resources/jobs');
  if (!res.ok) {
    throw new Error('Failed to load jobs');
  }
  const data = await res.json();
  const jobs = jobsListResponseSchema.parse(data);
  return { jobs: jobs.jobs };
}

function formatDate(timestamp: number): string {
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

function formatDuration(start: number, end?: number): string {
  const endTime = end || Date.now();
  const diff = endTime - start;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes < 1) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function getStatusVariant(status: string): 'success' | 'error' | 'info' | 'warning' | 'neutral' {
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

export default function AdminJobs() {
  const { jobs: initialJobs } = useLoaderData<typeof loader>();
  const [jobs, setJobs] = useState<JobWithDetails[]>(initialJobs);
  const [canceling, setCanceling] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const { addToast } = useFlashNotifications();

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
        const res = await apiClient.fetch('/resources/jobs');
        if (res.ok) {
          const data = await res.json();
          const parsed = jobsListResponseSchema.parse(data);
          setJobs(parsed.jobs);
        }
      } catch (error) {
        console.error('Failed to refresh jobs:', error);
      }
    };

    const interval = setInterval(refreshJobs, 5000);

    return () => clearInterval(interval);
  }, [hasActiveJobs]);

  const handleCancel = async (jobId: string) => {
    if (!confirm('Cancel this job?\n\nThe resource will not be processed and the job will be marked as cancelled.')) {
      return;
    }

    setCanceling((prev) => new Set(prev).add(jobId));

    try {
      const response = await apiClient.fetch(`/resources/jobs/${jobId}/cancel`, {
        method: 'POST',
      });

      if (response.ok) {
        // Refresh jobs list
        const res = await apiClient.fetch('/resources/jobs');
        if (res.ok) {
          const data = await res.json();
          const parsed = jobsListResponseSchema.parse(data);
          setJobs(parsed.jobs);
        }
        addToast('success', 'Job cancelled successfully!');
      } else {
        const errorData = await response.json() as { error?: string };
        addToast('error', errorData.error || 'Failed to cancel job');
      }
    } catch (error) {
      console.error('Cancel error:', error);
      addToast('error', 'Failed to cancel job. Please try again.');
    } finally {
      setCanceling((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  const handleRetry = async (jobId: string) => {
    if (!confirm('Retry this job?\n\nIt will be re-queued and processing will start again from the beginning.')) {
      return;
    }

    setRetrying((prev) => new Set(prev).add(jobId));

    try {
      const response = await apiClient.fetch(`/resources/jobs/${jobId}/retry`, {
        method: 'POST',
      });

      if (response.ok) {
        // Refresh jobs list
        const res = await apiClient.fetch('/resources/jobs');
        if (res.ok) {
          const data = await res.json();
          const parsed = jobsListResponseSchema.parse(data);
          setJobs(parsed.jobs);
        }
        addToast('success', 'Job retrying!');
      } else {
        const errorData = await response.json() as { error?: string };
        addToast('error', errorData.error || 'Failed to retry job');
      }
    } catch (error) {
      console.error('Retry error:', error);
      addToast('error', 'Failed to retry job. Please try again.');
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        breadcrumbs={[{ label: 'Admin', href: '/admin' }]}
        title="Jobs"
        description="View and manage resource processing jobs"
      />

      {jobs.length === 0 ? (
        <EmptyState
          title="No jobs found"
          description="Jobs appear here when resources are being processed."
          action={{ label: 'Back to Admin', href: '/admin' }}
        />
      ) : (
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
                  const canRetry = job.status === 'failed';
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
                            to={`/admin/games/${job.gameId}`}
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
                            to={`/admin/games/${job.gameId}?resourceId=${job.resourceId}`}
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
                          <div className="text-xs text-destructive mt-1" title={job.error}>
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
                          {canCancel && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="destructive-outline"
                                  className="h-8 w-8 p-0"
                                  disabled={isCanceling}
                                  onClick={() => handleCancel(job.jobId)}
                                >
                                  <X className="h-4 w-4" />
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
      )}
    </AdminLayout>
  );
}
