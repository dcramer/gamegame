/**
 * Shared types for workflow steps
 */

export interface ProcessResourceInput {
  runId: string;
  resourceId: string;
  gameId: string;
  gameName: string;
  name: string;
  url?: string | null;
  sourceKey?: string;
  fromStage?: 'ingest' | 'vision' | 'cleanup' | 'metadata' | 'embed';
}

export interface ProcessingMetadata {
  structuredKey: string;
}

export interface CleanupStalledJobsResult {
  success: boolean;
  totalJobs: number;
  stalledJobs: number;
  cleanedJobs: number;
  failedUpdates: number;
  errors: Array<{ runId: string; error: string }>;
}

export interface StalledJob {
  id: string;
  resourceId: string;
  gameId: string;
  currentStep: string | null;
  processingDuration: number;
  updatedAt: number;
}

export interface CleanupOrphanedBlobsResult {
  success: boolean;
  orphanedCount: number;
  deletedCount: number;
  failedDeletions: string[];
  error?: string;
}

export interface BlobReference {
  type: 'resource' | 'attachment';
  blobKey: string;
  id: string;
}
