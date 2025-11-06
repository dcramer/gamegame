import { requireAdmin } from '@/lib/auth/helpers';
import AdminLayout from '@/components/admin-layout';
import WorkflowsClient from './workflows.client';
import type { JobWithDetails } from '@/app/api/admin/workflows/route';
import { listWorkflowRunsWithDetails } from '@/lib/services/workflows';

export const metadata = {
  title: 'Workflows - Admin',
  description: 'View and manage workflow runs',
};

export const dynamic = 'force-dynamic';

export default async function WorkflowsPage() {
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
      <WorkflowsClient initialJobs={formattedJobs} />
    </AdminLayout>
  );
}
