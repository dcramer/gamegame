import { MODEL } from "@/constants";
import { getGame } from "@/lib/actions/games";
import { findRelevantContent } from "@/lib/ai/embedding";
import { openai } from "@ai-sdk/openai";
import { streamText, convertToCoreMessages, tool, jsonSchema } from "ai";
import { z } from "zod";
import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";
import { getAllResourcesForGame } from "@/lib/actions/resources";
import { buildPrompt } from "@/lib/ai/prompt";

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(10, "30 s"),
});
export const maxDuration = 30;

export async function POST(
  req: Request,
  { params: { gameId } }: { params: { gameId: string } }
) {
  const ip = (req.headers.get("x-forwarded-for") ?? "127.0.0.1").split(",")[0];
  const { limit, reset, remaining } = await ratelimit.limit(ip);
  if (remaining <= 0) {
    return Response.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
        },
      }
    );
  }

  const game = await getGame(gameId);
  if (!game) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }
  const { messages } = await req.json();

  const result = await streamText({
    model: openai(MODEL),
    system: buildPrompt(game.name),
    messages: convertToCoreMessages(messages),
    tools: {
      getInformation: tool({
        description: `get information from your knowledge base to help answer questions.`,
        parameters: z.object({
          question: z.string().describe("the users question"),
        }),
        execute: async ({ question }) => findRelevantContent(gameId, question),
      }),
      listResources: tool({
        description: `list the resources available to you`,
        parameters: z.object({}),
        execute: async () =>
          (
            await getAllResourcesForGame(game.id)
          ).map((r) => ({
            id: r.id,
            name: r.name,
          })),
      }),
    },
    temperature: 0,
    onFinish: (result) => {
      if (result.finishReason === "error") {
        console.error(result);
      }
    },
  });

  return result.toDataStreamResponse({
    headers: {
      "X-RateLimit-Limit": limit.toString(),
      "X-RateLimit-Remaining": remaining.toString(),
      "X-RateLimit-Reset": reset.toString(),
    },
  });
}
