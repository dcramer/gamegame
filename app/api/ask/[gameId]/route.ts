import { MODEL } from "@/constants";
import { getGame } from "@/lib/actions/games";
import { openai } from "@ai-sdk/openai";
import { streamText, convertToCoreMessages } from "ai";
import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";
import { buildPrompt, getTools } from "@/lib/ai/prompt";

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
    system: buildPrompt(game),
    messages: convertToCoreMessages(messages),
    tools: getTools(gameId),
    maxToolRoundtrips: 5,
    temperature: 0,
  });

  return result.toDataStreamResponse({
    headers: {
      "X-RateLimit-Limit": limit.toString(),
      "X-RateLimit-Remaining": remaining.toString(),
      "X-RateLimit-Reset": reset.toString(),
    },
  });
}
