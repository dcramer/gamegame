import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jobs, resources } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/helpers';
import { eq, and } from 'drizzle-orm';

type Params = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    // Require admin authentication
    await requireAdmin();

    const { jobId } = await params;

    // Get the job
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Check if job can be cancelled
    if (job.status === 'completed') {
      return NextResponse.json(
        { error: 'Cannot cancel completed job' },
        { status: 400 }
      );
    }

    if (job.status === 'cancelled' || job.status === 'failed') {
      return NextResponse.json(
        { error: 'Job is already cancelled or failed' },
        { status: 400 }
      );
    }

    // Update job status to cancelled
    await db
      .update(jobs)
      .set({
        status: 'cancelled',
        error: { message: 'Job cancelled by admin' },
        updatedAt: Date.now(),
        completedAt: Date.now(),
      })
      .where(eq(jobs.id, jobId));

    // Update resource status if it's still associated with this job
    await db
      .update(resources)
      .set({
        status: 'failed',
        currentJobId: null,
        updatedAt: Date.now(),
      })
      .where(
        and(eq(resources.id, job.resourceId), eq(resources.currentJobId, jobId))
      );

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
