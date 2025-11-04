/**
 * Game Resources API Routes
 * GET /api/games/:gameIdOrSlug/resources - List all resources for a game
 * POST /api/games/:gameIdOrSlug/resources - Upload new resource (admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { games, resources, fragments } from '@/lib/db/schema';
import { eq, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireAdmin } from '@/lib/auth/helpers';

/**
 * GET /api/games/:gameIdOrSlug/resources
 * List all resources for a game
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { gameIdOrSlug: string } }
) {
  try {
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
        currentJobId: resources.currentJobId,
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
export async function POST(
  request: NextRequest,
  { params }: { params: { gameIdOrSlug: string } }
) {
  try {
    // Require admin authentication
    await requireAdmin();

    const { gameIdOrSlug } = params;

    // Get game
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

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const name = formData.get('name') as string || file.name;
    const url = formData.get('url') as string | null;

    if (!file && !url) {
      return NextResponse.json(
        { error: 'Either file or url must be provided' },
        { status: 400 }
      );
    }

    // Create resource record
    const resourceId = nanoid();
    let sourceKey: string | null = null;

    // If file is provided, upload to blob storage
    if (file) {
      const { uploadBlob } = await import('@/lib/services/blob-storage');
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Determine file extension
      const extension = file.name.split('.').pop() || 'pdf';
      sourceKey = `resources/${resourceId}/source.${extension}`;

      await uploadBlob(sourceKey, buffer, file.type);
    }

    // Insert resource
    await db.insert(resources).values({
      id: resourceId,
      gameId: game.id,
      name,
      description: null,
      url: url ?? null,
      originalFilename: file?.name ?? null,
      status: 'pending',
      processingStage: 'pending',
      currentJobId: null,
      processingMetadata: null,
      content: null,
      version: null,
      pdfExtractor: null,
      processedAt: null,
      pageCount: null,
      imageCount: 0,
      wordCount: 0,
      resourceType: 'rulebook',
      edition: null,
    });

    // Trigger processing workflow
    const workflowUrl = new URL('/api/workflows/process-resource', request.url);
    const workflowResponse = await fetch(workflowUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId: nanoid(),
        resourceId,
        gameId: game.id,
        gameName: game.name,
        name,
        url,
        sourceKey,
      }),
    });

    if (!workflowResponse.ok) {
      console.error('[POST resources] Failed to trigger workflow:', await workflowResponse.text());
    }

    const [newResource] = await db
      .select()
      .from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1);

    return NextResponse.json(newResource, { status: 201 });
  } catch (error) {
    console.error('[POST /api/games/:gameIdOrSlug/resources] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create resource' },
      { status: 500 }
    );
  }
}
