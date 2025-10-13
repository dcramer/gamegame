import { describe, test, expect } from "vitest";
import { detectImageFormat } from "@/lib/services/images";

describe("detectImageFormat", () => {
  test("detects JPEG format", () => {
    // JPEG magic bytes: FF D8 FF
    const buffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
    const result = detectImageFormat(buffer);

    expect(result).toEqual({
      extension: 'jpeg',
      mimeType: 'image/jpeg'
    });
  });

  test("detects PNG format", () => {
    // PNG magic bytes: 89 50 4E 47
    const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const result = detectImageFormat(buffer);

    expect(result).toEqual({
      extension: 'png',
      mimeType: 'image/png'
    });
  });

  test("detects GIF format", () => {
    // GIF magic bytes: 47 49 46
    const buffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    const result = detectImageFormat(buffer);

    expect(result).toEqual({
      extension: 'gif',
      mimeType: 'image/gif'
    });
  });

  test("detects WebP format", () => {
    // WebP magic bytes: 52 49 46 46
    const buffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
    const result = detectImageFormat(buffer);

    expect(result).toEqual({
      extension: 'webp',
      mimeType: 'image/webp'
    });
  });

  test("defaults to JPEG for unrecognized format", () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const result = detectImageFormat(buffer);

    expect(result).toEqual({
      extension: 'jpeg',
      mimeType: 'image/jpeg'
    });
  });

  test("handles empty buffer safely", () => {
    const buffer = Buffer.from([]);
    const result = detectImageFormat(buffer);

    // Should not throw, should default to JPEG
    expect(result).toEqual({
      extension: 'jpeg',
      mimeType: 'image/jpeg'
    });
  });

  test("handles buffer with only 1 byte", () => {
    const buffer = Buffer.from([0xFF]);
    const result = detectImageFormat(buffer);

    // Should not throw, should default to JPEG
    expect(result).toEqual({
      extension: 'jpeg',
      mimeType: 'image/jpeg'
    });
  });

  test("handles buffer with only 3 bytes", () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4E]);
    const result = detectImageFormat(buffer);

    // Should not throw, should default to JPEG (not enough bytes for PNG)
    expect(result).toEqual({
      extension: 'jpeg',
      mimeType: 'image/jpeg'
    });
  });

  test("handles corrupted JPEG header", () => {
    // Starts like JPEG but is corrupted
    const buffer = Buffer.from([0xFF, 0xD8, 0x00, 0x00]);
    const result = detectImageFormat(buffer);

    // Should not match JPEG (third byte is wrong), default to JPEG
    expect(result).toEqual({
      extension: 'jpeg',
      mimeType: 'image/jpeg'
    });
  });
});
