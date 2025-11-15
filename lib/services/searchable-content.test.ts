import { describe, it, expect } from 'vitest';
import {
  buildSearchableContent,
  buildImageSearchableContent,
  estimateTokenCount,
  validateSearchableContentSize,
} from './searchable-content';
import type { PDFChunk, PDFPage, PDFImage } from '../types/pdf';
import type { Resource } from '../db/schema';

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
      {
        id: 'img1',
        url: 'http://example.com/img1.png',
        description: 'Circle diagram for 5-player setup',
        detectedType: 'diagram',
        caption: 'Figure A',
        ocrText: 'Seat order',
      },
      { id: 'img2', url: 'http://example.com/img2.png' },
    ],
  };

  const mockAttachments = [
    {
      id: 'img1',
      description: 'Diagram showing 5-player setup with territory cards arranged in a circle',
      detectedType: 'diagram',
      caption: 'Player seating example',
      ocrText: 'North | East | South | West',
      isRelevant: true,
    },
    {
      id: 'img2',
      description: 'Close-up of territory card placement',
      detectedType: 'diagram',
      caption: null,
      ocrText: null,
      isRelevant: true,
    },
  ];

  it('should build searchable content with all contexts', () => {
    const result = buildSearchableContent(mockFragment, mockResource, mockAttachments);

    // Document context
    expect(result).toContain('--- DOCUMENT CONTEXT ---');
    expect(result).toContain('Title: Arcs Core Rulebook');

    // Location context
    expect(result).toContain('--- LOCATION ---');
    expect(result).toContain('Page: 5');

    // Visual elements
    expect(result).toContain('--- VISUAL ELEMENTS ---');
    expect(result).toContain('Image 1: Circle diagram for 5-player setup');
    expect(result).toContain('  Type: diagram');
    expect(result).toContain('  Caption: Figure A');
    expect(result).toContain('  OCR: North | East | South | West');

    // Main content
    expect(result).toContain('--- CONTENT ---');
    expect(result).toContain('Place 5 territory cards in a circle around the board.');
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

    expect(result).toContain('Image 1: Circle diagram for 5-player setup');
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

  const mockPage: Pick<PDFPage, 'pageNumber' | 'sections' | 'markdown'> = {
    pageNumber: 5,
    sections: [
      { level: 1, text: 'Setup', hierarchy: 'Setup', pageNumber: 5 },
      { level: 2, text: 'Player Setup', hierarchy: 'Setup > Player Setup', pageNumber: 5 },
    ],
    markdown: 'Setup steps:\n1. Give each player a board.\n2. Arrange the fleet tokens as shown.',
  };

  const mockImage: PDFImage = {
    id: 'img1',
    url: 'http://example.com/img1.png',
    caption: 'Setup diagram',
    pageNumber: 5,
  };

  const mockAttachment = {
    id: 'img1',
    description: 'Diagram showing the game board setup for a 5-player game',
    detectedType: 'diagram',
    caption: null,
    ocrText: null,
    isRelevant: true,
  };

  it('should include all contexts by default', () => {
    const result = buildImageSearchableContent(
      mockImage,
      mockAttachment,
      mockPage,
      mockResource
    );

    // Document context
    expect(result).toContain('--- DOCUMENT CONTEXT ---');
    expect(result).toContain('Document: Arcs Core Rulebook');

    // Image context
    expect(result).toContain('--- IMAGE CONTEXT ---');
    expect(result).toContain('Type: diagram');
    expect(result).toContain('Page: 5');

    // Main content & context snippets
    expect(result).toContain('--- DESCRIPTION ---');
    expect(result).toContain('Diagram showing the game board setup for a 5-player game');
    expect(result).toContain('--- SURROUNDING TEXT ---');
    expect(result).toContain('Setup steps');
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

  it('should note decorative relevance flags', () => {
    const decorativeAttachment = { ...mockAttachment, isRelevant: false };

    const result = buildImageSearchableContent(
      mockImage,
      decorativeAttachment,
      mockPage,
      mockResource
    );

    expect(result).toContain('decorative/low-information');
  });

});

describe('estimateTokenCount', () => {
  it('should estimate tokens from character length', () => {
    expect(estimateTokenCount('Hello world')).toBe(3); // 11 chars / 4 = 2.75 rounded up
    expect(estimateTokenCount('')).toBe(0);
    expect(estimateTokenCount('a'.repeat(1000))).toBe(250); // 1000 / 4
  });
});

describe('validateSearchableContentSize', () => {
  it('should validate content within limit', () => {
    const valid = validateSearchableContentSize('a'.repeat(4000), 8000);
    expect(valid.valid).toBe(true);
    expect(valid.error).toBeUndefined();
  });

  it('should reject content exceeding limit', () => {
    const invalid = validateSearchableContentSize('a'.repeat(40000), 8000);
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toContain('exceeds token limit');
  });
});
