import { describe, test, expect, vi } from "vitest";
import { replaceImageReferences, parseMarkdownHeadings } from "@/lib/pdf";
import type { PDFImage, PDFSection } from "@/lib/types/pdf";

describe("replaceImageReferences", () => {
  test("replaces image reference by ID", () => {
    const markdown = "Here's an image: ![diagram](img-123)";
    const images: PDFImage[] = [
      {
        id: "db-456",
        originalFilename: "img-123",
        pageNumber: 1,
      },
    ];

    const result = replaceImageReferences(markdown, images);

    expect(result).toBe("Here's an image: ![diagram](attachment://db-456)");
  });

  test("handles duplicate filenames by using images in order", () => {
    const markdown = "First: ![](img-0.jpeg) Second: ![](img-0.jpeg)";
    const images: PDFImage[] = [
      {
        id: "db-001",
        originalFilename: "img-0.jpeg",
        pageNumber: 1,
      },
      {
        id: "db-002",
        originalFilename: "img-0.jpeg",
        pageNumber: 1,
      },
    ];

    const result = replaceImageReferences(markdown, images);

    // Each reference should match a different image (first unused)
    expect(result).toContain("![](attachment://db-001)");
    expect(result).toContain("![](attachment://db-002)");
  });

  test("preserves alt text", () => {
    const markdown = "![Game Board Setup](img-board.png)";
    const images: PDFImage[] = [
      {
        id: "db-789",
        originalFilename: "img-board.png",
        pageNumber: 1,
      },
    ];

    const result = replaceImageReferences(markdown, images);

    expect(result).toBe("![Game Board Setup](attachment://db-789)");
  });

  test("skips already-processed attachment:// URLs", () => {
    const markdown = "![](attachment://existing-123)";
    const images: PDFImage[] = [];

    const result = replaceImageReferences(markdown, images);

    // Should not modify already-processed URLs
    expect(result).toBe("![](attachment://existing-123)");
  });

  test("skips external HTTP URLs", () => {
    const markdown = "![](https://example.com/image.png)";
    const images: PDFImage[] = [];

    const result = replaceImageReferences(markdown, images);

    // Should not modify external URLs
    expect(result).toBe("![](https://example.com/image.png)");
  });

  test("warns when image not found", () => {
    const consoleWarn = vi.spyOn(console, "warn");
    const markdown = "![](missing-image.png)";
    const images: PDFImage[] = [];

    const result = replaceImageReferences(markdown, images);

    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("No matching attachment found")
    );
    // Should keep original reference
    expect(result).toBe("![](missing-image.png)");
  });

  test("matches by filename without extension", () => {
    const markdown = "![](img-1)";
    const images: PDFImage[] = [
      {
        id: "db-100",
        originalFilename: "img-1.jpeg",
        pageNumber: 1,
      },
    ];

    const result = replaceImageReferences(markdown, images);

    expect(result).toBe("![](attachment://db-100)");
  });

  test("handles multiple images in single markdown", () => {
    const markdown = `
# Section 1
![Setup](setup.png)

# Section 2
![Board](board.png)

# Section 3
![Cards](cards.png)
`;
    const images: PDFImage[] = [
      { id: "db-s", originalFilename: "setup.png", pageNumber: 1 },
      { id: "db-b", originalFilename: "board.png", pageNumber: 1 },
      { id: "db-c", originalFilename: "cards.png", pageNumber: 1 },
    ];

    const result = replaceImageReferences(markdown, images);

    expect(result).toContain("![Setup](attachment://db-s)");
    expect(result).toContain("![Board](attachment://db-b)");
    expect(result).toContain("![Cards](attachment://db-c)");
  });

  test("handles empty images array", () => {
    const markdown = "![](image.png)";
    const images: PDFImage[] = [];

    const result = replaceImageReferences(markdown, images);

    // Should keep original (with warning)
    expect(result).toBe("![](image.png)");
  });

  test("handles markdown with no images", () => {
    const markdown = "Just text, no images";
    const images: PDFImage[] = [
      { id: "db-unused", originalFilename: "unused.png", pageNumber: 1 },
    ];

    const result = replaceImageReferences(markdown, images);

    expect(result).toBe("Just text, no images");
  });

  test("matches images by path (extracts filename)", () => {
    const markdown = "![](path/to/image.png)";
    const images: PDFImage[] = [
      {
        id: "db-path",
        originalFilename: "image.png",
        pageNumber: 1,
      },
    ];

    const result = replaceImageReferences(markdown, images);

    expect(result).toBe("![](attachment://db-path)");
  });
});

