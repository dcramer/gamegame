import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

export interface ResourceSummaryOptions {
  readonly existingName?: string | null;
  readonly originalFilename?: string | null;
  readonly maxContentLength?: number;
}

export interface ResourceSummaryResult {
  name: string;
  description: string;
}

const DEFAULT_MAX_CONTENT_LENGTH = 12000;

export async function summarizeResource(
  markdownContent: string,
  openaiApiKey: string,
  options: ResourceSummaryOptions = {}
): Promise<ResourceSummaryResult | null> {
  const trimmed = markdownContent.trim();
  if (!trimmed) {
    return null;
  }
  const maxLength = options.maxContentLength ?? DEFAULT_MAX_CONTENT_LENGTH;
  const truncated = trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}\n\n...` : trimmed;

  try {
    const openai = createOpenAI({ apiKey: openaiApiKey });
    const response = await generateText({
      model: openai('gpt-5'),
      system: `You summarise board game rulebooks. Be concise and precise.
Return strict JSON with keys "name" and "description". The name should be a short human friendly document title. The description is a 2-3 sentence summary highlighting scope, edition, and notable sections.
Keep the original document language.
If the content does not describe rules, fall back to a neutral generic title and short statement.`,
      prompt: buildPrompt(truncated, options),
      maxOutputTokens: 400,
    });

    const parsed = parseResponse(response.text);
    if (!parsed) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('summarizeResource error', error);
    return null;
  }
}

function buildPrompt(content: string, options: ResourceSummaryOptions): string {
  const hints: string[] = [];
  if (options.existingName) {
    hints.push(`Existing title: ${options.existingName}`);
  }
  if (options.originalFilename) {
    hints.push(`Original filename: ${options.originalFilename}`);
  }

  return `Provide a JSON summary for the following board game rulebook markdown.
${hints.length ? `Hints:\n${hints.join('\n')}` : ''}

Markdown content:\n"""\n${content}\n"""`;
}

function parseResponse(raw: string): ResourceSummaryResult | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }

  let jsonText = text;
  const codeFenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeFenceMatch) {
    jsonText = codeFenceMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonText);
    const name = typeof parsed.name === 'string' && parsed.name.trim().length > 0 ? parsed.name.trim() : null;
    const description =
      typeof parsed.description === 'string' && parsed.description.trim().length > 0
        ? parsed.description.trim()
        : null;
    if (!name || !description) {
      return null;
    }
    return { name, description };
  } catch (error) {
    console.warn('Unable to parse resource summary response', error);
    return null;
  }
}
