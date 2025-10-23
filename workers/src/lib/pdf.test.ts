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

    it('should handle pages with empty markdown', () => {
      const structured: StructuredPDFContent = {
        pageCount: 2,
        pages: [
          {
            pageNumber: 1,
            markdown: '',
            images: [],
            sections: [],
          },
          {
            pageNumber: 2,
            markdown: 'Content',
            images: [],
            sections: [],
          },
        ],
      };

      const result = rebuildMarkdownFromPages(structured);
      expect(result).toContain('<!-- Page 1 -->');
      expect(result).toContain('<!-- Page 2 -->');
      expect(result).toContain('Content');
    });
  });

  describe('parseMarkdownHeadings - edge cases', () => {
    it('should handle empty markdown', () => {
      const sections = parseMarkdownHeadings('', 1);
      expect(sections).toEqual([]);
    });

    it('should handle markdown with only whitespace', () => {
      const sections = parseMarkdownHeadings('   \n\n  \n', 1);
      expect(sections).toEqual([]);
    });

    it('should ignore malformed headings (no space after #)', () => {
      const markdown = '#NoSpace\n# Proper Heading';
      const sections = parseMarkdownHeadings(markdown, 1);
      expect(sections).toHaveLength(1);
      expect(sections[0].text).toBe('Proper Heading');
    });

    it('should handle heading-like content in code blocks', () => {
      const markdown = '# Real Heading\n```\n# Code Heading\n```\n## Another Real';
      const sections = parseMarkdownHeadings(markdown, 1);
      // Note: This simple parser doesn't handle code blocks specially
      // It will count the code heading - this documents current behavior
      expect(sections.length).toBeGreaterThan(0);
    });

    it('should handle extremely nested headings', () => {
      const markdown = '###### Level 6\n##### Level 5\n#### Level 4';
      const sections = parseMarkdownHeadings(markdown, 1);
      expect(sections).toHaveLength(3);
      expect(sections[0].level).toBe(6);
    });

    it('should trim whitespace from heading text', () => {
      const markdown = '#    Extra   Spaces   ';
      const sections = parseMarkdownHeadings(markdown, 1);
      expect(sections[0].text).toBe('Extra   Spaces');
    });
  });

  describe('replaceImageReferences - edge cases', () => {
    it('should handle markdown without any images', () => {
      const markdown = '# Just text\nNo images here';
      const result = replaceImageReferences(markdown, []);
      expect(result).toBe(markdown);
    });

    it('should only match each image once when filename appears multiple times', () => {
      const markdown = '![First](img.png)\n![Second](img.png)';
      const images: PDFImage[] = [
        { id: 'att1', originalFilename: 'img.png', url: '/uploads/att1.png', pageNumber: 1 },
      ];
      const result = replaceImageReferences(markdown, images);
      // First reference gets replaced, second one is kept as-is (no match available)
      const matches = result.match(/attachment:\/\/att1/g);
      expect(matches).toHaveLength(1);
      expect(result).toContain('![Second](img.png)'); // Second one unchanged
    });

    it('should handle empty alt text', () => {
      const markdown = '![](img.png)';
      const images: PDFImage[] = [
        { id: 'att1', originalFilename: 'img.png', url: '/uploads/att1.png', pageNumber: 1 },
      ];
      const result = replaceImageReferences(markdown, images);
      expect(result).toContain('![](attachment://att1)');
    });
  });

  describe('removeBadQualityImages - edge cases', () => {
    it('should handle markdown without images', () => {
      const markdown = '# Just text';
      const images: PDFImage[] = [
        { id: 'img1', originalFilename: 'img1.png', pageNumber: 1, isGoodQuality: 'bad' },
      ];
      const result = removeBadQualityImages(markdown, images);
      expect(result).toBe(markdown);
    });

    it('should handle all images being bad quality', () => {
      const markdown = '![One](attachment://img1)\n![Two](attachment://img2)';
      const images: PDFImage[] = [
        { id: 'img1', originalFilename: 'img1.png', pageNumber: 1, isGoodQuality: 'bad' },
        { id: 'img2', originalFilename: 'img2.png', pageNumber: 1, isGoodQuality: 'bad' },
      ];
      const result = removeBadQualityImages(markdown, images);
      expect(result).not.toContain('attachment://img1');
      expect(result).not.toContain('attachment://img2');
    });

    it('should preserve spacing around removed images', () => {
      const markdown = 'Before\n![Bad](attachment://img1)\nAfter';
      const images: PDFImage[] = [
        { id: 'img1', originalFilename: 'img1.png', pageNumber: 1, isGoodQuality: 'bad' },
      ];
      const result = removeBadQualityImages(markdown, images);
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });
  });
});
