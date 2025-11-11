import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { z } from 'zod';

const JudgmentSchema = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(100),
  reasoning: z.string(),
  missing: z.array(z.string()).optional(),
  incorrect: z.array(z.string()).optional(),
});

export type Judgment = z.infer<typeof JudgmentSchema>;

export interface EvalCriteria {
  mustInclude?: string[];
  mustNotInclude?: string[];
  accuracy: string;
  completeness: string;
  tone?: string;
}

/**
 * LLM-as-a-judge evaluation for agent answers
 * Uses GPT-5-mini to evaluate answer quality against criteria
 */
export async function judgeAnswer({
  question,
  answer,
  criteria,
  apiKey,
}: {
  question: string;
  answer: string;
  criteria: EvalCriteria;
  apiKey?: string;
}): Promise<Judgment> {
  const openai = createOpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });

  const mustIncludeSection = criteria.mustInclude
    ? `- Must mention: ${criteria.mustInclude.join(', ')}`
    : '';
  const mustNotIncludeSection = criteria.mustNotInclude
    ? `- Must NOT mention: ${criteria.mustNotInclude.join(', ')}`
    : '';
  const toneSection = criteria.tone ? `- Tone: ${criteria.tone}` : '';

  const prompt = `You are evaluating a board game rules assistant's answer.

Question: ${question}

Agent's Answer: ${answer}

Evaluation Criteria:
- Accuracy: ${criteria.accuracy}
- Completeness: ${criteria.completeness}
${mustIncludeSection}
${mustNotIncludeSection}
${toneSection}

Respond with JSON following this exact schema:
{
  "pass": true/false,
  "score": 0-100 (where 80+ is passing),
  "reasoning": "brief explanation of evaluation",
  "missing": ["key points that were missed (if any)"],
  "incorrect": ["statements that were wrong or misleading (if any)"]
}

Be strict but fair. Grade based on accuracy and completeness.`;

  const result = await generateText({
    model: openai('gpt-5-mini'),
    prompt,
    temperature: 1,
  });

  // Parse the JSON response
  const cleaned = result.text.trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error(`Judge did not return valid JSON. Response: ${cleaned}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return JudgmentSchema.parse(parsed);
}
