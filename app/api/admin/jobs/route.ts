import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jobs, games, resources } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/helpers';
import { desc, eq } from 'drizzle-orm';

export type JobWithDetails = {
  jobId: string;
  type: string;
  status: string;
  progress: number;
  currentStep: string | null;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
  gameId: string;
  gameName: string | null;
  resourceId: string;
  resourceName: string | null;
};

export async function GET() {
  try {
    // Require admin authentication
    await requireAdmin();

    // Query jobs with joined game and resource data
    const jobsList = await db
      .select({
        jobId: jobs.id,
        type: jobs.type,
        status: jobs.status,
        progress: jobs.progress,
        currentStep: jobs.currentStep,
        error: jobs.error,
        createdAt: jobs.createdAt,
        completedAt: jobs.completedAt,
        gameId: jobs.gameId,
        gameName: games.name,
        resourceId: jobs.resourceId,
        resourceName: resources.name,
      })
      .from(jobs)
      .leftJoin(games, eq(jobs.gameId, games.id))
      .leftJoin(resources, eq(jobs.resourceId, resources.id))
      .orderBy(desc(jobs.createdAt));

    // Format the response
    const formattedJobs: JobWithDetails[] = jobsList.map((job) => ({
      jobId: job.jobId,
      type: job.type,
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep,
      error: job.error ? (typeof job.error === 'string' ? job.error : (job.error as any).message) : null,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      gameId: job.gameId,
      gameName: job.gameName,
      resourceId: job.resourceId,
      resourceName: job.resourceName,
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
