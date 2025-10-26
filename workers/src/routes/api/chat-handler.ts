import { generateText, convertToCoreMessages, Output, hasToolCall, stepCountIs, type CoreMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { Env } from '@/types';
import { buildPrompt, getTools } from '@/lib/ai/prompt';
import type { ChatRequest } from './schemas';
import { structuredAnswerSchema } from './schemas';

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

  const tools = getTools(game.id, env.DB, env.VECTORIZE, env.OPENAI_API_KEY, baseUrl, env.ENVIRONMENT);
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

  const result = await generateText({
    model: openai(chatModel),
    system: buildPrompt(game),
    messages: coreMessages,
    tools,
    // Enable multi-step tool calling with stopWhen
    // This allows up to 20 steps of tool calls + final response generation
    stopWhen: stepCountIs(20),
    // experimental_output: Output.object({
    //   schema: structuredAnswerSchema,
    // }),
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'chat',
      metadata: telemetryMetadata,
    },
  });

  console.log('Result:', {
    text: result.text?.slice(0, 500),
    finishReason: result.finishReason,
    usage: result.usage,
    steps: result.steps?.length,
    toolCalls: result.toolCalls?.length,
    toolResults: result.toolResults?.length,
  });

  // Try to parse the text as JSON (the old approach)
  let finalObject;
  try {
    finalObject = JSON.parse(result.text);
    console.log('Parsed JSON successfully from text');
  } catch (error) {
    console.error('Failed to parse text as JSON:', error);
    console.error('Text content:', result.text?.slice(0, 500));
    throw new Error('Failed to parse response as JSON');
  }

  // Return as JSON response
  return new Response(JSON.stringify(finalObject), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
