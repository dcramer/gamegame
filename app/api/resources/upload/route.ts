import { auth } from "@/auth";
import { uploadResource } from "@/lib/actions/resources";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (
        pathname: string,
        clientPayload: string | null
      ) => {
        if (!clientPayload) {
          throw new Error("Client payload is required");
        }

        const parsedClientPayload = JSON.parse(clientPayload);
        if (!parsedClientPayload.gameId || !parsedClientPayload.resourceId) {
          throw new Error("Game ID and resource ID are required");
        }

        return {
          allowedContentTypes: ["application/pdf"],
          tokenPayload: JSON.stringify({
            userId: session.user.id,
            ...parsedClientPayload,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Get notified of client upload completion
        // ⚠️ This will not work on `localhost` websites,
        // Use ngrok or similar to get the full upload flow
        // console.log("blob upload completed", blob, tokenPayload);
        // if (!tokenPayload) {
        //   throw new Error("Token payload is required");
        // }
        // const parsedTokenPayload = JSON.parse(tokenPayload);
        // try {
        //   await uploadResource({
        //     id: parsedTokenPayload.resourceId,
        //     gameId: parsedTokenPayload.gameId,
        //     name: parsedTokenPayload.name,
        //     url: blob.url,
        //   });
        // } catch (error) {
        //   throw new Error("Could not update user");
        // }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
