/**
 * Generic types for PDF extraction with metadata.
 * These types are extractor-agnostic and work with any PDF processing method.
 */

/**
 * Represents an image extracted from a PDF
 */
export interface PDFImage {
  /** Unique identifier for the image (database ID after storage) */
  id: string;
  /** Original filename from Mistral (e.g., "img-0.jpeg") - used for matching */
  originalFilename?: string;
  /** Bounding box coordinates [x1, y1, x2, y2] if available */
  bbox?: number[];
  /** Base64 encoded image data (if extracted) */
  base64?: string;
  /** URL to stored image (after upload to blob storage) */
  url?: string;
  /** MIME type for the stored image */
  mimeType?: string;
  /** Optional caption or alt text */
  caption?: string;
  /** Page number where this image appears */
  pageNumber: number;
  /** AI-generated description of the image content */
  description?: string;
  /** Quality assessment: "good" or "bad" */
  isGoodQuality?: "good" | "bad" | null;
  /** Whether the image is relevant (1) or not (0) */
  isRelevant?: number | null;
  /** Detected image type/classification */
  detectedType?: string | null;
  /** OCR text extracted from the image */
  ocrText?: string | null;
}

/**
 * Represents a heading/section in the document
 */
export interface PDFSection {
  /** Heading level (1-6, like HTML h1-h6) */
  level: number;
  /** The heading text */
  text: string;
  /** Full hierarchy path, e.g., "Setup > Player Setup > Deal Cards" */
  hierarchy: string;
  /** Page number where this section starts */
  pageNumber: number;
}

/**
 * Represents a single page of extracted PDF content
 */
export interface PDFPage {
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Markdown-formatted content of the page */
  markdown: string;
  /** Images found on this page */
  images: PDFImage[];
  /** Sections/headings found on this page */
  sections: PDFSection[];
  /** Optional metadata about page dimensions */
  metadata?: {
    width?: number;
    height?: number;
    dpi?: number;
  };
}

/**
 * Complete structured PDF extraction result
 */
export interface StructuredPDFContent {
  /** All pages in the document */
  pages: PDFPage[];
  /** Total number of pages */
  pageCount: number;
  /** Optional document-level metadata */
  metadata?: {
    title?: string;
    author?: string;
    [key: string]: any;
  };
}

/**
 * Represents a text chunk with preserved metadata for embedding
 */
export interface PDFChunk {
  /** The text content of this chunk */
  content: string;
  /** Primary page number this chunk is from */
  pageNumber: number;
  /** Page range if chunk spans multiple pages */
  pageRange?: [number, number];
  /** Section hierarchy for this chunk */
  section?: string;
  /** Images associated with this chunk */
  images: Array<{
    id: string;
    url: string;
    bbox?: number[];
    caption?: string;
    /** Vision-generated description aligned to this chunk */
    description?: string;
    /** Detected image type such as diagram or table */
    detectedType?: string;
    /** OCR text extracted from the image */
    ocrText?: string | null;
    /** Whether the image was marked relevant to gameplay */
    isRelevant?: boolean;
  }>;
}

/**
 * Result from PDF text extraction (backward compatible with existing code)
 */
export interface PDFExtractionResult {
  /** Plain text or markdown content (for backward compatibility) */
  text: string;
  /** Structured content with metadata (if extractor supports it) */
  structured?: StructuredPDFContent;
}
