import { z } from 'zod';

// Helper to handle D1 timestamp serialization
// D1 stores timestamps as integers (unix timestamp in ms)
// Drizzle with mode: 'timestamp' returns Date objects, but c.json() serializes them
// We coerce to number to ensure consistent format
const timestampSchema = z.coerce.number().nullable();

// User schemas
export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  isAdmin: z.boolean(),
});

export type User = z.infer<typeof userSchema>;

// Game schemas
export const gameSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  year: z.number().nullable().optional(),
  imageUrl: z.string().nullable(),
  bggId: z.string().nullable(),
  bggUrl: z.string().nullable(),
  resourceCount: z.number().optional(),
  createdAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional(),
});

export type Game = z.infer<typeof gameSchema>;

export const gamesListSchema = z.array(gameSchema);

// BGG Search Result schema (minimal data from search API)
export const bggSearchResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  yearPublished: z.number().nullable(),
  type: z.enum(['boardgame', 'boardgameexpansion']),
  thumbnailUrl: z.string().nullable().optional(),
  isImported: z.boolean().optional(),
  gameId: z.string().nullable().optional(),
  gameImageUrl: z.string().nullable().optional(),
});

export type BGGSearchResult = z.infer<typeof bggSearchResultSchema>;

export const bggSearchResultsListSchema = z.array(bggSearchResultSchema);

// BGG Game schema (full details from game details API)
export const bggGameSchema = z.object({
  id: z.string(),
  name: z.string(),
  yearPublished: z.number().nullable(),
  minPlayers: z.number().nullable(),
  maxPlayers: z.number().nullable(),
  playingTime: z.number().nullable(),
  minPlayTime: z.number().nullable().optional(),
  maxPlayTime: z.number().nullable().optional(),
  minAge: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  publishers: z.array(z.string()),
  designers: z.array(z.string()),
  categories: z.array(z.string()).optional(),
  bggUrl: z.string().optional(),
});

export type BGGGame = z.infer<typeof bggGameSchema>;

export const bggGamesListSchema = z.array(bggGameSchema);

// Resource schemas (matches what GET /api/games/:id/resources returns)
export const resourceSchema = z.object({
  id: z.string(),
  gameId: z.string().optional(), // Not always returned (e.g., in resources list for a game)
  name: z.string(),
  originalFilename: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  attributionUrl: z.string().nullable().optional(),
  url: z.string(),
  version: z.number(),
  pdfExtractor: z.string().nullable(),
  processedAt: timestampSchema,
  status: z.string().optional(),
  currentJobId: z.string().nullable().optional(),
  processingStage: z.string().optional(),
  pageCount: z.number().nullable(),
  imageCount: z.number(),
  wordCount: z.number(),
  description: z.string().nullable().optional(),
  fragmentCount: z.number().optional(),
  content: z.string().optional(), // Only in single resource GET
  createdAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional(),
});

export type Resource = z.infer<typeof resourceSchema>;

export const resourcesListSchema = z.array(resourceSchema);

// Attachment schemas
export const attachmentSchema = z.object({
  id: z.string(),
  resourceId: z.string().optional(),
  gameId: z.string().optional(),
  type: z.string(),
  mimeType: z.string(),
  url: z.string(),
  r2Key: z.string().optional(),
  originalFilename: z.string().nullable(),
  pageNumber: z.number().nullable(),
  bbox: z.union([z.string(), z.array(z.number())]).nullable().optional(),
  caption: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  description: z.string().nullable().optional(),
  isGoodQuality: z.boolean().nullable().optional(),
});

export type Attachment = z.infer<typeof attachmentSchema>;

export const attachmentsListSchema = z.array(attachmentSchema);

// Job status schemas
export const jobStatusSchema = z.object({
  jobId: z.string(),
  resourceId: z.string(),
  gameId: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  progress: z.number(),
  currentStep: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  completedAt: z.number().optional(),
});

export type JobStatus = z.infer<typeof jobStatusSchema>;

// Job with details schema (extends job status with resource/game names)
export const jobWithDetailsSchema = jobStatusSchema.extend({
  resourceName: z.string().optional(),
  gameName: z.string().optional(),
});

export type JobWithDetails = z.infer<typeof jobWithDetailsSchema>;

// Jobs list response schema
export const jobsListResponseSchema = z.object({
  jobs: z.array(jobWithDetailsSchema),
  cursor: z.string().optional(),
  hasMore: z.boolean(),
});

export type JobsListResponse = z.infer<typeof jobsListResponseSchema>;

// Upload response schema
export const uploadResponseSchema = z.object({
  resourceId: z.string(),
  jobId: z.string(),
  status: z.string(),
  message: z.string(),
});

export type UploadResponse = z.infer<typeof uploadResponseSchema>;

