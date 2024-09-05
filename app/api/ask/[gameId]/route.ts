import { MODEL } from "@/constants";
import { getGame } from "@/lib/actions/games";
import { findRelevantContent } from "@/lib/ai/embedding";
import { openai } from "@ai-sdk/openai";
import { streamText, convertToCoreMessages, tool, jsonSchema } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(
  req: Request,
  { params: { gameId } }: { params: { gameId: string } }
) {
  const game = await getGame(gameId);
  if (!game) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }
  const { messages } = await req.json();

  const result = await streamText({
    model: openai(MODEL),
    system: `
    This GPT is a knowledgeable expert on the rules of the board game **${game.name}**.
    
    It will interpret the rules based on the resources available and provide accurate, detailed explanations and clarifications about gameplay, mechanics, and any rule ambiguities.
    
    It will assist players in understanding the game, resolving disputes, and ensuring a smooth gaming experience.
    
    The GPT will focus on being precise, clear, and neutral in its interpretations, avoiding any bias and maintaining a focus on delivering accurate and helpful guidance.
    
    Do not answer questions without consulting the knowledge base.
    
    If you found information via a relevant tool, cite the resourceName in your response..
    
    If the rule appears ambiguous, respond with the rule and explain that it is ambiguous.

    Focus on the gameplay rules. Be very specific around understanding of rules that change based on the number of players. Do not advise the player on gameplay strategy.

    Your response should always be in the following JSON format:

    {
      "answer": "your answer, using markdown and HTML formatting",
      "resourceName": "the name of the resource you used to answer the question",
      "resourceId": "the id of the resource you used to answer the question"
    }

    If no relevant information is found in the tool calls, you should at minimum, respond with:

    {
      "answer": "Sorry, I don't know.",
      "resourceName": null,
      "resourceId": null
    }

    Remember, your job is to ONLY ANSWER QUESTIONS ABOUT THE GAME '**${game.name}**', and nothing more than that.
    `,
    messages: convertToCoreMessages(messages),
    tools: {
      getInformation: tool({
        description: `get information from your knowledge base to help answer questions.`,
        parameters: z.object({
          question: z.string().describe("the users question"),
        }),
        execute: async ({ question }) => findRelevantContent(question),
      }),
    },
    temperature: 0,
    onFinish: (result) => {
      if (result.finishReason === "error") {
        console.error(result);
      }
    },
  });

  return result.toDataStreamResponse();
}
