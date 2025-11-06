import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/helpers';
import { listWorkflowRunsWithDetails } from '@/lib/services/workflows';

export type JobWithDetails = {
  runId: string;
  type: string;
  status: string;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
  gameId: string | undefined;
  gameName: string | undefined;
  resourceId: string | undefined;
  resourceName: string | undefined;
};

export async function GET() {
  try {
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

    return NextResponse.json({ jobs: formattedJobs });
  } catch (error) {
    console.error('Error fetching jobs:', error);

    // Check if it's an authentication error
    if (error instanceof Error && error.message.includes('Admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}
