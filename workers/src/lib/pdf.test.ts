import { describe, it, expect } from 'vitest';
import {
  parseMarkdownHeadings,
  replaceImageReferences,
  removeBadQualityImages,
  rebuildMarkdownFromPages,
} from './pdf';
import type { PDFImage, StructuredPDFContent } from './types/pdf';

describe('PDF Utility Functions', () => {
  describe('parseMarkdownHeadings', () => {
    it('should extract headings with correct hierarchy', () => {
      const markdown = `# Setup
## Components
### Player Boards
## Rules
### Movement`;

      const sections = parseMarkdownHeadings(markdown, 1);

      expect(sections).toHaveLength(5);
      expect(sections[0]).toMatchObject({
        level: 1,
        text: 'Setup',
        hierarchy: 'Setup',
        pageNumber: 1,
      });
      expect(sections[1]).toMatchObject({
        level: 2,
        text: 'Components',
        hierarchy: 'Setup > Components',
        pageNumber: 1,
      });
      expect(sections[2]).toMatchObject({
        level: 3,
        text: 'Player Boards',
        hierarchy: 'Setup > Components > Player Boards',
        pageNumber: 1,
      });
      expect(sections[3]).toMatchObject({
        level: 2,
        text: 'Rules',
        hierarchy: 'Setup > Rules',
        pageNumber: 1,
      });
    });

    it('should handle markdown with no headings', () => {
      const markdown = 'Just some text without any headings.';
      const sections = parseMarkdownHeadings(markdown, 1);
      expect(sections).toHaveLength(0);
    });

    it('should correctly reset hierarchy when popping levels', () => {
      const markdown = `### Deep Heading
## Back to Level 2`;

      const sections = parseMarkdownHeadings(markdown, 1);
      expect(sections[1].hierarchy).toBe('Back to Level 2');
    });
  });

  describe('removeBadQualityImages', () => {
    it('should remove images marked as bad quality', () => {
      const markdown = `
# Rules
![Good image](attachment://img1)
Some text
![Bad image](attachment://img2)
More text
![Another good](attachment://img3)
`;

      const images: PDFImage[] = [
        { id: 'img1', originalFilename: 'img1.png', pageNumber: 1, isGoodQuality: 'good' },
        { id: 'img2', originalFilename: 'img2.png', pageNumber: 1, isGoodQuality: 'bad' },
        { id: 'img3', originalFilename: 'img3.png', pageNumber: 1, isGoodQuality: 'good' },
      ];

      const cleaned = removeBadQualityImages(markdown, images);

      expect(cleaned).toContain('![Good image](attachment://img1)');
      expect(cleaned).not.toContain('![Bad image](attachment://img2)');
      expect(cleaned).toContain('![Another good](attachment://img3)');
    });

    it('should return original markdown if no bad quality images', () => {
      const markdown = '![Image](attachment://img1)';
      const images: PDFImage[] = [
        { id: 'img1', originalFilename: 'img1.png', pageNumber: 1, isGoodQuality: 'good' },
      ];

      const cleaned = removeBadQualityImages(markdown, images);
      expect(cleaned).toBe(markdown);
    });

    it('should handle empty images array', () => {
      const markdown = '![Image](attachment://img1)';
      const cleaned = removeBadQualityImages(markdown, []);
      expect(cleaned).toBe(markdown);
    });
  });

  describe('replaceImageReferences', () => {
    it('should replace image references with attachment URLs', () => {
      const markdown = `
# Setup
![Board](img-0.jpeg)
![Cards](data:image/png;base64,abc123)
`;

      const images: PDFImage[] = [
        { id: 'att1', originalFilename: 'img-0.jpeg', url: '/uploads/att1.png', pageNumber: 1 },
        { id: 'att2', originalFilename: 'img-1.png', url: '/uploads/att2.png', pageNumber: 1 },
      ];

      const result = replaceImageReferences(markdown, images);

      expect(result).toContain('![Board](attachment://att1)');
      expect(result).not.toContain('img-0.jpeg');
      expect(result).not.toContain('data:image/png');
    });

    it('should preserve external URLs', () => {
      const markdown = '![External](https://example.com/image.png)';
      const result = replaceImageReferences(markdown, []);
      expect(result).toBe(markdown);
    });

    it('should handle images without matches gracefully', () => {
      const markdown = '![Unmatched](unknown.jpg)';
      const images: PDFImage[] = [
        { id: 'att1', originalFilename: 'different.png', url: '/uploads/att1.png', pageNumber: 1 },
      ];

      const result = replaceImageReferences(markdown, images);
      // Should keep original if no match found
      expect(result).toContain('unknown.jpg');
    });
  });

  describe('rebuildMarkdownFromPages', () => {
    it('should combine pages with page markers', () => {
      const structured: StructuredPDFContent = {
        pageCount: 2,
        pages: [
          {
            pageNumber: 1,
            markdown: '# Introduction\nWelcome to the game',
            images: [],
            sections: [],
          },
          {
            pageNumber: 2,
            markdown: '# Setup\nPlace components',
            images: [],
            sections: [],
          },
        ],
      };

      const result = rebuildMarkdownFromPages(structured);

      expect(result).toContain('<!-- Page 1 -->');
      expect(result).toContain('<!-- Page 2 -->');
      expect(result).toContain('# Introduction');
      expect(result).toContain('# Setup');
    });

    it('should handle empty pages', () => {
      const structured: StructuredPDFContent = {
        pageCount: 0,
        pages: [],
      };

      const result = rebuildMarkdownFromPages(structured);
      expect(result).toBe('');
    });
  });
});
