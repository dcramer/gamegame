/**
 * List Blobs Step
 */

'use step';

export async function listAllBlobs(): Promise<string[]> {
  try {
    const { listFiles } = await import('@/lib/services/blob-storage');
    const blobs = await listFiles('resources/');

    console.log(`[Cleanup] Found ${blobs.length} blobs in storage`);
    return blobs;
  } catch (error) {
    console.error('[Cleanup] Error listing blobs:', error);
    throw error;
  }
}
