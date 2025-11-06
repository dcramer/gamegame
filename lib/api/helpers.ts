/**
 * Shared API Helper Functions
 * Utilities used across API routes to reduce code duplication
 */

/**
 * Parse bbox value from various formats (array, JSON string) into number array
 * Used for attachment bounding boxes
 *
 * @param bboxValue - Value to parse (can be array, JSON string, or other)
 * @returns Array of numbers if valid, undefined otherwise
 */
export function parseBbox(bboxValue: unknown): number[] | undefined {
  if (!bboxValue) return undefined;

  // If it's already an array, validate and return
  if (Array.isArray(bboxValue)) {
    if (bboxValue.every((v) => typeof v === 'number')) {
      return bboxValue;
    }
    return undefined;
  }

  // If it's a string, try to parse it as JSON
  if (typeof bboxValue === 'string') {
    try {
      const parsed = JSON.parse(bboxValue);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'number')) {
        return parsed;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Generate URL-safe slug from game name
 * Optionally includes year suffix for disambiguation
 *
 * @param name - Game name to convert to slug
 * @param year - Optional year to append to slug
 * @returns URL-safe slug string
 *
 * @example
 * generateSlug("Arcs") // "arcs"
 * generateSlug("Risk", 2024) // "risk-2024"
 * generateSlug("Star Wars: Rebellion") // "star-wars-rebellion"
 */
export function generateSlug(name: string, year?: number | null): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return year ? `${slug}-${year}` : slug;
}

/**
 * Build type-safe update data object from partial input
 * Filters out undefined values and optionally adds timestamp
 *
 * @param input - Partial object with update fields
 * @param includeTimestamp - Whether to include updatedAt timestamp (default true)
 * @returns Update data object with only defined values
 *
 * @example
 * const updateData = buildUpdateData({ name: "Arcs", description: undefined });
 * // Returns: { name: "Arcs", updatedAt: 1234567890 }
 */
export function buildUpdateData<T extends Record<string, unknown>>(
  input: Partial<T>,
  includeTimestamp = true
): Partial<T> & { updatedAt?: number } {
  const data = Object.entries(input)
    .filter(([_, value]) => value !== undefined)
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {} as Partial<T>);

  return includeTimestamp ? { ...data, updatedAt: Date.now() } : data;
}
