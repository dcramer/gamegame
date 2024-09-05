"use server";

import { auth } from "@/auth";
import { generateEmbeddings } from "../ai/embedding";
import { db } from "../db";
import { embeddings as embeddingsTable } from "../db/schema/embeddings";
import { insertResourceSchema, resources } from "../db/schema/resources";
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

const extractTextFromPdf = async (buf: Buffer) => {
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
    pdfParser.parseBuffer(buf);
  });
};

export const createResource = async (input: {
  id?: string;
  gameId: string;
  name: string;
  url: string;
}) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  const mimeType = mime.getType(input.name);

  const response = await fetch(input.url);
  const content = Buffer.from(await response.arrayBuffer());

  let newContent: string;
  switch (mimeType) {
    case "application/pdf":
      newContent = await extractTextFromPdf(content);
      break;
    default:
      throw new Error("Unsupported mime type");
  }

  const { id, name, url, gameId } = insertResourceSchema.parse(input);

  const resource = await db.transaction(async (tx) => {
    const [resource] = await tx
      .insert(resources)
      .values({ id, name, url, gameId })
      .returning();

    const embeddings = await generateEmbeddings(newContent);
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
    url: resource.url,
  };
};

export const getResource = async (resourceId: string) => {
  const [resource] = await db
    .select()
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);
  return {
    id: resource.id,
    name: resource.name,
    url: resource.url,
  };
};

export const updateResource = async (
  resourceId: string,
  input: {
    name?: string;
    // url?: string;
  }
) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  const [resource] = await db
    .select()
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);
  if (!resource) {
    throw new Error("Resource not found");
  }

  await db.update(resources).set(input).where(eq(resources.id, resourceId));

  return {
    id: resource.id,
    name: resource.name,
    url: resource.url,
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
