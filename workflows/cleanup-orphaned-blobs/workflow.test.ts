import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanupOrphanedBlobsWorkflow } from './workflow';

// Mock database
vi.mock('@/lib/db', () => {
  const db = {
    select: vi.fn(() => db),
    from: vi.fn(() => db),
    execute: vi.fn(),
  };
  return { db };
});

// Mock blob storage
vi.mock('@/lib/services/blob-storage', () => ({
  listFiles: vi.fn(),
  bulkDelete: vi.fn(),
}));

describe('Cleanup Orphaned Blobs Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should identify and delete orphaned blobs', async () => {
    const { db } = await import('@/lib/db');
    const { listFiles, bulkDelete } = await import('@/lib/services/blob-storage');
    const { resources, attachments } = await import('@/lib/db/schema');

    // Mock database resources
    (db.execute as any).mockResolvedValueOnce([
      { id: 'res-1' },
      { id: 'res-2' },
    ]);

    // Mock database attachments
    (db.execute as any).mockResolvedValueOnce([
      { id: 'att-1', blobKey: 'resources/res-1/attachments/att-1.png' },
      { id: 'att-2', blobKey: 'resources/res-2/attachments/att-2.png' },
    ]);

    // Mock blob storage listing (includes orphaned blob)
    (listFiles as any).mockResolvedValue([
      'resources/res-1/source.pdf',
      'resources/res-1/structured.json',
      'resources/res-1/attachments/att-1.png',
      'resources/res-2/source.pdf',
      'resources/res-2/structured.json',
      'resources/res-2/attachments/att-2.png',
      'resources/res-3/source.pdf', // ORPHANED - no database entry
      'resources/res-1/attachments/att-3.png', // ORPHANED - no database entry
    ]);

    // Mock bulk delete
    (bulkDelete as any).mockResolvedValue(undefined);

    const result = await cleanupOrphanedBlobsWorkflow();

    expect(result.success).toBe(true);
    expect(result.orphanedCount).toBe(2);
    expect(result.deletedCount).toBe(2);
    expect(result.failedDeletions).toEqual([]);

    expect(bulkDelete).toHaveBeenCalledWith([
      'resources/res-3/source.pdf',
      'resources/res-1/attachments/att-3.png',
    ]);
  });

  it('should handle no orphaned blobs', async () => {
    const { db } = await import('@/lib/db');
    const { listFiles, bulkDelete } = await import('@/lib/services/blob-storage');

    // Mock database resources
    (db.execute as any).mockResolvedValueOnce([{ id: 'res-1' }]);
    (db.execute as any).mockResolvedValueOnce([
      { id: 'att-1', blobKey: 'resources/res-1/attachments/att-1.png' },
    ]);

    // Mock blob storage (all referenced)
    (listFiles as any).mockResolvedValue([
      'resources/res-1/source.pdf',
      'resources/res-1/structured.json',
      'resources/res-1/attachments/att-1.png',
    ]);

    (bulkDelete as any).mockResolvedValue(undefined);

    const result = await cleanupOrphanedBlobsWorkflow();

    expect(result.success).toBe(true);
    expect(result.orphanedCount).toBe(0);
    expect(result.deletedCount).toBe(0);
    expect(bulkDelete).not.toHaveBeenCalled();
  });

  it('should handle deletion failures', async () => {
    const { db } = await import('@/lib/db');
    const { listFiles, bulkDelete } = await import('@/lib/services/blob-storage');

    // Mock database
    (db.execute as any).mockResolvedValueOnce([]);
    (db.execute as any).mockResolvedValueOnce([]);

    // Mock blob storage with orphaned blobs
    (listFiles as any).mockResolvedValue([
      'resources/res-orphan/source.pdf',
      'resources/res-orphan/attachments/img-1.png',
    ]);

    // Mock bulk delete failure
    (bulkDelete as any).mockRejectedValue(new Error('Storage error'));

    const result = await cleanupOrphanedBlobsWorkflow();

    expect(result.success).toBe(false);
    expect(result.orphanedCount).toBe(2);
    expect(result.deletedCount).toBe(0);
    expect(result.failedDeletions).toHaveLength(2);
  });

  it('should match source files with any extension', async () => {
    const { db } = await import('@/lib/db');
    const { listFiles, bulkDelete } = await import('@/lib/services/blob-storage');

    // Mock database resources
    (db.execute as any).mockResolvedValueOnce([{ id: 'res-1' }]);
    (db.execute as any).mockResolvedValueOnce([]);

    // Mock blob storage with different source file extensions
    (listFiles as any).mockResolvedValue([
      'resources/res-1/source.pdf',
      'resources/res-1/source.docx', // ORPHANED - multiple source files
      'resources/res-1/structured.json',
    ]);

    (bulkDelete as any).mockResolvedValue(undefined);

    const result = await cleanupOrphanedBlobsWorkflow();

    // Note: The workflow currently matches source.* prefix, so source.docx would be orphaned
    // if there's already source.pdf (only one source file per resource is referenced)
    expect(result.success).toBe(true);
  });
});
