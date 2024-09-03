"use server";

import { createStreamableValue } from "ai/rsc";
import { CoreMessage, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { MODEL } from "@/constants";

export async function continueConversation(
  gameSlug: string,
  messages: CoreMessage[]
) {
  const result = await streamText({
    model: openai(MODEL),
    messages,
  });

  const stream = createStreamableValue(result.textStream);
  return stream.value;
}
