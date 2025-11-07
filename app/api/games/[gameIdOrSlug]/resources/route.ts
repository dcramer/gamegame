/**
 * Game Resources API Routes
 * GET /api/games/:gameIdOrSlug/resources - List all resources for a game
 * POST /api/games/:gameIdOrSlug/resources - Upload new resource (admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { db } from '@/lib/db';
import { games, resources, fragments } from '@/lib/db/schema';
import { eq, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { withAdmin, errorResponse, successResponse } from '@/lib/api/middleware';
import { processResourceWorkflow } from '@/workflows/process-resource/index';

/**
 * GET /api/games/:gameIdOrSlug/resources
 * List all resources for a game
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ gameIdOrSlug: string }> }
) {
  try {
    const params = await props.params;
    const { gameIdOrSlug } = params;

    // Get game to ensure it exists and get its ID
    const [game] = await db
      .select({ id: games.id, name: games.name })
      .from(games)
      .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
      .limit(1);

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    // Get resources for this game with fragment counts
    const resourceList = await db
      .select({
        id: resources.id,
        name: resources.name,
        description: resources.description,
        url: resources.url,
        version: resources.version,
        pdfExtractor: resources.pdfExtractor,
        processedAt: resources.processedAt,
        status: resources.status,
        currentRunId: resources.currentRunId,
        processingStage: resources.processingStage,
        pageCount: resources.pageCount,
        imageCount: resources.imageCount,
        wordCount: resources.wordCount,
        resourceType: resources.resourceType,
        edition: resources.edition,
        fragmentCount: sql<number>`COUNT(${fragments.id})`.mapWith(Number),
        createdAt: resources.createdAt,
        updatedAt: resources.updatedAt,
      })
      .from(resources)
      .leftJoin(fragments, eq(resources.id, fragments.resourceId))
      .where(eq(resources.gameId, game.id))
      .groupBy(resources.id)
      .orderBy(resources.createdAt);

    // Resources already have bigint timestamps, no conversion needed
    const parsed = resourceList;

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('[GET /api/games/:gameIdOrSlug/resources] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch resources' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/games/:gameIdOrSlug/resources
 * Upload new resource for processing (admin only)
 */
export const POST = withAdmin(async (
  request: NextRequest,
  user,
  props?: { params: Promise<{ gameIdOrSlug: string }> }
) => {
  try {
    if (!props) {
      return errorResponse('Invalid request', 400, 'INVALID_REQUEST');
    }

    const params = await props.params;
    const { gameIdOrSlug } = params;

    // Get game
    const [game] = await db
      .select({ id: games.id, name: games.name })
      .from(games)
      .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
      .limit(1);

    if (!game) {
      return errorResponse('Game not found', 404, 'NOT_FOUND');
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const name = formData.get('name') as string || file.name;
    const url = formData.get('url') as string | null;

    if (!file && !url) {
      return errorResponse('Either file or url must be provided', 400, 'VALIDATION_ERROR');
    }

    // Create resource record
    const resourceId = nanoid();
    let sourceKey: string | null = null;
    let uploadedUrl: string | null = null;

    // If file is provided, upload to blob storage
    if (file) {
      const { uploadBlob } = await import('@/lib/services/blob-storage');
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Determine file extension
      const extension = file.name.split('.').pop() || 'pdf';
      sourceKey = `resources/${resourceId}/source.${extension}`;

      // uploadBlob returns the URL (Vercel Blob URL or local path like /uploads/...)
      uploadedUrl = await uploadBlob(sourceKey, buffer, file.type);
    }

    // Create run ID for workflow
    const runId = nanoid();

    // Insert resource with workflow run ID
    await db.insert(resources).values({
      id: resourceId,
      gameId: game.id,
      name,
      url: url || uploadedUrl || '',
      originalFilename: file?.name || undefined,
      status: 'processing',
      processingStage: 'ingest',
      currentRunId: runId,
      processingMetadata: undefined,
      resourceType: 'rulebook',
    });

    // Trigger processing workflow using direct invocation
    const workflowInput = {
      runId,
      resourceId,
      gameId: game.id,
      gameName: game.name,
      name,
      url,
      sourceKey,
    };

    // Start workflow asynchronously (don't await to avoid blocking the response)
    start(processResourceWorkflow, [workflowInput]).catch((error) => {
      console.error('[POST resources] Workflow start error:', error);
      // Mark resource as failed if workflow fails to start
      db.update(resources)
        .set({
          status: 'failed',
          processingStage: 'failed',
          processingMetadata: null,
          currentRunId: null,
          updatedAt: Date.now(),
        })
        .where(eq(resources.id, resourceId))
        .catch((err) => console.error('[POST resources] Failed to update resource:', err));
    });

    const [newResource] = await db
      .select()
      .from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1);

    return successResponse(newResource, 201);
  } catch (error) {
    console.error('[POST /api/games/:gameIdOrSlug/resources] Error:', error);
    return errorResponse('Failed to create resource', 500, 'INTERNAL_ERROR');
  }
});
