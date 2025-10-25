/**
 * Page title utilities for SEO-optimized titles
 *
 * Title Schema:
 * - Public pages: "{Page Title} | GameGame"
 * - Admin pages: "{Page Title} | Admin | GameGame"
 * - Game pages: "{Game Name} Rules | GameGame"
 */

const SITE_NAME = 'GameGame';
const SITE_TAGLINE = 'AI-Powered Board Game Rules Assistant';

/**
 * Create a page title with consistent formatting
 * @param parts - Title parts from most specific to least specific
 * @param options - Additional options for title formatting
 */
export function createTitle(
  parts: (string | null | undefined)[],
  options: { isAdmin?: boolean; includeSiteName?: boolean } = {}
): string {
  const { isAdmin = false, includeSiteName = true } = options;

  // Filter out null/undefined parts
  const validParts = parts.filter((part): part is string => !!part);

  // Add admin suffix if needed
  if (isAdmin && !validParts.includes('Admin')) {
    validParts.push('Admin');
  }

  // Add site name if needed
  if (includeSiteName) {
    validParts.push(SITE_NAME);
  }

  return validParts.join(' | ');
}

/**
 * Create a home page title
 */
export function createHomeTitle(): string {
  return createTitle([SITE_TAGLINE], { includeSiteName: true });
}

/**
 * Create a games list title
 */
export function createGamesTitle(): string {
  return createTitle(['Board Games', SITE_TAGLINE], { includeSiteName: true });
}

/**
 * Create a game detail page title
 */
export function createGameTitle(gameName: string): string {
  return createTitle([`${gameName} Rules`], { includeSiteName: true });
}

/**
 * Create a login page title
 */
export function createLoginTitle(): string {
  return createTitle(['Sign In'], { includeSiteName: true });
}

/**
 * Create a verify email page title
 */
export function createVerifyTitle(): string {
  return createTitle(['Verify Email'], { includeSiteName: true });
}

/**
 * Create an admin page title
 */
export function createAdminTitle(...parts: (string | null | undefined)[]): string {
  return createTitle(parts, { isAdmin: true, includeSiteName: true });
}

/**
 * Create meta tags for a page
 */
export function createMeta(options: {
  title: string;
  description?: string;
  noIndex?: boolean;
}) {
  const meta: Array<{ title?: string; name?: string; content?: string }> = [
    { title: options.title },
  ];

  if (options.description) {
    meta.push({ name: 'description', content: options.description });
  }

  if (options.noIndex) {
    meta.push({ name: 'robots', content: 'noindex, nofollow' });
  }

  return meta;
}
