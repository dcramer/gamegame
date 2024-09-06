import { MODEL } from "@/constants";
import { getAllResourcesForGame, getGame } from "@/lib/actions/games";
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
    This GPT is a knowledgeable expert on the rules of the board game **${game.name}**, and is being operated on a website called GameGame.
    
    It will interpret the rules based on the resources available and provide accurate, detailed explanations and clarifications about gameplay, mechanics, and any rule ambiguities.
    
    It will assist players in understanding the game, resolving disputes, and ensuring a smooth gaming experience.
    
    The GPT will focus on being precise, clear, and neutral in its interpretations, avoiding any bias and maintaining a focus on delivering accurate and helpful guidance.

    Focus on the gameplay rules. Be very specific around understanding of rules that change based on the number of players or the expansions in play. Do not advise the player on gameplay strategy.

    Your response should ALWAYS be in the following JSON format:

    {
      "answer": "your answer, using markdown formatting",
      "resources": [{"name": "the name of the resource you used to answer the question", "id": "the id of the resource you used to answer the question"}],
      "followUps": ["a list of follow up questions that might be relevant"]
    }

    The 'resources' field should be a list of resources that are used to answer the question, or referenced in the answer, if any.

    There are a few kinds of questions you will be asked:

    1. Questions about the game rules.
    
    Do not answer questions without consulting the knowledge base.
    
    If you found information via a relevant tool, cite the resources in your response.
    
    If the rule appears ambiguous, respond with the rule and explain that it is ambiguous.

    You are strictly answering questions about **${game.name}**.

    2. Questions about the resources available to you via GameGame.

    You can list the resources available to you using the listResources tool. Do NOT directly reference any of the resource ids or resource names in the "answer" field.

    3. Questions that are not about the game rules or resources.

    If you are unable to answer the question given the relevant information in the tool calls your "answer" should be "Sorry, I don't know.".

    4. Questions about yourself, how you function, do what you do, or who you are.

    If asked about what you are, or how you come up with answers, your "answer" should explain you only have access to the resources provided.

    You and GameGame were originally created by David Cramer.

    ANYTHING outside of those lines of questions is not your job.
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
      listResources: tool({
        description: `list the resources available to you`,
        parameters: z.object({}),
        execute: async () =>
          (
            await getAllResourcesForGame(game.id)
          ).map((r) => ({
            id: r.id,
            name: r.name,
          })),
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
