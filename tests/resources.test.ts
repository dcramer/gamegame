import { describe, test, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";

// We'll mock these modules
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("@/lib/services/images", () => ({
  deleteImages: vi.fn(),
  deleteResourceImages: vi.fn(),
}));

vi.mock("@/lib/services/resource-processor", () => ({
  uploadResourceImages: vi.fn(),
  processResourceContent: vi.fn(),
  calculateResourceStats: vi.fn(),
  cleanupBlobsOnError: vi.fn(),
}));

vi.mock("@/lib/ai/search", () => ({
  generateEmbeddings: vi.fn(),
}));

vi.mock("@/lib/pdf", () => ({
  extractTextFromPdf: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { db } from "@/lib/db";
import {
  deleteImages,
  deleteResourceImages,
} from "@/lib/services/images";
import {
  uploadResourceImages,
  processResourceContent,
  calculateResourceStats,
} from "@/lib/services/resource-processor";
import { generateEmbeddings } from "@/lib/ai/search";
import { extractTextFromPdf } from "@/lib/pdf";
import { auth } from "@/auth";

// Import the functions we want to test
import {
  deleteResource,
  reprocessResource,
  createResource,
  getAllResourcesForGame,
} from "@/lib/actions/resources";

describe("Resource Actions - Image Cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default auth mock - admin user
    vi.mocked(auth).mockResolvedValue({
      user: { admin: true },
    } as any);
  });

  describe("deleteResource", () => {
    test("should delete all images for the resource", async () => {
      const resourceId = "resource-1";

      // Mock: Resource has 2 fragments with images
      const resourceFragments = [
        {
          images: [
            { id: "img1", url: "http://example.com/resources/resource-1/images/img1.png" },
            { id: "img2", url: "http://example.com/resources/resource-1/images/img2.png" },
          ],
        },
        {
          images: [
            { id: "img3", url: "http://example.com/resources/resource-1/images/img3.png" },
          ],
        },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(resourceFragments),
        }),
      } as any);

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      await deleteResource(resourceId);

      // Should call deleteResourceImages with the fragments
      expect(deleteResourceImages).toHaveBeenCalledWith(resourceFragments);
    });

    test("should handle resources with no images", async () => {
      const resourceId = "resource-1";

      // Mock: Resource has no images
      const resourceFragments = [
        { images: null },
        { images: [] },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(resourceFragments),
        }),
      } as any);

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      await deleteResource(resourceId);

      // Should still call deleteResourceImages but it will find no images
      expect(deleteResourceImages).toHaveBeenCalledWith(resourceFragments);
    });
  });

  describe("reprocessResource", () => {
    test("should delete all old images when reprocessing", async () => {
      const resourceId = "resource-1";

      // Mock: Fetch PDF content
      global.fetch = vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      } as any);

      // Mock: PDF extraction with NEW images
      vi.mocked(extractTextFromPdf).mockResolvedValue({
        text: "New content",
        structured: {
          pageCount: 2,
          pages: [
            {
              pageNumber: 1,
              markdown: "Content",
              images: [
                {
                  id: "new-img1",
                  base64: "base64data",
                  pageNumber: 1,
                },
              ],
              sections: [],
            },
          ],
        },
      });

      // Mock: Image upload to blob storage
      vi.mocked(uploadResourceImages).mockResolvedValue([
        {
          tempId: "new-img1",
          url: "http://example.com/resources/resource-1/images/new-img1.png",
          mimeType: "image/png",
          image: {
            id: "new-img1",
            base64: "base64data",
            pageNumber: 1,
          },
        },
      ]);

      // Mock: Process resource content (attachments + embeddings)
      vi.mocked(processResourceContent).mockResolvedValue({
        finalContent: "New content",
        embeddings: [
          {
            content: "chunk1",
            embedding: new Array(1536).fill(0.1),
            pageNumber: 1,
            images: [
              {
                id: "new-img1",
                url: "http://example.com/resources/resource-1/images/new-img1.png",
              },
            ],
          },
        ],
        version: 3,
      });

      // Mock: Calculate stats
      vi.mocked(calculateResourceStats).mockReturnValue({
        pageCount: 2,
        imageCount: 1,
        wordCount: 2,
      });

      // Mock: Old attachments for cleanup
      const oldAttachments = [
        {
          id: "old-img1",
          url: "http://example.com/resources/resource-1/images/old-img1.png",
        },
        {
          id: "old-img2",
          url: "http://example.com/resources/resource-1/images/old-img2.png",
        },
      ];

      // Mock db.select for getting old attachments (before transaction)
      const mockSelectForAttachments = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(oldAttachments),
        }),
      });

      const mockTransaction = vi.fn(async (callback) => {
        // Setup mocks for transaction context
        const txMock = {
          select: vi.fn(),
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
          execute: vi.fn().mockResolvedValue(undefined), // For SET LOCAL statement_timeout
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                  {
                    id: resourceId,
                    name: "Manual.pdf",
                    url: "http://example.com/manual.pdf",
                    version: 3,
                    pdfExtractor: "mistral",
                    processedAt: new Date(),
                    pageCount: 2,
                    imageCount: 1,
                    wordCount: 2,
                  },
                ]),
              }),
            }),
          }),
        };

        // Call the callback to execute the transaction logic
        await callback(txMock);

        // Return what the transaction should return: [newResource, embeddingCount]
        return [
          {
            id: resourceId,
            name: "Manual.pdf",
            url: "http://example.com/manual.pdf",
            version: 3,
            pdfExtractor: "mistral",
            processedAt: new Date(),
            pageCount: 2,
            imageCount: 1,
            wordCount: 2,
          },
          1, // embeddingCount
        ];
      });

      // Setup db.select to handle multiple calls in order
      const mockSelect = vi.fn();
      mockSelect
        .mockReturnValueOnce({ // First call: initial resource fetch
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: resourceId,
                  name: "Manual.pdf",
                  url: "http://example.com/manual.pdf",
                  gameId: "game-1",
                },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce(mockSelectForAttachments()); // Second call: get old attachments

      vi.mocked(db.select).mockImplementation(mockSelect);
      vi.mocked(db.transaction).mockImplementation(mockTransaction as any);

      await reprocessResource(resourceId);

      // Should call deleteImages with the old attachment URLs
      expect(deleteImages).toHaveBeenCalledWith([
        "http://example.com/resources/resource-1/images/old-img1.png",
        "http://example.com/resources/resource-1/images/old-img2.png",
      ]);
    });
  });

  describe("getAllResourcesForGame - Statistics", () => {
    test("should correctly calculate resource statistics", async () => {
      const gameId = "game-1";

      // Mock: Resource list with denormalized stats
      const resources = [
        {
          id: "resource-1",
          name: "Manual.pdf",
          url: "http://example.com/manual.pdf",
          version: 3,
          pdfExtractor: "mistral",
          processedAt: new Date(),
          content: "This is a test manual with many words in it",
          hasContent: true,
          pageCount: 42,
          imageCount: 8,
          wordCount: 10,
        },
      ];

      // Mock: Fragment stats
      const fragmentStats = [
        {
          count: 15,
          maxPage: 42,
        },
      ];

      // Mock: Image count
      const imageCountResult = {
        rows: [{ count: "8" }],
      };

      const mockSelect = vi.fn();
      mockSelect
        // First call: get resources
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(resources),
            }),
          }),
        })
        // Second call: get fragment stats
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(fragmentStats),
            }),
          }),
        });

      vi.mocked(db.select).mockImplementation(mockSelect);
      vi.mocked(db.execute).mockResolvedValue(imageCountResult as any);

      const result = await getAllResourcesForGame(gameId);

      expect(result).toHaveLength(1);
      expect(result[0].stats).toEqual({
        fragmentCount: 15,
        pageCount: 42,
        imageCount: 8,
        wordCount: 10, // "This is a test manual with many words in it" = 10 words
      });
    });

    test("should handle resources with no images", async () => {
      const gameId = "game-1";

      const resources = [
        {
          id: "resource-1",
          name: "Manual.pdf",
          url: "http://example.com/manual.pdf",
          version: 3,
          pdfExtractor: "mistral",
          processedAt: new Date(),
          content: "Test content",
          hasContent: true,
          pageCount: 10,
          imageCount: 0,
          wordCount: 2,
        },
      ];

      const fragmentStats = [{ count: 5, maxPage: 10 }];

      // No images
      const imageCountResult = { rows: [{ count: "0" }] };

      const mockSelect = vi.fn();
      mockSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(resources),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(fragmentStats),
            }),
          }),
        });

      vi.mocked(db.select).mockImplementation(mockSelect);
      vi.mocked(db.execute).mockResolvedValue(imageCountResult as any);

      const result = await getAllResourcesForGame(gameId);

      expect(result[0].stats.imageCount).toBe(0);
    });

    test("should handle empty content for word count", async () => {
      const gameId = "game-1";

      const resources = [
        {
          id: "resource-1",
          name: "Manual.pdf",
          url: "http://example.com/manual.pdf",
          version: 3,
          pdfExtractor: "mistral",
          processedAt: new Date(),
          content: "",
          hasContent: false,
          pageCount: null,
          imageCount: 0,
          wordCount: 0,
        },
      ];

      const fragmentStats = [{ count: 0, maxPage: null }];
      const imageCountResult = { rows: [{ count: "0" }] };

      const mockSelect = vi.fn();
      mockSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(resources),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(fragmentStats),
            }),
          }),
        });

      vi.mocked(db.select).mockImplementation(mockSelect);
      vi.mocked(db.execute).mockResolvedValue(imageCountResult as any);

      const result = await getAllResourcesForGame(gameId);

      expect(result[0].stats.wordCount).toBe(0);
    });
  });
});
