import { streamText, convertToCoreMessages, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { Env } from '@/types';
import { buildPrompt, getTools } from '@/lib/ai/prompt';

export const DEFAULT_CHAT_MODEL = 'gpt-4o';

export interface ChatRequestBody {
  messages: unknown;
  [key: string]: unknown;
}

interface GameSummary {
  id: string;
  slug?: string | null;
  name: string;
  bggUrl?: string | null;
}

export async function streamChatResponse(
  env: Env,
  game: GameSummary,
  body: ChatRequestBody,
  metadata: Record<string, unknown> = {}
) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY secret');
  }
  if (!env.VECTORIZE) {
    throw new Error('Missing VECTORIZE binding');
  }

  const tools = getTools(game.id, env.DB, env.VECTORIZE, env.OPENAI_API_KEY);
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

  let coreMessages: any;
  try {
    coreMessages = convertToCoreMessages(body.messages as any);
  } catch (err) {
    console.error('Error converting messages:', err);
    coreMessages = body.messages;
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
