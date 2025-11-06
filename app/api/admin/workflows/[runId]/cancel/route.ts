import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/helpers';
import { cancelWorkflowRun, getWorkflowRun } from '@/lib/services/workflows';

type Params = {
  params: Promise<{
    runId: string;
  }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    // Require admin authentication
    await requireAdmin();

    const { runId } = await params;

    // Get the workflow run
    const run = await getWorkflowRun(runId);

    if (!run) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Check if job can be cancelled
    if (run.status === 'completed') {
      return NextResponse.json(
        { error: 'Cannot cancel completed job' },
        { status: 400 }
      );
    }

    if (run.status === 'cancelled' || run.status === 'failed') {
      return NextResponse.json(
        { error: 'Job is already cancelled or failed' },
        { status: 400 }
      );
    }

    // Cancel the workflow run
    await cancelWorkflowRun(runId);

    return NextResponse.json({
      success: true,
      message: 'Job cancelled successfully',
    });
  } catch (error) {
    console.error('Error cancelling job:', error);

    // Check if it's an authentication error
    if (error instanceof Error && error.message.includes('Admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: 'Failed to cancel job' },
      { status: 500 }
    );
  }
}
