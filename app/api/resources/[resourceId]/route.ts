import { getGame } from "@/lib/actions/games";
import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";
import { getAllResourcesForGame, getResource } from "@/lib/actions/resources";
import { NextResponse } from "next/server";

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(5, "60 s"),
});

// export const maxDuration = 30;

export async function GET(
  req: Request,
  { params: { resourceId } }: { params: { resourceId: string } }
) {
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

  const resource = await getResource(resourceId, true);
  if (!resource) {
    return Response.json(
      { error: "Resource not found" },
      { status: 404, headers }
    );
  }

  return NextResponse.json(
    {
      resource: resource,
    },
    {
      headers,
    }
  );
}
