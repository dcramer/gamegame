import { requireAdmin } from "@/lib/auth/require-admin";
import { handleUpload } from "@/lib/uploads/server";
import { captureException } from "@sentry/nextjs";
import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const jsonResponse = await handleUpload({
      request,
      allowedContentTypes: ["image/webp"],
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error(error);
    captureException(error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
