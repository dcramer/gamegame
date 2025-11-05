import { db } from '@/lib/db';
import { jobs, games, resources } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/helpers';
import { desc, eq } from 'drizzle-orm';
import AdminLayout from '@/components/admin-layout';
import JobsClient from './jobs-client';
import type { JobWithDetails } from '@/app/api/admin/jobs/route';

export const metadata = {
  title: 'Jobs - Admin',
  description: 'View and manage resource processing jobs',
};

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
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
    error: job.error
      ? typeof job.error === 'string'
        ? job.error
        : (job.error as any).message
      : null,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    gameId: job.gameId,
    gameName: job.gameName,
    resourceId: job.resourceId,
    resourceName: job.resourceName,
  }));

  return (
    <AdminLayout>
      <JobsClient initialJobs={formattedJobs} />
    </AdminLayout>
  );
}
