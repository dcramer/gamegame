// TODO: this currently requires type=module in package.json, which is incompat

import { MODEL } from "@/constants";
import { AnswerSchema, buildPrompt, getTools } from "@/lib/ai/prompt";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { expect, test, describe } from "vitest";
import { z } from "zod";

const TIMEOUT_AFTER = 30000;

async function makeCall(
  gameId: string,
  gameName: string,
  content: string,
  model = MODEL
) {
  return await generateText({
    model: openai(model),
    system: buildPrompt({ id: gameId, name: gameName }),
    prompt: content,
    tools: getTools(gameId),
    maxToolRoundtrips: 10,
  });
}

async function expectLLMResponse(
  result: Awaited<ReturnType<typeof makeCall>>,
  expected: string
) {
  const { text } = result;

  let parsedResult;
  try {
    parsedResult = AnswerSchema.parse(JSON.parse(text));
  } catch (err) {
    throw new Error(
      `Unable to parse JSON from result: ${text || "(no result text)"}`,
      {
        cause: err,
      }
    );
  }

  expect(
    parsedResult.answer,
    `No answer provided in result: ${text}`
  ).toBeTruthy();

  const response = await generateText({
    model: openai(MODEL),
    system: `You are responsible for verifying the output of an LLM, ensuring that it answers a question accurately.
    
    You response must ALWAYS be JSON matching the following format:

    {
      "correct": boolean,
      "reason": string,
    }`,
    prompt: `The answer given by the LLM should represent the following:

    ${expected}

    The answer given by the LLM is this:
    
    ${parsedResult.answer}
    `,
  });

  let outcome;
  try {
    outcome = z
      .object({
        correct: z.boolean(),
        reason: z.string().nullable().default(null),
      })
      .parse(JSON.parse(response.text));
  } catch (err) {
    throw new Error(`Unable to parse JSON from outcome: ${response.text}`, {
      cause: err,
    });
  }

  expect(
    outcome.correct,
    `${outcome.reason}\n\nTool Calls: ${result.toolCalls.length}\nAnswer: ${
      parsedResult.answer || "(no answer)"
    }`
  ).toBe(true);
}

// TODO: make it find this dynamically
const ARCS_ID = "nsgh3w0qdeyx5d40cdnlt";
const ARCS_NAME = "Arcs";

describe("dice rolling scenario", () => {
  test(
    "number of dice in combat",
    {
      timeout: TIMEOUT_AFTER,
    },
    async () => {
      const result = await makeCall(
        ARCS_ID,
        ARCS_NAME,
        "How many dice do you roll in combat?"
      );

      await expectLLMResponse(
        result,
        "It should explain that the dice are rolled based on the number of attacking ships."
      );
    }
  );

  test(
    "number of dice in battle",
    {
      timeout: TIMEOUT_AFTER,
    },
    async () => {
      const result = await makeCall(
        ARCS_ID,
        ARCS_NAME,
        "How many dice do you roll in battle?"
      );

      await expectLLMResponse(
        result,
        "It should explain that the dice are rolled based on the number of attacking ships."
      );
    }
  );

  test(
    "number of dice",
    {
      timeout: TIMEOUT_AFTER,
    },
    async () => {
      const result = await makeCall(
        ARCS_ID,
        ARCS_NAME,
        "How many dice do you roll?"
      );

      await expectLLMResponse(
        result,
        "It should explain that the dice are rolled based on the number of attacking ships."
      );
    }
  );
});

describe("general questions", () => {
  test(
    "what is this game",
    {
      timeout: TIMEOUT_AFTER,
    },
    async () => {
      const result = await makeCall(ARCS_ID, ARCS_NAME, "what is this game?");

      await expectLLMResponse(result, "It should give a summary of the game.");
    }
  );

  test(
    "how do you play",
    {
      timeout: TIMEOUT_AFTER,
    },
    async () => {
      const result = await makeCall(ARCS_ID, ARCS_NAME, "how do you play?");

      await expectLLMResponse(result, "It should give a summary of gameplay.");
    }
  );
});
