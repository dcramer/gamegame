/**
 * Rate Limiting Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getRateLimiter,
  checkRateLimit,
  getIdentifier,
  getClientIP,
  type RateLimitType,
} from './rate-limit';

// Mock environment variables
vi.mock('@/lib/env.mjs', () => ({
  env: {
    NODE_ENV: 'test',
    KV_URL: undefined,
    KV_REST_API_URL: undefined,
    KV_REST_API_TOKEN: undefined,
  },
}));

describe('Rate Limiting Service', () => {
  beforeEach(() => {
    // Clear the rate limiter cache before each test
    vi.clearAllMocks();
  });

  describe('getRateLimiter', () => {
    it('should return null when KV is not configured', () => {
      const limiter = getRateLimiter('chat');
      expect(limiter).toBeNull();
    });

    it('should return null for all rate limit types when KV unavailable', () => {
      const types: RateLimitType[] = ['chat', 'search', 'upload', 'api', 'bgg'];
      types.forEach((type) => {
        const limiter = getRateLimiter(type);
        expect(limiter).toBeNull();
      });
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests when KV is not configured (graceful degradation)', async () => {
      const result = await checkRateLimit('test-identifier', 'chat');

      expect(result.success).toBe(true);
      expect(result.limit).toBeGreaterThan(0);
      expect(result.remaining).toBeGreaterThan(0);
      expect(result.reset).toBeGreaterThan(Date.now());
    });

    it('should return correct limits for each rate limit type', async () => {
      const expectedLimits: Record<RateLimitType, number> = {
        chat: 20,
        search: 30,
        upload: 10,
        api: 60,
        bgg: 10,
      };

      for (const [type, expectedLimit] of Object.entries(expectedLimits)) {
        const result = await checkRateLimit('test', type as RateLimitType);
        expect(result.limit).toBe(expectedLimit);
      }
    });

    it('should handle different identifiers', async () => {
      const identifiers = [
        'ip:192.168.1.1',
        'user:user-123',
        'ip:unknown',
      ];

      for (const identifier of identifiers) {
        const result = await checkRateLimit(identifier, 'api');
        expect(result.success).toBe(true);
      }
    });
  });

  describe('getIdentifier', () => {
    it('should prefer user ID over IP address', () => {
      const identifier = getIdentifier('192.168.1.1', 'user-123');
      expect(identifier).toBe('user:user-123');
    });

    it('should fall back to IP address when user ID is null', () => {
      const identifier = getIdentifier('192.168.1.1', null);
      expect(identifier).toBe('ip:192.168.1.1');
    });

    it('should fall back to IP address when user ID is undefined', () => {
      const identifier = getIdentifier('192.168.1.1', undefined);
      expect(identifier).toBe('ip:192.168.1.1');
    });

    it('should handle null IP address', () => {
      const identifier = getIdentifier(null, null);
      expect(identifier).toBe('ip:unknown');
    });

    it('should handle null IP but valid user ID', () => {
      const identifier = getIdentifier(null, 'user-456');
      expect(identifier).toBe('user:user-456');
    });
  });

  describe('getClientIP', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const headers = new Headers({
        'x-forwarded-for': '192.168.1.1, 10.0.0.1',
      });

      const ip = getClientIP(headers);
      expect(ip).toBe('192.168.1.1');
    });

    it('should extract IP from x-real-ip header', () => {
      const headers = new Headers({
        'x-real-ip': '192.168.1.2',
      });

      const ip = getClientIP(headers);
      expect(ip).toBe('192.168.1.2');
    });

    it('should extract IP from cf-connecting-ip header', () => {
      const headers = new Headers({
        'cf-connecting-ip': '192.168.1.3',
      });

      const ip = getClientIP(headers);
      expect(ip).toBe('192.168.1.3');
    });

    it('should prioritize x-forwarded-for over other headers', () => {
      const headers = new Headers({
        'x-forwarded-for': '192.168.1.1',
        'x-real-ip': '192.168.1.2',
        'cf-connecting-ip': '192.168.1.3',
      });

      const ip = getClientIP(headers);
      expect(ip).toBe('192.168.1.1');
    });

    it('should return null when no IP headers are present', () => {
      const headers = new Headers({});

      const ip = getClientIP(headers);
      expect(ip).toBeNull();
    });

    it('should trim whitespace from IP addresses', () => {
      const headers = new Headers({
        'x-forwarded-for': '  192.168.1.1  ',
      });

      const ip = getClientIP(headers);
      expect(ip).toBe('192.168.1.1');
    });

    it('should handle comma-separated list in x-forwarded-for', () => {
      const headers = new Headers({
        'x-forwarded-for': '192.168.1.1,10.0.0.1,172.16.0.1',
      });

      const ip = getClientIP(headers);
      expect(ip).toBe('192.168.1.1');
    });
  });
});
