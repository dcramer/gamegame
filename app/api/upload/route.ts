import { requireAdmin } from "@/lib/auth/require-admin";
import { handleUpload } from "@/lib/uploads/server";
import { captureException } from "@sentry/nextjs";
import { NextResponse } from "next/server";

/**
 * Generic upload endpoint that accepts any file type
 * Query parameter 'type' determines allowed content types:
 * - type=image: Only .webp images
 * - type=pdf: Only PDF files
 * - default: All types allowed
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type");

    let allowedContentTypes: string[];
    switch (type) {
      case "image":
        allowedContentTypes = ["image/webp"];
        break;
      case "pdf":
        allowedContentTypes = ["application/pdf"];
        break;
      default:
        // No restriction
        allowedContentTypes = [];
        break;
    }

    const jsonResponse = await handleUpload({
      request,
      allowedContentTypes,
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
