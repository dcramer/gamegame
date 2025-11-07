import { requireAdmin } from '@/lib/auth/helpers';
import WorkflowsClient from './workflows.client';
import type { JobWithDetails } from '@/app/api/admin/workflows/route';
import { listWorkflowRunsWithDetails } from '@/lib/services/workflows';

export const metadata = {
  title: 'Workflows - Admin',
  description: 'View and manage workflow runs',
};

export default async function WorkflowsPage() {
  // Require admin authentication
  await requireAdmin();

  // Query workflow runs with details
  const runs = await listWorkflowRunsWithDetails({
    limit: 100,
  });

  // Format the response
  const formattedJobs: JobWithDetails[] = runs.map((run) => ({
    runId: run.runId,
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

  return <WorkflowsClient initialJobs={formattedJobs} />;
}
