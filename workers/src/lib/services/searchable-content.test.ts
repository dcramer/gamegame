import { describe, it, expect } from 'vitest';
import {
  buildSearchableContent,
  buildImageSearchableContent,
  estimateTokenCount,
  validateSearchableContentSize,
} from './searchable-content';
import type { PDFChunk, PDFPage, PDFImage } from '../types/pdf';
import type { Resource, Attachment } from '../db/schema/d1';

describe('buildSearchableContent', () => {
  const mockResource: Pick<
    Resource,
    'name' | 'originalFilename' | 'description' | 'resourceType' | 'edition'
  > = {
    name: 'Arcs Core Rulebook',
    originalFilename: 'arcs-rulebook-v1.2.pdf',
    description: 'Official rules for the base game, includes setup and gameplay for 2-5 players',
    resourceType: 'rulebook',
    edition: '1.2',
  };

  const mockFragment: PDFChunk = {
    content: 'Place 5 territory cards in a circle around the board.',
    pageNumber: 5,
    section: 'Setup > Player Setup',
    images: [
      { id: 'img1', url: 'http://example.com/img1.png' },
      { id: 'img2', url: 'http://example.com/img2.png' },
    ],
  };

  const mockAttachments: Pick<Attachment, 'id' | 'description' | 'detectedType'>[] = [
    {
      id: 'img1',
      description: 'Diagram showing 5-player setup with territory cards arranged in a circle',
      detectedType: 'diagram',
    },
    {
      id: 'img2',
      description: 'Close-up of territory card placement',
      detectedType: 'diagram',
    },
  ];

  it('should include document context by default', () => {
    const result = buildSearchableContent(mockFragment, mockResource, mockAttachments);

    expect(result).toContain('--- DOCUMENT CONTEXT ---');
    expect(result).toContain('Title: Arcs Core Rulebook');
    expect(result).toContain('Filename: arcs-rulebook-v1.2.pdf');
    expect(result).toContain('Description: Official rules for the base game');
    expect(result).toContain('Type: rulebook');
    expect(result).toContain('Edition: 1.2');
  });

  it('should include location context by default', () => {
    const result = buildSearchableContent(mockFragment, mockResource, mockAttachments);

    expect(result).toContain('--- LOCATION ---');
    expect(result).toContain('Page: 5');
    expect(result).toContain('Section: Setup > Player Setup');
  });

  it('should include visual elements context by default', () => {
    const result = buildSearchableContent(mockFragment, mockResource, mockAttachments);

    expect(result).toContain('--- VISUAL ELEMENTS ---');
    expect(result).toContain('Image 1: Diagram showing 5-player setup');
    expect(result).toContain('Type: diagram');
    expect(result).toContain('Image 2: Close-up of territory card placement');
  });

  it('should always include main content', () => {
    const result = buildSearchableContent(mockFragment, mockResource, mockAttachments);

    expect(result).toContain('--- CONTENT ---');
    expect(result).toContain('Place 5 territory cards in a circle around the board.');
  });

  it('should respect includeDocumentContext option', () => {
    const result = buildSearchableContent(mockFragment, mockResource, mockAttachments, {
      includeDocumentContext: false,
    });

    expect(result).not.toContain('--- DOCUMENT CONTEXT ---');
    expect(result).not.toContain('Title: Arcs Core Rulebook');
    expect(result).toContain('--- CONTENT ---');
  });

  it('should respect includeLocationContext option', () => {
    const result = buildSearchableContent(mockFragment, mockResource, mockAttachments, {
      includeLocationContext: false,
    });

    expect(result).not.toContain('--- LOCATION ---');
    expect(result).not.toContain('Page: 5');
    expect(result).toContain('--- CONTENT ---');
  });

  it('should respect includeVisualContext option', () => {
    const result = buildSearchableContent(mockFragment, mockResource, mockAttachments, {
      includeVisualContext: false,
    });

    expect(result).not.toContain('--- VISUAL ELEMENTS ---');
    expect(result).not.toContain('Image 1');
    expect(result).toContain('--- CONTENT ---');
  });

  it('should handle fragments without images', () => {
    const fragmentWithoutImages: PDFChunk = {
      ...mockFragment,
      images: [],
    };

    const result = buildSearchableContent(fragmentWithoutImages, mockResource, mockAttachments);

    expect(result).not.toContain('--- VISUAL ELEMENTS ---');
    expect(result).toContain('--- CONTENT ---');
  });

  it('should handle minimal resource metadata', () => {
    const minimalResource = {
      name: 'Simple Rulebook',
      originalFilename: null,
      description: null,
      resourceType: null,
      edition: null,
    };

    const result = buildSearchableContent(mockFragment, minimalResource, mockAttachments);

    expect(result).toContain('Title: Simple Rulebook');
    expect(result).toContain('Type: rulebook'); // Default fallback
    expect(result).not.toContain('Filename:');
    expect(result).not.toContain('Description:');
    expect(result).not.toContain('Edition:');
  });

  it('should handle fragments with only page number (no section)', () => {
    const fragmentWithoutSection: PDFChunk = {
      content: 'Some content',
      pageNumber: 1,
      section: undefined,
      images: [],
    };

    const result = buildSearchableContent(fragmentWithoutSection, mockResource, []);

    expect(result).toContain('--- LOCATION ---');
    expect(result).toContain('Page: 1');
    expect(result).not.toContain('Section:');
    expect(result).toContain('--- CONTENT ---');
  });

  it('should filter attachments to only those in fragment.images', () => {
    const extraAttachment: Pick<Attachment, 'id' | 'description' | 'detectedType'> = {
      id: 'img3',
      description: 'Not in fragment',
      detectedType: 'photo',
    };

    const result = buildSearchableContent(mockFragment, mockResource, [
      ...mockAttachments,
      extraAttachment,
    ]);

    expect(result).toContain('Image 1: Diagram showing 5-player setup');
    expect(result).toContain('Image 2: Close-up of territory card placement');
    expect(result).not.toContain('Not in fragment');
  });
});

