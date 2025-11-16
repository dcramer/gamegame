/**
 * Individual Resource API Routes
 * GET /api/resources/:resourceId - Get single resource
 * PATCH /api/resources/:resourceId - Update resource (admin)
 * DELETE /api/resources/:resourceId - Delete resource (admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resources, fragments, attachments } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withAdmin, errorResponse, successResponse } from '@/lib/api/middleware';
import { updateResourceSchema } from '@/lib/api/schemas';
import { bulkDelete } from '@/lib/services/blob-storage';

/**
 * GET /api/resources/:resourceId
 * Get single resource with full details
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ resourceId: string }> }
) {
  try {
    const params = await props.params;
    const { resourceId } = params;

    const [resource] = await db
      .select({
        id: resources.id,
        gameId: resources.gameId,
        name: resources.name,
        originalFilename: resources.originalFilename,
        author: resources.author,
        attributionUrl: resources.attributionUrl,
        url: resources.url,
        content: resources.content,
        version: resources.version,
        pdfExtractor: resources.pdfExtractor,
        processedAt: resources.processedAt,
        status: resources.status,
        currentRunId: resources.currentRunId,
        processingStage: resources.processingStage,
        pageCount: resources.pageCount,
        imageCount: resources.imageCount,
        wordCount: resources.wordCount,
        description: resources.description,
        resourceType: resources.resourceType,
        edition: resources.edition,
        createdAt: resources.createdAt,
        updatedAt: resources.updatedAt,
      })
      .from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1);

    if (!resource) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
    }

    // Get fragment count
    const [{ count: fragmentCount }] = await db
      .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(fragments)
      .where(eq(fragments.resourceId, resourceId));

    return NextResponse.json({
      ...resource,
      fragmentCount,
    });
  } catch (error) {
    console.error('[GET /api/resources/:resourceId] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch resource' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/resources/:resourceId
 * Update resource metadata (admin only)
 */
export const PATCH = withAdmin(async (
  request: NextRequest,
  user,
  props?: { params: Promise<{ resourceId: string }> }
) => {
  try {
    if (!props) {
      return errorResponse('Invalid request', 400, 'INVALID_REQUEST');
    }

    const params = await props.params;
    const { resourceId } = params;
    const body = await request.json();
    const data = updateResourceSchema.parse(body);

    const updateData: any = {
      updatedAt: Date.now(),
    };

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.author !== undefined) {
      updateData.author = data.author;
    }
    if (data.attributionUrl !== undefined) {
      updateData.attributionUrl = data.attributionUrl;
    }

    const [updated] = await db
      .update(resources)
      .set(updateData)
      .where(eq(resources.id, resourceId))
      .returning();

    if (!updated) {
      return errorResponse('Resource not found', 404, 'NOT_FOUND');
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation error', 400, 'VALIDATION_ERROR', error.issues);
    }

    console.error('[PATCH /api/resources/:resourceId] Error:', error);
    return errorResponse('Failed to update resource', 500, 'INTERNAL_ERROR');
  }
});

/**
 * DELETE /api/resources/:resourceId
 * Delete resource and all associated data (admin only)
 */
export const DELETE = withAdmin(async (
  request: NextRequest,
  user,
  props?: { params: Promise<{ resourceId: string }> }
) => {
  try {
    if (!props) {
      return errorResponse('Invalid request', 400, 'INVALID_REQUEST');
    }

    const params = await props.params;
    const { resourceId } = params;

    // Collect data for cleanup before deletion
    const fragmentList = await db
      .select({ id: fragments.id })
      .from(fragments)
      .where(eq(fragments.resourceId, resourceId));

    const attachmentList = await db
      .select({ id: attachments.id, blobKey: attachments.blobKey })
      .from(attachments)
      .where(eq(attachments.resourceId, resourceId));

    // Delete from database (cascades to fragments and attachments)
    const result = await db
      .delete(resources)
      .where(eq(resources.id, resourceId))
      .returning();

    if (result.length === 0) {
      return errorResponse('Resource not found', 404, 'NOT_FOUND');
    }

    const errors: string[] = [];

    // Try to delete blob storage files
    if (attachmentList.length > 0) {
      try {
        const keys = attachmentList
          .map((a) => a.blobKey)
          .filter((key): key is string => typeof key === 'string' && key.length > 0);

        if (keys.length > 0) {
          await bulkDelete(keys);
        }
      } catch (error) {
        const errorMsg = `Failed to delete blob files: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[DELETE /api/resources/:resourceId] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    console.log(
      `[DELETE /api/resources/:resourceId] Deleted resource ${resourceId}: ${fragmentList.length} fragments, ${attachmentList.length} attachments`
    );

    return successResponse({
      success: errors.length === 0,
      deletedFragments: fragmentList.length,
      deletedAttachments: attachmentList.length,
      warnings: errors.length > 0 ? errors : undefined,
      message:
        errors.length > 0
          ? 'Resource deleted from database, but some cleanup operations failed'
          : 'Resource and all associated data deleted successfully',
    });
  } catch (error) {
    console.error('[DELETE /api/resources/:resourceId] Error:', error);
    return errorResponse('Failed to delete resource', 500, 'INTERNAL_ERROR');
  }
});
