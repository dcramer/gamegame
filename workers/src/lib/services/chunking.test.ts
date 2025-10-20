import { describe, it, expect } from 'vitest';
import { calculateResourceStats } from './chunking';
import type { StructuredPDFContent } from '../types/pdf';

describe('Chunking Service', () => {
  describe('calculateResourceStats', () => {
    it('should calculate stats from structured content', () => {
      const structured: StructuredPDFContent = {
        pageCount: 3,
        pages: [
          {
            pageNumber: 1,
            markdown: '# Introduction\nWelcome to the game.',
            images: [
              { id: 'img1', originalFilename: 'img1.png', pageNumber: 1 },
              { id: 'img2', originalFilename: 'img2.png', pageNumber: 1 },
            ],
            sections: [],
          },
          {
            pageNumber: 2,
            markdown: '# Setup\nPlace components on the board.',
            images: [{ id: 'img3', originalFilename: 'img3.png', pageNumber: 2 }],
            sections: [],
          },
          {
            pageNumber: 3,
            markdown: '# Rules\nFollow these instructions carefully.',
            images: [],
            sections: [],
          },
        ],
      };

      const content = '# Introduction\nWelcome to the game.\n# Setup\nPlace components.';
      const stats = calculateResourceStats(content, structured);

      expect(stats.pageCount).toBe(3);
      expect(stats.imageCount).toBe(3);
      expect(stats.wordCount).toBeGreaterThan(0);
    });

    it('should handle content without structured data', () => {
      const content = 'This is some plain text with ten words in total.';
      const stats = calculateResourceStats(content);

      expect(stats.pageCount).toBeNull();
      expect(stats.imageCount).toBe(0);
      expect(stats.wordCount).toBe(10);
    });

    it('should count words correctly', () => {
      const content = 'One two three four five.';
      const stats = calculateResourceStats(content);

      expect(stats.wordCount).toBe(5);
    });

    it('should handle empty content', () => {
      const stats = calculateResourceStats('');

      expect(stats.pageCount).toBeNull();
      expect(stats.imageCount).toBe(0);
      expect(stats.wordCount).toBe(0);
    });

    it('should handle content with multiple spaces', () => {
      const content = 'Word1    Word2     Word3';
      const stats = calculateResourceStats(content);

      expect(stats.wordCount).toBe(3);
    });

    it('should handle newlines as word separators', () => {
      const content = 'Line1\nLine2\nLine3';
      const stats = calculateResourceStats(content);

      expect(stats.wordCount).toBe(3);
    });

    it('should count images from all pages', () => {
      const structured: StructuredPDFContent = {
        pageCount: 2,
        pages: [
          {
            pageNumber: 1,
            markdown: 'Page 1',
            images: [
              { id: 'img1', originalFilename: 'img1.png', pageNumber: 1 },
              { id: 'img2', originalFilename: 'img2.png', pageNumber: 1 },
              { id: 'img3', originalFilename: 'img3.png', pageNumber: 1 },
            ],
            sections: [],
          },
          {
            pageNumber: 2,
            markdown: 'Page 2',
            images: [
              { id: 'img4', originalFilename: 'img4.png', pageNumber: 2 },
              { id: 'img5', originalFilename: 'img5.png', pageNumber: 2 },
            ],
            sections: [],
          },
        ],
      };

      const stats = calculateResourceStats('Some content', structured);

      expect(stats.imageCount).toBe(5);
    });

    it('should handle structured content with no images', () => {
      const structured: StructuredPDFContent = {
        pageCount: 1,
        pages: [
          {
            pageNumber: 1,
            markdown: 'Text only page',
            images: [],
            sections: [],
          },
        ],
      };

      const stats = calculateResourceStats('Text content', structured);

      expect(stats.pageCount).toBe(1);
      expect(stats.imageCount).toBe(0);
    });
  });
});
