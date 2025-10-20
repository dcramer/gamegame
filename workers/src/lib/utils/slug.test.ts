import { describe, it, expect } from 'vitest';
import { slugify } from './slug';

describe('Slug Utilities', () => {
  describe('slugify', () => {
    it('should convert basic text to slug', () => {
      expect(slugify('Arcs')).toBe('arcs');
      expect(slugify('Root')).toBe('root');
    });

    it('should handle spaces and special characters', () => {
      expect(slugify('Twilight Imperium')).toBe('twilight-imperium');
      expect(slugify('Brass: Birmingham')).toBe('brass-birmingham');
      expect(slugify('7 Wonders')).toBe('7-wonders');
    });

    it('should handle multiple consecutive spaces', () => {
      expect(slugify('Too   Many   Spaces')).toBe('too-many-spaces');
    });

    it('should remove leading/trailing hyphens', () => {
      expect(slugify('  Leading and Trailing  ')).toBe('leading-and-trailing');
      expect(slugify('---Multiple---Hyphens---')).toBe('multiple-hyphens');
    });

    it('should handle special characters and symbols', () => {
      expect(slugify('Scythe: Rise of Fenris')).toBe('scythe-rise-of-fenris');
      expect(slugify('Pandemic Legacy: Season 1')).toBe('pandemic-legacy-season-1');
      expect(slugify("King's Dilemma")).toBe('kings-dilemma');
    });

    it('should handle numbers', () => {
      expect(slugify('1984')).toBe('1984');
      expect(slugify('7 Wonders Duel')).toBe('7-wonders-duel');
    });

    it('should handle unicode and accents', () => {
      expect(slugify('Café')).toBe('cafe');
      expect(slugify('Napoléon')).toBe('napoleon');
    });

    it('should handle ampersands', () => {
      expect(slugify('Dungeons & Dragons')).toBe('dungeons-dragons');
      expect(slugify('Cats & Dogs')).toBe('cats-dogs');
    });

    it('should return empty string for empty input', () => {
      expect(slugify('')).toBe('');
      expect(slugify('   ')).toBe('');
    });

    it('should collapse multiple hyphens', () => {
      expect(slugify('Word--With--Double--Hyphens')).toBe('word-with-double-hyphens');
    });
  });
});
