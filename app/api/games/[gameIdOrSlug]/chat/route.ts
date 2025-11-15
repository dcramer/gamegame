/**
 * Chat API Route
 * POST /api/games/:gameIdOrSlug/chat - Stream chat responses using Vercel AI SDK
 */

import { NextRequest, NextResponse } from 'next/server';
import { streamText, convertToModelMessages, type TextStreamPart, type UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { db } from '@/lib/db';
import { games } from '@/lib/db/schema';
import { eq, or } from 'drizzle-orm';
import { buildPrompt, AnswerSchema } from '@/lib/ai/prompt';
import { getTools } from '@/lib/ai/tools';
import { env } from '@/lib/env.mjs';
import { withRateLimit } from '@/lib/utils/rate-limit-handler';

// Request schema - AI SDK sends UIMessage[]
const chatRequestSchema = z.object({
  messages: z.array(z.any()), // UIMessage[] from AI SDK
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

      // Convert UI messages to model messages using AI SDK helper
      const modelMessages = convertToModelMessages(messages as UIMessage[]);

      const generationStartedAt = Date.now();

      // Stream response using Vercel AI SDK
      const result = streamText({
        model: openai('gpt-5'),
        system: systemPrompt,
        messages: modelMessages,
        tools,
        stopWhen: [],
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'chat',
        },
      });

      const getMessageMetadata = ({ part }: { part: TextStreamPart<any> }) => {
        if (part.type !== 'finish') {
          return undefined;
        }

        const responseTimeMs = Date.now() - generationStartedAt;
        const tokens = part.totalUsage
          ? {
              inputTokens: part.totalUsage.inputTokens ?? null,
              outputTokens: part.totalUsage.outputTokens ?? null,
              totalTokens: part.totalUsage.totalTokens ?? null,
            }
          : null;

        return {
          responseTimeMs,
          tokens,
          completedAt: new Date().toISOString(),
        };
      };

      // Return streaming SSE response for the CLI/clients consuming AI SDK events
      return result.toUIMessageStreamResponse({
        messageMetadata: getMessageMetadata,
      });
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
