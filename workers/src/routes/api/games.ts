import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { streamText, convertToCoreMessages, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { Env } from '@/types';
import { getDb, games, resources, fragments } from '@/lib/db';
import { eq, sql, or } from 'drizzle-orm';
import { requireAdmin } from '@/middleware/auth';
import { buildPrompt, getTools } from '@/lib/ai/prompt';
import { ratelimit } from '@/middleware/ratelimit';
import { generateSlug, ensureUniqueSlug } from '@/lib/utils/slug';

const gamesRouter = new Hono<{ Bindings: Env }>();
const MODEL = 'gpt-4o';

// List all games
gamesRouter.get('/', async (c) => {
  const db = getDb(c.env.DB);

  const gamesList = await db
    .select({
      id: games.id,
      name: games.name,
      year: games.year,
      slug: games.slug,
      imageUrl: games.imageUrl,
      bggUrl: games.bggUrl,
      resourceCount: sql<number>`COUNT(DISTINCT ${resources.id})`,
    })
    .from(games)
    .leftJoin(resources, eq(games.id, resources.gameId))
    .groupBy(games.id)
    .all();

  return c.json(gamesList);
});

// Get single game (by slug or ID)
gamesRouter.get('/:gameIdOrSlug', async (c) => {
  const { gameIdOrSlug } = c.req.param();
  const db = getDb(c.env.DB);

  // Support both slug and ID lookups
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      year: games.year,
      slug: games.slug,
      imageUrl: games.imageUrl,
      bggUrl: games.bggUrl,
      resourceCount: sql<number>`COUNT(DISTINCT ${resources.id})`,
    })
    .from(games)
    .leftJoin(resources, eq(games.id, resources.gameId))
    .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
    .groupBy(games.id)
    .limit(1);

  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  return c.json(game);
});

// Create game (admin only)
gamesRouter.post(
  '/',
  requireAdmin,
  zValidator(
    'json',
    z.object({
      name: z.string().min(1),
      year: z.number().int().min(1900).max(2100).optional(),
      // Accept both full URLs and relative paths
      imageUrl: z.string().min(1).optional(),
      bggUrl: z.string().url().optional(),
    })
  ),
  async (c) => {
    const data = c.req.valid('json');
    const db = getDb(c.env.DB);

    // Generate slug from name and year
    const baseSlug = generateSlug(data.name, data.year);

    // Check for slug collisions and ensure uniqueness
    const existingGames = await db
      .select({ slug: games.slug })
      .from(games)
      .all();
    const existingSlugs = existingGames.map(g => g.slug);
    const slug = ensureUniqueSlug(baseSlug, existingSlugs);

    const [game] = await db
      .insert(games)
      .values({
        name: data.name,
        year: data.year,
        slug,
        imageUrl: data.imageUrl,
        bggUrl: data.bggUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return c.json(game, 201);
  }
);

// Update game (admin only)
gamesRouter.patch(
  '/:gameId',
  requireAdmin,
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).optional(),
      year: z.number().int().min(1900).max(2100).optional().nullable(),
      slug: z.string().min(1).optional(),
      // Accept both full URLs and relative paths
      imageUrl: z.string().min(1).optional(),
      bggUrl: z.string().url().optional(),
    })
  ),
  async (c) => {
    const { gameId } = c.req.param();
    const data = c.req.valid('json');
    const db = getDb(c.env.DB);

    // Build update data
    let updateData: any = { ...data, updatedAt: new Date() };

    // If slug is explicitly provided, use it (admin's responsibility to ensure uniqueness)
    if (data.slug) {
      updateData.slug = data.slug;
    }
    // Otherwise, if name or year is changing, regenerate slug
    else if (data.name || data.year !== undefined) {
      // Get current game to determine final name and year
      const [currentGame] = await db
        .select()
        .from(games)
        .where(eq(games.id, gameId))
        .limit(1);

      if (!currentGame) {
        return c.json({ error: 'Game not found' }, 404);
      }

      const finalName = data.name || currentGame.name;
      const finalYear = data.year !== undefined ? data.year : currentGame.year;
      const baseSlug = generateSlug(finalName, finalYear);

      // Check for slug collisions (excluding current game)
      const existingGames = await db
        .select({ slug: games.slug })
        .from(games)
        .all();
      const existingSlugs = existingGames
        .filter(g => g.slug !== currentGame.slug)  // Exclude current game's slug
        .map(g => g.slug);

      updateData.slug = ensureUniqueSlug(baseSlug, existingSlugs);
    }

    const [game] = await db
      .update(games)
      .set(updateData)
      .where(eq(games.id, gameId))
      .returning();

    if (!game) {
      return c.json({ error: 'Game not found' }, 404);
    }

    return c.json(game);
  }
);

