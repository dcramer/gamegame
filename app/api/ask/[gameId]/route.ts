import { MODEL } from "@/constants";
import { getGame } from "@/lib/actions/games";
import { createResource } from "@/lib/actions/resources";
import { findRelevantContent } from "@/lib/ai/embedding";
import { openai } from "@ai-sdk/openai";
import { streamText, convertToCoreMessages, tool } from "ai";
import { z } from "zod";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request, { params: { gameId } }: { params: { gameId: string } }) {
  const game = await getGame(gameId);
  const { messages } = await req.json();

  const result = await streamText({
    model: openai(MODEL),
    system: `This GPT is a knowledgeable expert on the rules of the board game '**${game.name}**.' It will interpret the rules based on the uploaded document and provide accurate, detailed explanations and clarifications about gameplay, mechanics, and any rule ambiguities. It will assist players in understanding the game, resolving disputes, and ensuring a smooth gaming experience. The GPT will focus on being precise, clear, and neutral in its interpretations, avoiding any bias and maintaining a focus on delivering accurate and helpful guidance.
    
    Check your knowledge base before answering any questions.
    
    Only respond to questions using information from tool calls.
    
    if no relevant information is found in the tool calls, respond, "Sorry, I don't know."`,
    messages: convertToCoreMessages(messages),
    tools: {
      getInformation: tool({
        description: `get information from your knowledge base to answer questions.`,
        parameters: z.object({
          question: z.string().describe("the users question"),
        }),
        execute: async ({ question }) => findRelevantContent(question),
      }),
    },
  });

  return result.toDataStreamResponse();
}
