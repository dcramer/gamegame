/**
 * Typed API Client
 * Type-safe wrapper for all API calls with error handling
 */

import type { NewGameParams } from '../actions/games';

/**
 * Standard API error response
 */
export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

/**
 * API client error class
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/**
 * Base fetch wrapper with error handling
 */
async function apiFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'same-origin', // Include cookies for JWT
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      error: 'An unknown error occurred',
    }));

    throw new ApiClientError(
      error.error,
      response.status,
      error.code,
      error.details,
    );
  }

  return response.json();
}

/**
 * Games API
 */
export const games = {
  /**
   * List all games
   */
  list: () => apiFetch<any[]>('/api/games'),

  /**
   * Get single game by ID or slug
   */
  get: (idOrSlug: string) => apiFetch<any>(`/api/games/${idOrSlug}`),

  /**
   * Create new game (admin only)
   */
  create: (data: NewGameParams) =>
    apiFetch<any>('/api/games', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Update game (admin only)
   */
  update: (id: string, data: Partial<NewGameParams>) =>
    apiFetch<any>(`/api/games/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * Delete game (admin only)
   */
  delete: (id: string) =>
    apiFetch<{ success: boolean; deletedResources: number; message: string }>(
      `/api/games/${id}`,
      { method: 'DELETE' },
    ),
};

/**
 * Resources API
 */
export const resources = {
  /**
   * Get resource by ID
   */
  get: (id: string, withContent?: boolean) => {
    const url = withContent
      ? `/api/resources/${id}?withContent=true`
      : `/api/resources/${id}`;
    return apiFetch<any>(url);
  },

  /**
   * List resources for a game
   */
  listForGame: (gameIdOrSlug: string) =>
    apiFetch<any[]>(`/api/games/${gameIdOrSlug}/resources`),

  /**
   * Create new resource (admin only)
   * Note: This expects FormData, not JSON
   */
  create: async (gameIdOrSlug: string, formData: FormData) => {
    const response = await fetch(`/api/games/${gameIdOrSlug}/resources`, {
      method: 'POST',
      body: formData,
      credentials: 'same-origin',
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: 'An unknown error occurred',
      }));
      throw new ApiClientError(error.error, response.status, error.code, error.details);
    }

    return response.json();
  },

  /**
   * Update resource metadata (admin only)
   */
  update: (id: string, data: { name?: string; description?: string | null }) =>
    apiFetch<any>(`/api/resources/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * Delete resource (admin only)
   */
  delete: (id: string) =>
    apiFetch<{
      success: boolean;
      deletedFragments: number;
      deletedAttachments: number;
      warnings?: string[];
      message: string;
    }>(`/api/resources/${id}`, { method: 'DELETE' }),
};

/**
 * Attachments API
 */
export const attachments = {
  /**
   * Get attachment by ID
   */
  get: (id: string) => apiFetch<any>(`/api/attachments/${id}`),

  /**
   * List attachments for a resource
   */
  listForResource: (resourceId: string) =>
    apiFetch<any[]>(`/api/resources/${resourceId}/attachments`),

  /**
   * Update attachment metadata (admin only)
   */
  update: (
    id: string,
    data: { description?: string | null; originalFilename?: string | null },
  ) =>
    apiFetch<any>(`/api/attachments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /**
   * Reprocess attachment with vision analysis (admin only)
   */
  reprocess: (id: string) =>
    apiFetch<any>(`/api/attachments/${id}/reprocess`, { method: 'POST' }),
};

/**
 * BoardGameGeek API
 */
export const bgg = {
  /**
   * Search BGG for games (admin only, rate limited)
   */
  search: (query: string) =>
    apiFetch<any[]>(`/api/bgg/search?q=${encodeURIComponent(query)}`),

  /**
   * Get game details from BGG (admin only, rate limited)
   */
  getGame: (bggId: string) => apiFetch<any>(`/api/bgg/games/${bggId}`),

  /**
   * Import game from BGG (admin only, rate limited)
   */
  importGame: (bggId: string) =>
    apiFetch<any>(`/api/bgg/games/${bggId}/import`, { method: 'POST' }),
};

/**
 * Authentication API
 */
export const auth = {
  /**
   * Get current user
   */
  me: () =>
    apiFetch<{ userId: string; email: string; isAdmin: boolean }>(
      '/api/auth/me',
    ),

  /**
   * Refresh JWT token
   */
  refresh: () => apiFetch<{ success: boolean }>('/api/auth/refresh', { method: 'POST' }),

  /**
   * Logout
   */
  logout: () => apiFetch<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
};

/**
 * Main API client export
 */
export const api = {
  games,
  resources,
  attachments,
  bgg,
  auth,
};
