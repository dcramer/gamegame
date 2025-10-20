import { describe, it, expect } from 'vitest';
import { extractR2KeyFromUrl } from './r2-storage';

describe('R2 Storage Utilities', () => {
  describe('extractR2KeyFromUrl', () => {
    it('should extract key from relative /uploads/ URL', () => {
      const url = '/uploads/resources/abc123/attachments/xyz.png';
      const key = extractR2KeyFromUrl(url);
      expect(key).toBe('resources/abc123/attachments/xyz.png');
    });

    it('should extract key from full R2 public URL', () => {
      const url = 'https://pub-da70527d01154effbf07cf2470284247.r2.dev/resources/abc123/attachments/xyz.png';
      const key = extractR2KeyFromUrl(url);
      expect(key).toBe('resources/abc123/attachments/xyz.png');
    });

    it('should extract key from custom domain URL', () => {
      const url = 'https://files.gamegame.ai/resources/abc123/attachments/xyz.png';
      const key = extractR2KeyFromUrl(url);
      expect(key).toBe('resources/abc123/attachments/xyz.png');
    });

    it('should handle URL with query parameters', () => {
      const url = '/uploads/resources/abc123/attachments/xyz.png?v=123';
      const key = extractR2KeyFromUrl(url);
      expect(key).toBe('resources/abc123/attachments/xyz.png?v=123');
    });

    it('should return null for invalid URL', () => {
      const key = extractR2KeyFromUrl('not-a-valid-url');
      expect(key).toBeNull();
    });

    it('should handle URLs without /uploads/ prefix', () => {
      const url = 'https://example.com/some/other/path.png';
      const key = extractR2KeyFromUrl(url);
      expect(key).toBe('some/other/path.png');
    });
  });
});
