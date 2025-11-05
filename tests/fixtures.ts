/**
 * Test fixture creators
 *
 * Create test data for games, resources, attachments, fragments, etc.
 * All fixtures use the real database and return actual database records.
 *
 * Philosophy: Use real database inserts, not mocks.
 */

import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { nanoid } from 'nanoid';

/**
 * Create a test game
 *
 * @example
 * const game = await createTestGame({ name: 'Arcs' });
 * const game = await createTestGame(); // Uses default values
 */
export async function createTestGame(
  data?: Partial<typeof schema.games.$inferInsert>
): Promise<typeof schema.games.$inferSelect> {
  const gameData: typeof schema.games.$inferInsert = {
    id: nanoid(),
    name: 'Test Game',
    slug: `test-game-${nanoid(6)}`,
    year: null,
    imageUrl: null,
    bggUrl: null,
    ...data,
  };

  const [game] = await db.insert(schema.games).values(gameData).returning();
  return game;
}

/**
 * Create a test resource
 *
 * @example
 * const resource = await createTestResource(game.id);
 * const resource = await createTestResource(game.id, {
 *   name: 'Rulebook',
 *   content: '# Custom content'
 * });
 */
export async function createTestResource(
  gameId: string,
  data?: Partial<typeof schema.resources.$inferInsert>
): Promise<typeof schema.resources.$inferSelect> {
  const resourceData: typeof schema.resources.$inferInsert = {
    id: nanoid(),
    gameId,
    name: 'Test Resource',
    url: 'https://example.com/test.pdf',
    content: '# Test Content\n\nThis is test content for a resource.',
    version: 3,
    pdfExtractor: 'mistral',
    status: 'ready',
    processingStage: null,
    processingMetadata: null,
    currentJobId: null,
    pageCount: 10,
    imageCount: 5,
    wordCount: 1000,
    ...data,
  };

  const [resource] = await db.insert(schema.resources).values(resourceData).returning();
  return resource;
}

/**
 * Create a test attachment
 *
 * @example
 * const attachment = await createTestAttachment(resource.id, game.id);
 * const attachment = await createTestAttachment(resource.id, game.id, {
 *   type: 'image',
 *   pageNumber: 5
 * });
 */
export async function createTestAttachment(
  resourceId: string,
  gameId: string,
  data?: Partial<typeof schema.attachments.$inferInsert>
): Promise<typeof schema.attachments.$inferSelect> {
  const attachmentId = nanoid();
  const attachmentData: typeof schema.attachments.$inferInsert = {
    id: attachmentId,
    gameId,
    resourceId,
    type: 'image',
    blobKey: `test-attachments/${attachmentId}.png`,
    url: `https://example.com/uploads/resources/${resourceId}/attachments/${attachmentId}.png`,
    mimeType: 'image/png',
    originalFilename: 'test-image.png',
    pageNumber: 1,
    bbox: null,
    caption: 'Test image caption',
    width: 800,
    height: 600,
    ...data,
  };

  const [attachment] = await db.insert(schema.attachments).values(attachmentData).returning();
  return attachment;
}

/**
 * Create a test fragment
 *
 * @example
 * const fragment = await createTestFragment(resource.id, game.id);
 * const fragment = await createTestFragment(resource.id, game.id, {
 *   content: 'Custom fragment content',
 *   pageNumber: 3
 * });
 */
export async function createTestFragment(
  resourceId: string,
  gameId: string,
  data?: Partial<typeof schema.fragments.$inferInsert>
): Promise<typeof schema.fragments.$inferSelect> {
  // Generate a random embedding vector (1536 dimensions for text-embedding-3-small)
  const embedding = Array(1536)
    .fill(0)
    .map(() => Math.random());

  const fragmentData: typeof schema.fragments.$inferInsert = {
    id: nanoid(),
    gameId,
    resourceId,
    content: 'This is test fragment content for search and retrieval.',
    embedding,
    version: 3,
    pageNumber: 1,
    pageRange: null,
    section: 'Test Section',
    images: null,
    ...data,
  };

  const [fragment] = await db.insert(schema.fragments).values(fragmentData).returning();
  return fragment;
}

/**
 * Create a test user
 *
 * @example
 * const user = await createTestUser({ email: 'test@example.com' });
 * const admin = await createTestUser({ email: 'admin@example.com', isAdmin: true });
 */
