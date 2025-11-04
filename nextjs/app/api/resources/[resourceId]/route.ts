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
import { requireAdmin } from '@/lib/auth/helpers';

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
        url: resources.url,
        content: resources.content,
        version: resources.version,
        pdfExtractor: resources.pdfExtractor,
        processedAt: resources.processedAt,
        status: resources.status,
        currentJobId: resources.currentJobId,
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

const updateResourceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

/**
 * PATCH /api/resources/:resourceId
 * Update resource metadata (admin only)
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ resourceId: string }> }
) {
  try {
    // Require admin authentication
    await requireAdmin();

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

    const [updated] = await db
      .update(resources)
      .set(updateData)
      .where(eq(resources.id, resourceId))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    console.error('[PATCH /api/resources/:resourceId] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update resource' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/resources/:resourceId
 * Delete resource and all associated data (admin only)
 */
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ resourceId: string }> }
) {
  try {
    // Require admin authentication
    await requireAdmin();

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
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
    }

    const errors: string[] = [];

    // Try to delete blob storage files
    if (attachmentList.length > 0) {
      try {
        const { bulkDelete } = await import('@/lib/services/blob-storage');
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

    return NextResponse.json({
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
    return NextResponse.json(
      { error: 'Failed to delete resource' },
      { status: 500 }
    );
  }
}
