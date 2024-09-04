"use server";

import { auth } from "@/auth";
import { generateEmbeddings } from "../ai/embedding";
import { db } from "../db";
import { embeddings as embeddingsTable } from "../db/schema/embeddings";
import {
  insertResourceSchema,
  NewResourceParams,
  resources,
} from "../db/schema/resources";
import mime from "mime";
import PDFParser from "pdf2json";
import { eq } from "drizzle-orm";

function forEachItem(pdf: any, handler: any) {
  var Pages = pdf.Pages || pdf.formImage.Pages;
  for (var p in Pages) {
    var page = Pages[p];
    for (var t in page.Texts) {
      var item = page.Texts[t];
      item.text = decodeURIComponent(item.R[0].T);
      handler(item);
    }
  }
}

const extractTextFromPdf = async (content: string) => {
  return await new Promise<string>((resolve, reject) => {
    const rows: string[] = [];
    const pdfParser = new PDFParser();
    pdfParser.on("pdfParser_dataError", (errData) =>
      reject(errData.parserError)
    );
    pdfParser.on("pdfParser_dataReady", (data) => {
      forEachItem(data, (item: any) => {
        if (item?.text) {
          rows.push(item.text);
        }
      });
      resolve(rows.join(" "));
    });
    pdfParser.parseBuffer(Buffer.from(content, "base64"));
  });
};

export const uploadResource = async ({
  content,
  ...input
}: {
  id?: string;
  gameId: string;
  name: string;
  content: string;
}) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  const mimeType = mime.getType(input.name);

  let newContent: string;
  switch (mimeType) {
    case "application/pdf":
      newContent = await extractTextFromPdf(content);
      break;
    default:
      throw new Error("Unsupported mime type");
  }

  return await createResource({ ...input, content: newContent });
};

export const createResource = async (input: NewResourceParams) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  const { id, name, content, gameId } = insertResourceSchema.parse(input);

  const resource = await db.transaction(async (tx) => {
    const [resource] = await tx
      .insert(resources)
      .values({ id, name, content, gameId })
      .returning();

    const embeddings = await generateEmbeddings(content);
    if (!embeddings.length) {
      throw new Error("Failed to generate embeddings");
    }
    await tx.insert(embeddingsTable).values(
      embeddings.map((embedding) => ({
        gameId: resource.gameId,
        resourceId: resource.id,
        ...embedding,
      }))
    );

    return resource;
  });

  return {
    id: resource.id,
    name: resource.name,
  };
};

export const deleteResource = async (resourceId: string) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  await db.delete(resources).where(eq(resources.id, resourceId));

  return {};
};
