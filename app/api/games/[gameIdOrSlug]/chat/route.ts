/**
 * Chat API Route
 * POST /api/games/:gameIdOrSlug/chat - Stream chat responses using Vercel AI SDK
 */

import { NextRequest, NextResponse } from 'next/server';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { db } from '@/lib/db';
import { games } from '@/lib/db/schema';
import { eq, or } from 'drizzle-orm';
import { buildPrompt, AnswerSchema } from '@/lib/ai/prompt';
import { getTools } from '@/lib/ai/tools';
import { env } from '@/lib/env.mjs';
import { withRateLimit } from '@/lib/utils/rate-limit-handler';

// Request schema
const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ),
});

/**
 * POST /api/games/:gameIdOrSlug/chat
 * Stream chat response using Vercel AI SDK
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ gameIdOrSlug: string }> }
) {
  return withRateLimit(request, 'chat', async () => {
    try {
      const params = await props.params;
      const { gameIdOrSlug } = params;

      // Fetch game by slug or ID
      const [game] = await db
        .select({
          id: games.id,
          name: games.name,
          year: games.year,
          slug: games.slug,
          bggUrl: games.bggUrl,
        })
        .from(games)
        .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
        .limit(1);

      if (!game) {
        return NextResponse.json(
          { error: 'Game not found' },
          { status: 404 }
        );
      }

      // Parse request body
      const body = await request.json();
      const { messages } = chatRequestSchema.parse(body);

      if (!messages || messages.length === 0) {
        return NextResponse.json(
          { error: 'Messages array is required and cannot be empty' },
          { status: 400 }
        );
      }

      // Get the system prompt
      const systemPrompt = buildPrompt(game);

      // Get tools for this game
      const tools = getTools(
        game.id,
        env.OPENAI_API_KEY,
        env.ENVIRONMENT
      );

      // Stream response using Vercel AI SDK
      const result = streamText({
        model: openai('gpt-4o'), // Use gpt-4o as default (gpt-5 not yet available in Vercel AI SDK)
        system: systemPrompt,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        tools,
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'chat',
        },
      });

      // Return streaming response (Vercel AI SDK handles SSE automatically)
      return result.toTextStreamResponse();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Validation error', details: error.issues },
          { status: 400 }
        );
      }

      console.error('[POST /api/games/:gameIdOrSlug/chat] Error:', error);
      return NextResponse.json(
        { error: 'Failed to process chat request' },
        { status: 500 }
      );
    }
  });
}