// Delete game (admin only)
gamesRouter.delete('/:gameId', requireAdmin, async (c) => {
  const { gameId } = c.req.param();
  const db = getDb(c.env.DB);

  // Get fragment IDs for Vectorize cleanup
  const fragmentList = await db
    .select({ id: fragments.id })
    .from(fragments)
    .where(eq(fragments.gameId, gameId))
    .all();

  // Get all resources for this game to delete from R2
  const resourceList = await db
    .select({ id: resources.id })
    .from(resources)
    .where(eq(resources.gameId, gameId))
    .all();

  // Delete from D1 (cascades to resources, fragments, attachments)
  await db.delete(games).where(eq(games.id, gameId));

  // Delete from Vectorize
  if (fragmentList.length > 0) {
    const fragmentIds = fragmentList.map(f => f.id);
    await c.env.VECTORIZE.deleteByIds(fragmentIds);
  }

  // Delete all R2 files for this game's resources
  const { deleteResourceImages } = await import('@/lib/services/r2-storage');
  let totalR2Deleted = 0;
  for (const resource of resourceList) {
    const deleted = await deleteResourceImages(c.env.FILES, resource.id);
    totalR2Deleted += deleted;
  }
  console.log(`[Delete Game] Deleted ${totalR2Deleted} files from R2`);

  return c.json({
    success: true,
    deletedFragments: fragmentList.length,
    deletedR2Files: totalR2Deleted,
  });
});

// List resources for a game (by slug or ID)
gamesRouter.get('/:gameIdOrSlug/resources', async (c) => {
  const { gameIdOrSlug } = c.req.param();
  const db = getDb(c.env.DB);

  // Get game to ensure it exists and get its ID
  const [game] = await db
    .select({ id: games.id })
    .from(games)
    .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
    .limit(1);

  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  // Get resources for this game
  const resourceList = await db
    .select({
      id: resources.id,
      name: resources.name,
      url: resources.url,
      version: resources.version,
      pdfExtractor: resources.pdfExtractor,
      processedAt: resources.processedAt,
      pageCount: resources.pageCount,
      imageCount: resources.imageCount,
      wordCount: resources.wordCount,
      fragmentCount: sql<number>`COUNT(${fragments.id})`,
    })
    .from(resources)
    .leftJoin(fragments, eq(resources.id, fragments.resourceId))
    .where(eq(resources.gameId, game.id))
    .groupBy(resources.id)
    .all();

  return c.json(resourceList);
});

// Test endpoint to verify routing
gamesRouter.get('/:gameIdOrSlug/chat-test', async (c) => {
  return c.json({ message: 'Chat routing works!', gameId: c.req.param('gameIdOrSlug') });
});

// Chat endpoint - streaming AI responses (by slug or ID)
// Rate limit: 20 requests per 60s (equivalent to old 10 per 30s)
gamesRouter.post('/:gameIdOrSlug/chat', ratelimit(20, 60), async (c) => {
  const { gameIdOrSlug } = c.req.param();
  const { messages } = await c.req.json();

  // Fetch game data - support both slug and ID lookups
  const db = getDb(c.env.DB);
  const [game] = await db
    .select()
    .from(games)
    .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
    .limit(1);

  if (!game) {
    return c.json({ error: 'Game not found' }, 404);
  }

  // Build AI tools with database and vector index bindings (use game.id for internal queries)
  const tools = getTools(game.id, c.env.DB, c.env.VECTORIZE);

  // Create OpenAI provider with API key
  const openai = createOpenAI({
    apiKey: c.env.OPENAI_API_KEY,
  });

  // Stream AI response with step limits and telemetry
  const result = streamText({
    model: openai(MODEL),
    system: buildPrompt(game),
    messages: convertToCoreMessages(messages),
    tools,
    stopWhen: stepCountIs(5), // Limit multi-step reasoning to prevent runaway costs
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'chat',
      metadata: {
        gameId: game.id,
        gameSlug: game.slug,
        environment: c.env.ENVIRONMENT || 'development',
      },
    },
  });

  // Return streaming response compatible with @ai-sdk/react useChat hook
  return result.toUIMessageStreamResponse();
});

export default gamesRouter;