describe('buildImageSearchableContent', () => {
  const mockResource: Pick<Resource, 'name' | 'description' | 'resourceType' | 'edition'> = {
    name: 'Arcs Core Rulebook',
    description: 'Official rules for the base game',
    resourceType: 'rulebook',
    edition: '1.2',
  };

  const mockPage: Pick<PDFPage, 'pageNumber' | 'sections'> = {
    pageNumber: 5,
    sections: [
      { level: 1, text: 'Setup', hierarchy: 'Setup', pageNumber: 5 },
      { level: 2, text: 'Player Setup', hierarchy: 'Setup > Player Setup', pageNumber: 5 },
    ],
  };

  const mockImage: PDFImage = {
    id: 'img1',
    url: 'http://example.com/img1.png',
    caption: 'Setup diagram',
    pageNumber: 5,
  };

  const mockAttachment: Pick<Attachment, 'description' | 'detectedType' | 'caption' | 'ocrText'> =
    {
      description: 'Diagram showing the game board setup for a 5-player game',
      detectedType: 'diagram',
      caption: null,
      ocrText: null,
    };

  it('should include document context by default', () => {
    const result = buildImageSearchableContent(
      mockImage,
      mockAttachment,
      mockPage,
      mockResource
    );

    expect(result).toContain('--- DOCUMENT CONTEXT ---');
    expect(result).toContain('Document: Arcs Core Rulebook');
    expect(result).toContain('Description: Official rules for the base game');
    expect(result).toContain('Type: rulebook');
    expect(result).toContain('Edition: 1.2');
  });

  it('should include image context by default', () => {
    const result = buildImageSearchableContent(
      mockImage,
      mockAttachment,
      mockPage,
      mockResource
    );

    expect(result).toContain('--- IMAGE CONTEXT ---');
    expect(result).toContain('Type: diagram');
    expect(result).toContain('Page: 5');
    expect(result).toContain('Section: Setup > Player Setup');
    expect(result).toContain('Caption: Setup diagram');
  });

  it('should include description as main content', () => {
    const result = buildImageSearchableContent(
      mockImage,
      mockAttachment,
      mockPage,
      mockResource
    );

    expect(result).toContain('--- DESCRIPTION ---');
    expect(result).toContain('Diagram showing the game board setup for a 5-player game');
  });

  it('should include OCR text when available', () => {
    const attachmentWithOCR = {
      ...mockAttachment,
      ocrText: 'Player 1 | Player 2 | Player 3\nScore | 10 | 15 | 12',
    };

    const result = buildImageSearchableContent(
      mockImage,
      attachmentWithOCR,
      mockPage,
      mockResource
    );

    expect(result).toContain('--- EXTRACTED TEXT ---');
    expect(result).toContain('Player 1 | Player 2 | Player 3');
  });

  it('should prefer attachment caption over image caption', () => {
    const attachmentWithCaption = {
      ...mockAttachment,
      caption: 'Detailed setup diagram',
    };

    const result = buildImageSearchableContent(
      mockImage,
      attachmentWithCaption,
      mockPage,
      mockResource
    );

    expect(result).toContain('Caption: Detailed setup diagram');
    expect(result).not.toContain('Caption: Setup diagram');
  });

  it('should use image caption when attachment caption is null', () => {
    const result = buildImageSearchableContent(
      mockImage,
      mockAttachment,
      mockPage,
      mockResource
    );

    expect(result).toContain('Caption: Setup diagram');
  });

  it('should handle pages without sections', () => {
    const pageWithoutSections: Pick<PDFPage, 'pageNumber' | 'sections'> = {
      pageNumber: 1,
      sections: [],
    };

    const result = buildImageSearchableContent(
      mockImage,
      mockAttachment,
      pageWithoutSections,
      mockResource
    );

    expect(result).toContain('Page: 1');
    expect(result).not.toContain('Section:');
  });

  it('should use last section from page sections array', () => {
    const pageWithMultipleSections: Pick<PDFPage, 'pageNumber' | 'sections'> = {
      pageNumber: 5,
      sections: [
        { level: 1, text: 'Rules', hierarchy: 'Rules', pageNumber: 5 },
        { level: 2, text: 'Combat', hierarchy: 'Rules > Combat', pageNumber: 5 },
        { level: 3, text: 'Damage', hierarchy: 'Rules > Combat > Damage', pageNumber: 5 },
      ],
    };

    const result = buildImageSearchableContent(
      mockImage,
      mockAttachment,
      pageWithMultipleSections,
      mockResource
    );

    expect(result).toContain('Section: Rules > Combat > Damage');
  });

  it('should handle minimal metadata', () => {
    const minimalResource = {
      name: 'Rulebook',
      description: null,
      resourceType: null,
      edition: null,
    };

    const minimalAttachment = {
      description: 'Basic diagram',
      detectedType: null,
      caption: null,
      ocrText: null,
    };

    const result = buildImageSearchableContent(
      mockImage,
      minimalAttachment,
      mockPage,
      minimalResource
    );

    expect(result).toContain('Document: Rulebook');
    expect(result).toContain('--- DESCRIPTION ---');
    expect(result).toContain('Basic diagram');
  });

  it('should respect includeDocumentContext option', () => {
    const result = buildImageSearchableContent(
      mockImage,
      mockAttachment,
      mockPage,
      mockResource,
      { includeDocumentContext: false }
    );

    expect(result).not.toContain('--- DOCUMENT CONTEXT ---');
    expect(result).toContain('--- DESCRIPTION ---');
  });

  it('should respect includeLocationContext option', () => {
    const result = buildImageSearchableContent(
      mockImage,
      mockAttachment,
      mockPage,
      mockResource,
      { includeLocationContext: false }
    );

    expect(result).not.toContain('--- IMAGE CONTEXT ---');
    expect(result).toContain('--- DESCRIPTION ---');
  });
});

