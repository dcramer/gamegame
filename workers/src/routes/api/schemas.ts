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
  bggUrl: z.string().nullable(),
  resourceCount: z.number().optional(),
  createdAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional(),
});

export type Game = z.infer<typeof gameSchema>;

export const gamesListSchema = z.array(gameSchema);

// BGG Game schemas
export const bggGameSchema = z.object({
  id: z.string(),
  name: z.string(),
  yearPublished: z.number().nullable(),
  minPlayers: z.number().nullable(),
  maxPlayers: z.number().nullable(),
  playingTime: z.number().nullable(),
  minPlayTime: z.number().nullable(),
  maxPlayTime: z.number().nullable(),
  minAge: z.number().nullable(),
  description: z.string().nullable(),
  thumbnail: z.string().nullable(),
  image: z.string().nullable(),
  publishers: z.array(z.string()),
  designers: z.array(z.string()),
  categories: z.array(z.string()),
  bggUrl: z.string(),
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
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  progress: z.number(),
  currentStep: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type JobStatus = z.infer<typeof jobStatusSchema>;

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
export const chatMessageSchema = z.object({
  id: z.string().optional(), // Optional for user messages
  role: z.string(), // Accept any string, AI SDK will validate
  content: z.string(),
  // Allow any other fields the AI SDK might expect
}).passthrough();

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
