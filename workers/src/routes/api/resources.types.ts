export interface ResourceResponse {
  id: string;
  gameId: string;
  name: string;
  originalFilename: string;
  author: string | null;
  attributionUrl: string | null;
  url: string;
  content: string;
  version: number;
  pdfExtractor: string | null;
  processedAt: string | null;
  status: string | null;
  currentJobId: string | null;
  processingStage: string | null;
  description: string | null;
  pageCount: number | null;
  imageCount: number;
  wordCount: number;
  fragmentCount?: number;
  createdAt: string;
  updatedAt: string;
}