export async function createTestUser(
  data?: Partial<typeof schema.users.$inferInsert>
): Promise<typeof schema.users.$inferSelect> {
  const userData: typeof schema.users.$inferInsert = {
    id: nanoid(),
    email: `test-${nanoid(6)}@example.com`,
    name: null,
    image: null,
    isAdmin: 0, // 0 = false, 1 = true (integer field)
    emailVerified: null,
    ...data,
  };

  const [user] = await db.insert(schema.users).values(userData).returning();
  return user;
}

/**
 * Create a test BGG game entry
 *
 * @example
 * const bggGame = await createTestBGGGame({ bggId: '224517', name: 'Brass: Birmingham' });
 */
export async function createTestBGGGame(
  data?: Partial<typeof schema.bggGames.$inferInsert>
): Promise<typeof schema.bggGames.$inferSelect> {
  const bggGameData: typeof schema.bggGames.$inferInsert = {
    id: nanoid(),
    bggId: `${Math.floor(Math.random() * 1000000)}`,
    name: 'Test Board Game',
    year: 2023,
    description: 'Test game description',
    imageUrl: 'https://cf.geekdo-images.com/test.jpg',
    thumbnailUrl: 'https://cf.geekdo-images.com/thumb.jpg',
    minPlayers: 2,
    maxPlayers: 4,
    playingTime: 60,
    minAge: 10,
    designers: ['Test Designer'],
    publishers: ['Test Publisher'],
    ...data,
  };

  const [bggGame] = await db.insert(schema.bggGames).values(bggGameData).returning();
  return bggGame;
}

/**
 * Create a test job
 *
 * @example
 * const job = await createTestJob({ resourceId: resource.id });
 */
export async function createTestJob(
  data?: Partial<typeof schema.jobs.$inferInsert>
): Promise<typeof schema.jobs.$inferSelect> {
  const jobData: typeof schema.jobs.$inferInsert = {
    id: nanoid(),
    type: 'process-resource',
    resourceId: nanoid(),
    gameId: nanoid(),
    status: 'pending',
    progress: 0,
    currentStep: null,
    error: null,
    metadata: null,
    ...data,
  };

  const [job] = await db.insert(schema.jobs).values(jobData).returning();
  return job;
}

/**
 * Create a complete test game with resource and fragments
 *
 * Useful for integration tests that need a fully set up game.
 *
 * @example
 * const { game, resource, fragments } = await createTestGameWithResource();
 * const { game, resource, fragments } = await createTestGameWithResource({
 *   gameName: 'Arcs',
 *   fragmentCount: 5
 * });
 */
export async function createTestGameWithResource(options?: {
  gameName?: string;
  resourceName?: string;
  fragmentCount?: number;
}) {
  const { gameName = 'Test Game', resourceName = 'Test Resource', fragmentCount = 3 } = options || {};

  const game = await createTestGame({ name: gameName });
  const resource = await createTestResource(game.id, { name: resourceName });

  const fragments = await Promise.all(
    Array.from({ length: fragmentCount }, (_, i) =>
      createTestFragment(resource.id, game.id, {
        content: `Fragment ${i + 1} content`,
        pageNumber: i + 1,
        section: `Section ${i + 1}`,
      })
    )
  );

  return { game, resource, fragments };
}

/**
 * Create a test resource with attachments
 *
 * @example
 * const { resource, attachments } = await createTestResourceWithAttachments(game.id);
 * const { resource, attachments } = await createTestResourceWithAttachments(game.id, {
 *   attachmentCount: 5
 * });
 */
export async function createTestResourceWithAttachments(
  gameId: string,
  options?: { resourceName?: string; attachmentCount?: number }
) {
  const { resourceName = 'Test Resource', attachmentCount = 3 } = options || {};

  const resource = await createTestResource(gameId, { name: resourceName });

  const attachments = await Promise.all(
    Array.from({ length: attachmentCount }, (_, i) =>
      createTestAttachment(resource.id, gameId, {
        originalFilename: `image-${i + 1}.png`,
        pageNumber: i + 1,
        caption: `Image ${i + 1}`,
      })
    )
  );

  return { resource, attachments };
}
