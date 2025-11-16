/**
 * Unit Test Example
 *
 * Demonstrates testing pure functions with no database or external API dependencies.
 * Unit tests should be fast, simple, and test individual functions in isolation.
 *
 * Key principles:
 * - No database access
 * - No external API calls
 * - No mocking needed (pure functions)
 * - Tests logic and transformations
 */

import { describe, it, expect } from 'vitest';

/**
 * Example 1: Testing string transformation
 *
 * This example shows testing a simple string utility function.
 * No setup or cleanup needed - just input and output.
 */
describe('String utilities', () => {
  function slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  it('should convert text to slug format', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('Brass: Birmingham')).toBe('brass-birmingham');
    expect(slugify('7 Wonders')).toBe('7-wonders');
  });

  it('should handle special characters', () => {
    expect(slugify('Hello @ World!')).toBe('hello-world');
    expect(slugify('Test (2023)')).toBe('test-2023');
  });

  it('should handle multiple spaces', () => {
    expect(slugify('hello    world')).toBe('hello-world');
    expect(slugify('  trim  spaces  ')).toBe('trim-spaces');
  });
});

/**
 * Example 2: Testing data transformation
 *
 * This example shows testing a function that transforms data structures.
 * Pure functions with predictable inputs and outputs.
 */
describe('Data transformation', () => {
  interface Fragment {
    content: string;
    pageNumber: number;
  }

  function extractPageNumbers(fragments: Fragment[]): number[] {
    return [...new Set(fragments.map((f) => f.pageNumber))].sort((a, b) => a - b);
  }

  it('should extract unique page numbers', () => {
    const fragments: Fragment[] = [
      { content: 'Text 1', pageNumber: 1 },
      { content: 'Text 2', pageNumber: 2 },
      { content: 'Text 3', pageNumber: 1 },
      { content: 'Text 4', pageNumber: 3 },
    ];

    expect(extractPageNumbers(fragments)).toEqual([1, 2, 3]);
  });

  it('should return empty array for no fragments', () => {
    expect(extractPageNumbers([])).toEqual([]);
  });

  it('should sort page numbers', () => {
    const fragments: Fragment[] = [
      { content: 'Text 1', pageNumber: 5 },
      { content: 'Text 2', pageNumber: 1 },
      { content: 'Text 3', pageNumber: 3 },
    ];

    expect(extractPageNumbers(fragments)).toEqual([1, 3, 5]);
  });
});

/**
 * Example 3: Testing validation logic
 *
 * This example shows testing input validation functions.
 * Great for testing business rules without external dependencies.
 */
describe('Validation utilities', () => {
  function isValidGameName(name: string): boolean {
    return name.length >= 1 && name.length <= 100;
  }

  function isValidYear(year: number): boolean {
    const currentYear = new Date().getFullYear();
    return year >= 1900 && year <= currentYear + 5;
  }

  it('should validate game names', () => {
    expect(isValidGameName('Arcs')).toBe(true);
    expect(isValidGameName('A')).toBe(true);
    expect(isValidGameName('')).toBe(false);
    expect(isValidGameName('a'.repeat(101))).toBe(false);
  });

  it('should validate publication years', () => {
    expect(isValidYear(2023)).toBe(true);
    expect(isValidYear(1900)).toBe(true);
    expect(isValidYear(1899)).toBe(false);
    expect(isValidYear(2030)).toBe(false);
  });
});

/**
 * Example 4: Testing array operations
 *
 * This example shows testing functions that operate on arrays.
 * Good for testing sorting, filtering, and mapping logic.
 */
describe('Array utilities', () => {
  interface Game {
    name: string;
    year: number;
    minPlayers: number;
  }

  function sortGamesByYear(games: Game[]): Game[] {
    return [...games].sort((a, b) => b.year - a.year);
  }

  function filterByPlayerCount(games: Game[], players: number): Game[] {
    return games.filter((g) => g.minPlayers <= players);
  }

  const testGames: Game[] = [
    { name: 'Arcs', year: 2024, minPlayers: 2 },
    { name: 'Brass', year: 2018, minPlayers: 2 },
    { name: 'Ticket to Ride', year: 2004, minPlayers: 2 },
  ];

  it('should sort games by year descending', () => {
    const sorted = sortGamesByYear(testGames);
    expect(sorted[0].name).toBe('Arcs');
    expect(sorted[1].name).toBe('Brass');
    expect(sorted[2].name).toBe('Ticket to Ride');
  });

  it('should not mutate original array', () => {
    const original = [...testGames];
    sortGamesByYear(testGames);
    expect(testGames).toEqual(original);
  });

  it('should filter games by player count', () => {
    const filtered = filterByPlayerCount(testGames, 2);
    expect(filtered).toHaveLength(3);
  });
});

/**
 * When to use unit tests:
 *
 * ✅ DO write unit tests for:
 * - String formatting/parsing functions
 * - Data transformation and mapping
 * - Validation logic
 * - Pure computation functions
 * - Array/object manipulation
 *
 * ❌ DON'T write unit tests for:
 * - Functions that require database access (use integration tests)
 * - Functions that call external APIs (use integration tests with mocks)
 * - Next.js route handlers (use API route tests)
 * - React components (use component tests)
 */
