import { getAllGames, getGame } from "@/lib/actions/games";
import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";
import { getAllResourcesForGame } from "@/lib/actions/resources";
import { NextResponse } from "next/server";

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(5, "60 s"),
});

export async function GET(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "127.0.0.1").split(",")[0];
  const { limit, reset, remaining } = await ratelimit.limit(ip);
  const headers = {
    "X-RateLimit-Limit": limit.toString(),
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": reset.toString(),
    "Cache-Control": "public, s-maxage=60",
  };
  if (remaining <= 0) {
    return Response.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers,
      }
    );
  }

  const gameList = await getAllGames();

  return NextResponse.json(
    {
      games: gameList,
    },
    {
      headers,
    }
  );
}
