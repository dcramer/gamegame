import { requireAdmin } from '@/lib/auth/helpers';
import AdminLayout from '@/components/admin-layout';
import JobsClient from './jobs-client';
import type { JobWithDetails } from '@/app/api/admin/jobs/route';
import { listWorkflowRunsWithDetails } from '@/lib/services/workflows';

export const metadata = {
  title: 'Jobs - Admin',
  description: 'View and manage resource processing jobs',
};

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  // Require admin authentication
  await requireAdmin();

  // Query workflow runs with details
  const runs = await listWorkflowRunsWithDetails({
    limit: 100,
  });

  // Format the response
  const formattedJobs: JobWithDetails[] = runs.map((run) => ({
    jobId: run.runId,
    type: run.workflowName,
    status: run.status,
    error: run.error || null,
    createdAt: run.createdAt.getTime(),
    completedAt: run.completedAt ? run.completedAt.getTime() : null,
    gameId: run.gameId,
    gameName: run.gameName,
    resourceId: run.resourceId,
    resourceName: run.resourceName,
  }));

  return (
    <AdminLayout>
      <JobsClient initialJobs={formattedJobs} />
    </AdminLayout>
  );
}
