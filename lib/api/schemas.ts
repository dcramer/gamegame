/**
 * API Request/Response Validation Schemas
 *
 * Centralized Zod schemas for all API endpoints.
 * These schemas are used for:
 * 1. Request validation in API routes
 * 2. Response validation in API client
 * 3. TypeScript type inference
 */

import { z } from 'zod';

// ============================================================================
// Common Schemas
// ============================================================================

export const idSchema = z.string().min(1);
export const emailSchema = z.string().email();
export const urlSchema = z.string().url();
export const timestampSchema = z.number().int().positive();

// ============================================================================
// Game Schemas
// ============================================================================

export const createGameSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  year: z.number().int().min(1900).max(2100).optional(),
  imageUrl: z.string().url().optional(),
  bggUrl: z.string().url().optional(),
});

export const updateGameSchema = z.object({
  name: z.string().min(1).optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  bggUrl: z.string().url().nullable().optional(),
});

export const gameResponseSchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
  year: z.number().nullable(),
  imageUrl: z.string().nullable(),
  bggId: z.string().nullable(),
  bggUrl: z.string().nullable(),
  resourceCount: z.number().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const gameListResponseSchema = z.array(gameResponseSchema);

// ============================================================================
// Resource Schemas
// ============================================================================

export const createResourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  // File upload handled via FormData, not JSON
});

export const updateResourceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  attributionUrl: z.string().url().nullable().optional(),
});

export const resourceResponseSchema = z.object({
  id: idSchema,
  gameId: idSchema,
  name: z.string(),
  originalFilename: z.string().nullable(),
  url: z.string(),
  content: z.string(),
  version: z.number(),
  pdfExtractor: z.string().nullable(),
  processedAt: timestampSchema.nullable(),
  status: z.string().nullable(),
  currentRunId: z.string().nullable(),
  processingStage: z.string().nullable(),
  pageCount: z.number().nullable(),
  imageCount: z.number().nullable(),
  wordCount: z.number().nullable(),
  description: z.string().nullable(),
  author: z.string().nullable().optional(),
  attributionUrl: z.string().nullable().optional(),
  resourceType: z.string(),
  edition: z.string().nullable(),
  fragmentCount: z.number().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const resourceListItemSchema = resourceResponseSchema
  .omit({ content: true })
  .extend({ hasContent: z.boolean() });

export const resourceListResponseSchema = z.array(resourceListItemSchema);

export const resourceStatsSchema = z.object({
  fragmentCount: z.number(),
  pageCount: z.number().nullable(),
  imageCount: z.number(),
  wordCount: z.number(),
});

// ============================================================================
// Attachment Schemas
// ============================================================================

export const updateAttachmentSchema = z.object({
  description: z.string().nullable().optional(),
  originalFilename: z.string().nullable().optional(),
});

export const attachmentResponseSchema = z.object({
  id: idSchema,
  gameId: idSchema,
  resourceId: idSchema,
  type: z.string(),
  blobKey: z.string().nullable(),
  url: z.string().nullable(),
  mimeType: z.string().nullable(),
  originalFilename: z.string().nullable(),
  pageNumber: z.number().nullable(),
  bbox: z.array(z.number()).optional(),
  caption: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  description: z.string().nullable(),
  isGoodQuality: z.enum(['good', 'bad']).nullable(),
  createdAt: timestampSchema,
});

export const attachmentListResponseSchema = z.array(attachmentResponseSchema);

// ============================================================================
// BGG Schemas
// ============================================================================

export const bggSearchParamsSchema = z.object({
  query: z.string().min(1),
  exact: z.enum(['0', '1']).optional(),
});

export const bggGameSchema = z.object({
  id: z.string(),
  name: z.string(),
  yearPublished: z.number().nullable(),
  imageUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  minPlayers: z.number().nullable(),
  maxPlayers: z.number().nullable(),
  playingTime: z.number().nullable(),
  minPlayTime: z.number().nullable(),
  maxPlayTime: z.number().nullable(),
  minAge: z.number().nullable(),
  description: z.string().nullable(),
  publishers: z.array(z.string()).nullable(),
  designers: z.array(z.string()).nullable(),
  artists: z.array(z.string()).nullable(),
  categories: z.array(z.string()).nullable(),
  mechanics: z.array(z.string()).nullable(),
});

export const bggSearchResponseSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    yearPublished: z.number().nullable(),
  })
);

// ============================================================================
// Auth Schemas
// ============================================================================

export const loginSchema = z.object({
  email: emailSchema,
});

export const userResponseSchema = z.object({
  userId: idSchema,
  email: emailSchema,
  isAdmin: z.boolean(),
});

// ============================================================================
// Error Response Schema
// ============================================================================

export const errorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

// ============================================================================
// Success Response Schema
// ============================================================================

export const successResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type CreateGameInput = z.infer<typeof createGameSchema>;
export type UpdateGameInput = z.infer<typeof updateGameSchema>;
export type GameResponse = z.infer<typeof gameResponseSchema>;
export type GameListResponse = z.infer<typeof gameListResponseSchema>;

export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
export type ResourceResponse = z.infer<typeof resourceResponseSchema>;
export type ResourceListResponse = z.infer<typeof resourceListResponseSchema>;

export type UpdateAttachmentInput = z.infer<typeof updateAttachmentSchema>;
export type AttachmentResponse = z.infer<typeof attachmentResponseSchema>;
export type AttachmentListResponse = z.infer<typeof attachmentListResponseSchema>;

export type BGGSearchParams = z.infer<typeof bggSearchParamsSchema>;
export type BGGGame = z.infer<typeof bggGameSchema>;
export type BGGSearchResponse = z.infer<typeof bggSearchResponseSchema>;

export type LoginInput = z.infer<typeof loginSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type SuccessResponse = z.infer<typeof successResponseSchema>;