// Delete response schema
export const deleteResourceResponseSchema = z.object({
  success: z.boolean(),
  deletedFragments: z.number(),
  deletedAttachments: z.number().optional(),
  deletedR2Files: z.number(),
  warnings: z.array(z.string()).optional(),
  message: z.string(),
});

export type DeleteResourceResponse = z.infer<typeof deleteResourceResponseSchema>;

export const deleteGameResponseSchema = z.object({
  success: z.boolean(),
  deletedFragments: z.number(),
  deletedR2Files: z.number(),
  warnings: z.array(z.string()).optional(),
  message: z.string(),
});

export type DeleteGameResponse = z.infer<typeof deleteGameResponseSchema>;

// Auth response schema
export const authResponseSchema = z.object({
  message: z.string(),
  magicLink: z.string().optional(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

// Error response schema
export const errorResponseSchema = z.object({
  error: z.string(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// Helper function to safely parse and validate JSON responses
export async function parseResponse<T>(
  response: Response,
  schema: z.ZodSchema<T>
): Promise<T> {
  const json = await response.json();
  return schema.parse(json);
}

// Helper to validate a response object matches a schema
export function validateResponse<T>(data: unknown, schema: z.ZodSchema<T>): T {
  return schema.parse(data);
}

// Chat message schema - validates basic structure before passing to AI SDK
// We validate minimally here and let convertToCoreMessages do the heavy lifting
// This protects against obviously malformed data without duplicating AI SDK logic
//
// AI SDK v5 supports multimodal messages with:
// - content: string (simple text)
// - content: Array<{type: 'text', text: string} | {type: 'image', image: string}> (multimodal)
// - parts: Array<...> (internal format from useChat)
//
// We accept all formats and let convertToCoreMessages normalize them
export const chatMessageSchema = z.object({
  id: z.string().optional(), // Optional for user messages
  role: z.string(), // Accept any string, AI SDK will validate
  // Content can be string, array of parts, or undefined (if using 'parts' field)
  content: z.union([
    z.string(),
    z.array(z.any()),
  ]).optional(),
  // AI SDK v5 may use 'parts' internally (from useChat hook)
  parts: z.array(z.any()).optional(),
  // Allow any other fields the AI SDK might expect
}).passthrough()
  // Ensure at least one of content or parts exists
  .refine(
    (msg) => msg.content !== undefined || msg.parts !== undefined,
    { message: "Message must have either 'content' or 'parts' field" }
  );

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// Structured answer schema for AI responses (AI SDK streamObject)
export const citationSchema = z.object({
  resourceId: z.string().describe('ID of the resource cited'),
  resourceName: z.string().describe('Name of the resource (e.g., "Core Rulebook")'),
  pageNumber: z.number().optional().describe('Page number in the source'),
  pageRange: z.array(z.number()).optional().describe('Page range [start, end] if multi-page'),
  section: z.string().optional().describe('Section hierarchy (e.g., "Setup > Player Setup")'),
  relevance: z.enum(['primary', 'supporting', 'related']).describe('How relevant this source is to the answer'),
  quote: z.string().optional().describe('Direct quote from the source if applicable'),
});

export type Citation = z.infer<typeof citationSchema>;

export const answerImageSchema = z.object({
  attachmentId: z.string().describe('ID of the attachment'),
  url: z.string().describe('URL to the image'),
  description: z.string().describe('Description of what the image shows'),
  relevance: z.enum(['essential', 'helpful', 'supplementary']).describe('How important this image is'),
  placement: z.enum(['inline', 'end']).describe('Where to display the image in the answer'),
});

export type AnswerImage = z.infer<typeof answerImageSchema>;

export const followUpQuestionSchema = z.object({
  question: z.string().describe('The suggested follow-up question'),
  category: z.enum(['related', 'deeper', 'clarifying']).describe('Type of follow-up'),
});

export type FollowUpQuestion = z.infer<typeof followUpQuestionSchema>;

export const structuredAnswerSchema = z.object({
  answer: z.string().describe('Markdown-formatted answer to the question'),

  questionType: z.enum(['gameplay', 'knowledge', 'external', 'gamegame']).describe('Category of question being answered'),

  citations: z.array(citationSchema).describe('Sources used, ordered by relevance'),

  images: z.array(answerImageSchema).optional().describe('Images to include in response'),

  confidence: z.enum(['high', 'medium', 'low']).describe('Confidence in answer accuracy'),

  ambiguities: z.array(z.string()).optional().describe('Ambiguous points or rule conflicts found'),

  followUps: z.array(followUpQuestionSchema).describe('Suggested follow-up questions'),

  playerCountSpecific: z.number().optional().describe('If answer is specific to a player count'),

  expansionSpecific: z.array(z.string()).optional().describe('If answer requires specific expansions'),
});

export type StructuredAnswer = z.infer<typeof structuredAnswerSchema>;
