import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

export interface ResourceMetadataOptions {
  readonly existingName?: string | null;
  readonly originalFilename?: string | null;
  readonly maxContentLength?: number;
}

export interface ResourceMetadataResult {
  name: string;
  description: string;
}

const DEFAULT_MAX_CONTENT_LENGTH = 12000;

export async function generateResourceMetadata(
  markdownContent: string,
  openaiApiKey: string,
  options: ResourceMetadataOptions = {}
): Promise<ResourceMetadataResult | null> {
  const trimmed = markdownContent.trim();
  if (!trimmed) {
    console.log(
      JSON.stringify({
        module: 'resource-metadata',
        event: 'empty_content',
        reason: 'Markdown content is empty',
      })
    );
    return null;
  }
  const maxLength = options.maxContentLength ?? DEFAULT_MAX_CONTENT_LENGTH;
  const truncated = trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}\n\n...` : trimmed;

  console.log(
    JSON.stringify({
      module: 'resource-metadata',
      event: 'generating_metadata',
      contentLength: trimmed.length,
      truncatedLength: truncated.length,
      existingName: options.existingName,
      originalFilename: options.originalFilename,
    })
  );

  try {
    const openai = createOpenAI({ apiKey: openaiApiKey });
    const promptText = buildPrompt(truncated, options);

    console.log(
      JSON.stringify({
        module: 'resource-metadata',
        event: 'calling_llm',
        promptLength: promptText.length,
      })
    );

    const response = await generateText({
      model: openai('gpt-5'),
      system: `You extract metadata from board game rulebooks. Be concise and precise.
Return ONLY valid JSON (no markdown, no code blocks) with keys "name" and "description".
- name: A short human friendly document title (e.g., "Core Rulebook", "Player Reference Guide")
- description: A 2-3 sentence summary highlighting scope, edition, and notable sections
Keep the original document language.
If the content does not describe rules, fall back to a neutral generic title and short statement.`,
      prompt: promptText,
    });

    console.log(
      JSON.stringify({
        module: 'resource-metadata',
        event: 'llm_response_received',
        responseLength: response.text.length,
        hasText: !!response.text,
        textType: typeof response.text,
        responseKeys: Object.keys(response),
        finishReason: response.finishReason,
        usage: response.usage,
      })
    );

    const parsed = parseResponse(response.text);
    if (!parsed) {
      console.log(
        JSON.stringify({
          module: 'resource-metadata',
          event: 'parse_failed',
          reason: 'Could not parse LLM response',
          rawResponse: response.text.substring(0, 500),
        })
      );
      return null;
    }
    console.log(
      JSON.stringify({
        module: 'resource-metadata',
        event: 'metadata_generated',
        name: parsed.name,
        descriptionLength: parsed.description.length,
      })
    );
    return parsed;
  } catch (error) {
    const errorDetails = {
      module: 'resource-metadata',
      event: 'error',
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
      errorObject: JSON.stringify(error),
    };
    console.log(JSON.stringify(errorDetails));
    console.error('[resource-metadata] Full error:', error);
    return null;
  }
}

function buildPrompt(content: string, options: ResourceMetadataOptions): string {
  const hints: string[] = [];
  if (options.existingName) {
    hints.push(`Existing title: ${options.existingName}`);
  }
  if (options.originalFilename) {
    hints.push(`Original filename: ${options.originalFilename}`);
  }

  return `Extract metadata for the following board game rulebook markdown.
${hints.length ? `Hints:\n${hints.join('\n')}` : ''}

Markdown content:\n"""\n${content}\n"""`;
}

function parseResponse(raw: string): ResourceMetadataResult | null {
  const text = raw.trim();
  if (!text) {
    console.log(
      JSON.stringify({
        module: 'resource-metadata',
        event: 'parse_failed',
        reason: 'Empty response from LLM',
      })
    );
    return null;
  }

  let jsonText = text;
  // Fallback: Handle code fences if the model didn't respect json_object mode
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

    if (!name) {
      console.log(
        JSON.stringify({
          module: 'resource-metadata',
          event: 'parse_failed',
          reason: 'Missing or empty "name" field',
          parsed,
        })
      );
      return null;
    }

    if (!description) {
      console.log(
        JSON.stringify({
          module: 'resource-metadata',
          event: 'parse_failed',
          reason: 'Missing or empty "description" field',
          parsed,
        })
      );
      return null;
    }

    return { name, description };
  } catch (error) {
    console.log(
      JSON.stringify({
        module: 'resource-metadata',
        event: 'parse_failed',
        reason: 'JSON parse error',
        error: error instanceof Error ? error.message : String(error),
        rawResponse: text.substring(0, 500),
      })
    );
    return null;
  }
}
