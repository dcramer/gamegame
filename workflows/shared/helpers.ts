/**
 * Shared helper functions for workflow steps
 *
 * These helpers can be imported and used by any step that needs them.
 * They have full Node.js access since they're imported by steps, not workflows.
 */

import { db } from '@/lib/db';
import { resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { StructuredPDFContent, PDFImage } from '@/lib/types/pdf';
import type { ProcessingMetadata, ProcessResourceInput } from './types';

// ==========================================
// Resource Failure Helper
// ==========================================

export async function markResourceFailed(resourceId: string, error: string) {
  await db
    .update(resources)
    .set({
      status: 'failed',
      processingStage: 'failed',
      processingMetadata: null,
      currentRunId: null,
      updatedAt: Date.now(),
    })
    .where(eq(resources.id, resourceId));
}

// ==========================================
// Workflow Conflict Resolution
// ==========================================

/**
 * Check if a resource is being processed by another workflow.
 * If the existing workflow is no longer running, clears the currentRunId.
 *
 * @returns true if there's an active conflict, false if safe to proceed
 */
export async function hasActiveWorkflowConflict(
  resourceId: string,
  currentRunId: string,
  existingRunId: string | null,
  tx: any
): Promise<boolean> {
  if (!existingRunId || existingRunId === currentRunId) {
    return false; // No conflict
  }

  // Check if the existing workflow is actually still running
  try {
    const { getWorkflowRun } = await import('@/lib/services/workflows');
    const existingRun = await getWorkflowRun(existingRunId);

    // If workflow is still active, we have a conflict
    if (existingRun.status === 'running' || existingRun.status === 'pending') {
      return true;
    }

    // Workflow is done/failed/cancelled, clear the reference
    console.log(
      `[Workflow Conflict] Clearing stale currentRunId ${existingRunId} (status: ${existingRun.status}) for resource ${resourceId}`
    );
  } catch (error) {
    // Workflow not found - it was cleaned up, safe to clear
    console.log(
      `[Workflow Conflict] Clearing orphaned currentRunId ${existingRunId} for resource ${resourceId} (workflow not found)`
    );
  }

  // Clear the stale currentRunId
  await tx
    .update(resources)
    .set({
      currentRunId: currentRunId,
      updatedAt: Date.now(),
    })
    .where(eq(resources.id, resourceId));

  return false; // No active conflict
}

// ==========================================
// Metadata Helpers
// ==========================================

export function defaultMetadata(resourceId: string): ProcessingMetadata {
  return {
    structuredKey: `resources/${resourceId}/structured.json`,
    stages: {
      ingest: false,
      vision: false,
      cleanup: false,
      metadata: false,
      embed: false,
    },
  };
}

export function parseMetadata(resourceId: string, value?: string | null): ProcessingMetadata {
  if (!value) {
    return defaultMetadata(resourceId);
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') {
      return defaultMetadata(resourceId);
    }

    return {
      structuredKey: typeof parsed.structuredKey === 'string' ? parsed.structuredKey : `resources/${resourceId}/structured.json`,
      stages: {
        ingest: parsed.stages?.ingest === true,
        vision: parsed.stages?.vision === true,
        cleanup: parsed.stages?.cleanup === true,
        metadata: parsed.stages?.metadata === true,
        embed: parsed.stages?.embed === true,
      },
    };
  } catch {
    return defaultMetadata(resourceId);
  }
}

export function serializeMetadata(metadata: ProcessingMetadata): string {
  return JSON.stringify(metadata);
}

// ==========================================
// Storage Helpers
// ==========================================

export async function saveStructured(resourceId: string, structured: StructuredPDFContent): Promise<void> {
  const { uploadBlob } = await import('@/lib/services/blob-storage');
  const key = `resources/${resourceId}/structured.json`;
  const buffer = Buffer.from(JSON.stringify(structured));
  await uploadBlob(key, buffer, 'application/json');
}

export async function loadStructured(resourceId: string): Promise<StructuredPDFContent> {
  const { getBlob } = await import('@/lib/services/blob-storage');
  const key = `resources/${resourceId}/structured.json`;
  const data = await getBlob(key);

  if (!data) {
    throw new Error(`Structured data not found for resource ${resourceId}`);
  }

  return JSON.parse(data.toString('utf-8')) as StructuredPDFContent;
}

export async function fetchDocumentBuffer(input: ProcessResourceInput): Promise<{ buffer: Buffer; mimeType: string }> {
  if (input.sourceKey) {
    const { getBlob } = await import('@/lib/services/blob-storage');
    const data = await getBlob(input.sourceKey);

    if (data) {
      const { detectMimeType } = await import('@/lib/services/blob-storage');
      const mimeType = detectMimeType(data) || 'application/pdf';
      return { buffer: data, mimeType };
    }
  }

  if (!input.url) {
    throw new Error('No URL or source key provided for document ingestion');
  }

  // If URL is a relative path and we're using local storage, read from filesystem
  if (input.url.startsWith('/') && !process.env.BLOB_READ_WRITE_TOKEN) {
    const path = await import('node:path');
    const { readFile } = await import('node:fs/promises');
    const { detectMimeType } = await import('@/lib/services/blob-storage');

    const filePath = path.join(process.cwd(), 'public', input.url);
    try {
      const buffer = await readFile(filePath);
      const mimeType = detectMimeType(buffer) || 'application/pdf';
      return { buffer, mimeType };
    } catch (error) {
      throw new Error(`Failed to read file from local storage at "${filePath}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Otherwise use fetch for absolute URLs (Vercel Blob, etc)
  const response = await fetch(input.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch document (status ${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get('content-type') || 'application/pdf';

  return { buffer, mimeType };
}

// ==========================================
// Image Helpers
// ==========================================

export function namespaceImageId(resourceId: string, image: PDFImage): string {
  const baseId = image.id.replace(/\.[^./]+$/, '');
  if (!baseId.startsWith(resourceId)) {
    return `${resourceId}-${baseId}`;
  }
  return baseId;
}
