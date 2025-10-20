import { describe, it, expect } from 'vitest';
import { generateMagicLinkEmail } from './email';

describe('Email Service', () => {
  describe('generateMagicLinkEmail', () => {
    it('should generate valid HTML email with login URL', () => {
      const loginUrl = 'https://gamegame.ai/api/auth/verify?token=abc123';
      const html = generateMagicLinkEmail(loginUrl, 15);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain(loginUrl);
      expect(html).toContain('Log in to GameGame');
      expect(html).toContain('15 minutes');
    });

    it('should include button with href attribute', () => {
      const loginUrl = 'https://gamegame.ai/api/auth/verify?token=test';
      const html = generateMagicLinkEmail(loginUrl);

      expect(html).toMatch(/<a[^>]+href="https:\/\/gamegame\.ai\/api\/auth\/verify\?token=test"/);
      expect(html).toContain('class="button"');
    });

    it('should display URL as text for copy-paste', () => {
      const loginUrl = 'https://gamegame.ai/api/auth/verify?token=longtoken123';
      const html = generateMagicLinkEmail(loginUrl);

      // URL should appear at least twice: once in button, once as text
      const matches = html.match(/https:\/\/gamegame\.ai\/api\/auth\/verify\?token=longtoken123/g);
      expect(matches).toBeTruthy();
      expect(matches!.length).toBeGreaterThanOrEqual(2);
    });

    it('should include security warning about expiry', () => {
      const loginUrl = 'https://gamegame.ai/api/auth/verify?token=test';
      const html = generateMagicLinkEmail(loginUrl, 30);

      expect(html).toContain('30 minutes');
      expect(html).toContain('expire');
    });

    it('should use default expiry of 15 minutes if not specified', () => {
      const loginUrl = 'https://gamegame.ai/api/auth/verify?token=test';
      const html = generateMagicLinkEmail(loginUrl);

      expect(html).toContain('15 minutes');
    });

    it('should include footer with auto-generated notice', () => {
      const loginUrl = 'https://gamegame.ai/api/auth/verify?token=test';
      const html = generateMagicLinkEmail(loginUrl);

      expect(html).toContain('automated email');
      expect(html).toContain('do not reply');
    });

    it('should include reassurance if email was not requested', () => {
      const loginUrl = 'https://gamegame.ai/api/auth/verify?token=test';
      const html = generateMagicLinkEmail(loginUrl);

      expect(html).toContain("didn't request");
      expect(html).toContain('safely ignore');
    });

    it('should have responsive meta tag', () => {
      const loginUrl = 'https://gamegame.ai/api/auth/verify?token=test';
      const html = generateMagicLinkEmail(loginUrl);

      expect(html).toContain('viewport');
      expect(html).toContain('width=device-width');
    });

    it('should handle URLs with special characters', () => {
      const loginUrl = 'https://gamegame.ai/api/auth/verify?token=abc%20def&user=test%40email.com';
      const html = generateMagicLinkEmail(loginUrl);

      expect(html).toContain(loginUrl);
    });
  });
});