describe("parseMarkdownHeadings", () => {
  test("parses single heading", () => {
    const markdown = "# Setup";
    const result = parseMarkdownHeadings(markdown, 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      level: 1,
      text: "Setup",
      hierarchy: "Setup",
      pageNumber: 1,
    });
  });

  test("builds hierarchy for nested headings", () => {
    const markdown = `
# Game Rules
## Setup
### Player Setup
### Board Setup
## Gameplay
`;
    const result = parseMarkdownHeadings(markdown, 1);

    expect(result).toHaveLength(5);
    expect(result[0].hierarchy).toBe("Game Rules");
    expect(result[1].hierarchy).toBe("Game Rules > Setup");
    expect(result[2].hierarchy).toBe("Game Rules > Setup > Player Setup");
    expect(result[3].hierarchy).toBe("Game Rules > Setup > Board Setup");
    expect(result[4].hierarchy).toBe("Game Rules > Gameplay");
  });

  test("handles heading level changes", () => {
    const markdown = `
# Level 1
### Level 3 (skips 2)
## Level 2 (back up)
`;
    const result = parseMarkdownHeadings(markdown, 1);

    expect(result).toHaveLength(3);
    expect(result[0].hierarchy).toBe("Level 1");
    expect(result[1].hierarchy).toBe("Level 1 > Level 3 (skips 2)");
    expect(result[2].hierarchy).toBe("Level 1 > Level 2 (back up)");
  });

  test("handles multiple h1 sections", () => {
    const markdown = `
# Section A
## Subsection A1

# Section B
## Subsection B1
`;
    const result = parseMarkdownHeadings(markdown, 1);

    expect(result).toHaveLength(4);
    expect(result[0].hierarchy).toBe("Section A");
    expect(result[1].hierarchy).toBe("Section A > Subsection A1");
    expect(result[2].hierarchy).toBe("Section B");
    expect(result[3].hierarchy).toBe("Section B > Subsection B1");
  });

  test("tracks page numbers correctly", () => {
    const markdown = "# Heading on Page 5";
    const result = parseMarkdownHeadings(markdown, 5);

    expect(result[0].pageNumber).toBe(5);
  });

  test("handles markdown with no headings", () => {
    const markdown = "Just regular text without any headings";
    const result = parseMarkdownHeadings(markdown, 1);

    expect(result).toHaveLength(0);
  });

  test("trims whitespace from heading text", () => {
    const markdown = "#    Heading with spaces   ";
    const result = parseMarkdownHeadings(markdown, 1);

    expect(result[0].text).toBe("Heading with spaces");
  });

  test("handles all heading levels (1-6)", () => {
    const markdown = `
# H1
## H2
### H3
#### H4
##### H5
###### H6
`;
    const result = parseMarkdownHeadings(markdown, 1);

    expect(result).toHaveLength(6);
    expect(result.map(h => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("parses # at start of line (simplified logic)", () => {
    const markdown = `
# Real Heading
This is not a heading: # fake (not at start)
\`\`\`
# Code heading (still matches - regex is simple)
\`\`\`
`;
    const result = parseMarkdownHeadings(markdown, 1);

    // The function uses simple regex - matches any line starting with #
    // This is acceptable behavior for PDF extraction
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Real Heading");
    expect(result[1].text).toBe("Code heading (still matches - regex is simple)");
  });

  test("handles headings with special characters", () => {
    const markdown = "# Setup: 2-4 Players (Basic)";
    const result = parseMarkdownHeadings(markdown, 1);

    expect(result[0].text).toBe("Setup: 2-4 Players (Basic)");
  });
});