describe('estimateTokenCount', () => {
  it('should estimate token count based on character length', () => {
    const content = 'Hello world'; // 11 characters
    const tokenCount = estimateTokenCount(content);

    // 11 / 4 = 2.75, rounded up = 3
    expect(tokenCount).toBe(3);
  });

  it('should handle empty strings', () => {
    const tokenCount = estimateTokenCount('');
    expect(tokenCount).toBe(0);
  });

  it('should handle longer content', () => {
    const content = 'a'.repeat(1000); // 1000 characters
    const tokenCount = estimateTokenCount(content);

    // 1000 / 4 = 250
    expect(tokenCount).toBe(250);
  });
});

describe('validateSearchableContentSize', () => {
  it('should validate content within token limit', () => {
    const content = 'a'.repeat(4000); // ~1000 tokens
    const result = validateSearchableContentSize(content, 8000);

    expect(result.valid).toBe(true);
    expect(result.tokenCount).toBe(1000);
    expect(result.error).toBeUndefined();
  });

  it('should reject content exceeding token limit', () => {
    const content = 'a'.repeat(40000); // ~10000 tokens
    const result = validateSearchableContentSize(content, 8000);

    expect(result.valid).toBe(false);
    expect(result.tokenCount).toBe(10000);
    expect(result.error).toContain('exceeds token limit');
  });

  it('should use default max tokens of 8000', () => {
    const content = 'a'.repeat(32001); // ~8001 tokens
    const result = validateSearchableContentSize(content);

    expect(result.valid).toBe(false);
    expect(result.tokenCount).toBe(8001);
  });

  it('should handle custom max tokens', () => {
    const content = 'a'.repeat(2000); // ~500 tokens
    const result = validateSearchableContentSize(content, 400);

    expect(result.valid).toBe(false);
    expect(result.tokenCount).toBe(500);
  });

  it('should handle edge case at exact limit', () => {
    const content = 'a'.repeat(8000); // Exactly 2000 tokens
    const result = validateSearchableContentSize(content, 2000);

    expect(result.valid).toBe(true);
    expect(result.tokenCount).toBe(2000);
  });
});
