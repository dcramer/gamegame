/**
 * Convert text to URL-safe slug
 * @param text Text to convert to slug
 * @returns URL-safe slug
 */
export function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFD') // Normalize unicode characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics (accents)
    .toLowerCase()
    .trim()
    .replace(/&/g, '') // Remove ampersands
    .replace(/'/g, '') // Remove apostrophes
    .replace(/:/g, '') // Remove colons
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Generate a URL-friendly slug from a game name and optional year
 * Format: {gamename} or {gamename}-{year}
 *
 * Examples:
 * - generateSlug("Arcs", 2024) => "arcs-2024"
 * - generateSlug("Twilight Struggle") => "twilight-struggle"
 * - generateSlug("Codenames: Duet", 2017) => "codenames-duet-2017"
 */
export function generateSlug(name: string, year?: number | null): string {
  const slug = slugify(name);

  // Append year if provided
  if (year) {
    return `${slug}-${year}`;
  }

  return slug;
}

/**
 * Generate a unique slug by appending a counter if collisions exist
 * @param baseSlug Base slug to make unique
 * @param existingSlugs Array of slugs that already exist
 * @returns Unique slug (baseSlug or baseSlug-2, baseSlug-3, etc.)
 */
export function ensureUniqueSlug(baseSlug: string, existingSlugs: string[]): string {
  const slugSet = new Set(existingSlugs);

  // If no collision, return the original
  if (!slugSet.has(baseSlug)) {
    return baseSlug;
  }

  // Find the next available number
  let counter = 2;
  while (slugSet.has(`${baseSlug}-${counter}`)) {
    counter++;
  }

  return `${baseSlug}-${counter}`;
}
