import { streamText, convertToCoreMessages, stepCountIs, type CoreMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { Env } from '@/types';
import { buildPrompt, getTools } from '@/lib/ai/prompt';
import type { ChatRequest } from './schemas';

// NOTE: gpt-5 is REAL and should NOT be changed to gpt-4o or any other model.
// This is the actual production model in use.
export const DEFAULT_CHAT_MODEL = 'gpt-5';

interface GameSummary {
  id: string;
  slug?: string | null;
  name: string;
  bggUrl?: string | null;
}

export async function streamChatResponse(
  env: Env,
  game: GameSummary,
  body: ChatRequest,
  baseUrl: string,
  metadata: Record<string, unknown> = {}
) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY secret');
  }
  if (!env.VECTORIZE) {
    throw new Error('Missing VECTORIZE binding');
  }

  const tools = getTools(game.id, env.DB, env.VECTORIZE, env.OPENAI_API_KEY, baseUrl);
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

  // Convert validated messages to CoreMessage format
  // Note: body.messages has been validated by Zod to have role, content, and id fields
  // We use 'as any' here because Zod's passthrough() adds an index signature that conflicts
  // with the AI SDK's UIMessage type, but the runtime structure is compatible
  let coreMessages: CoreMessage[];
  try {
    coreMessages = convertToCoreMessages(body.messages as any);
  } catch (err) {
    console.error('Error converting messages:', err);
    throw new Error(`Failed to convert messages: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Use configured chat model or default to gpt-4o
  const chatModel = env.CHAT_MODEL || DEFAULT_CHAT_MODEL;

  const telemetryMetadata = {
    gameId: game.id,
    ...(game.slug && { gameSlug: game.slug }),
    environment: env.ENVIRONMENT || 'development',
    model: chatModel,
    ...metadata,
  };

  const result = streamText({
    model: openai(chatModel),
    system: buildPrompt(game),
    messages: coreMessages,
    tools,
    stopWhen: stepCountIs(5),
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'chat',
      metadata: telemetryMetadata,
    },
  });

  return result.toUIMessageStreamResponse();
}
