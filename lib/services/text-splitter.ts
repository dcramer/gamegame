/**
 * Lightweight text splitter implementation
 * Replaces LangChain's RecursiveCharacterTextSplitter to avoid Workers compatibility issues
 */

export interface Document {
  pageContent: string;
  metadata?: Record<string, any>;
}

export interface TextSplitterParams {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
  keepSeparator?: boolean;
  lengthFunction?: (text: string) => number;
}

/**
 * Recursively split text using a hierarchy of separators
 *
 * Algorithm:
 * 1. Try to split by first separator in list
 * 2. For each split, if it's too large, recursively split with next separator
 * 3. Merge small splits together with overlap to reach target chunk size
 */
export class RecursiveCharacterTextSplitter {
  private chunkSize: number;
  private chunkOverlap: number;
  private separators: string[];
  private keepSeparator: boolean;
  private lengthFunction: (text: string) => number;

  constructor(params: TextSplitterParams = {}) {
    this.chunkSize = params.chunkSize ?? 1000;
    this.chunkOverlap = params.chunkOverlap ?? 100;
    this.separators = params.separators ?? ['\n\n', '\n', ' ', ''];
    this.keepSeparator = params.keepSeparator ?? true;
    this.lengthFunction = params.lengthFunction ?? ((text: string) => text.length);

    if (this.chunkOverlap >= this.chunkSize) {
      throw new Error('Cannot have chunkOverlap >= chunkSize');
    }
  }

  /**
   * Split text into chunks
   */
  async splitText(text: string): Promise<string[]> {
    return this._splitText(text, this.separators);
  }

  /**
   * Create documents from text chunks
   */
  async createDocuments(
    texts: string[],
    metadatas: Record<string, any>[] = []
  ): Promise<Document[]> {
    const _metadatas =
      metadatas.length > 0
        ? metadatas
        : texts.map(() => ({}));

    const documents: Document[] = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const chunks = await this.splitText(text);

      for (const chunk of chunks) {
        documents.push({
          pageContent: chunk,
          metadata: _metadatas[i],
        });
      }
    }

    return documents;
  }

  /**
   * Recursively split text using separator hierarchy
   */
  private async _splitText(text: string, separators: string[]): Promise<string[]> {
    const finalChunks: string[] = [];

    // Find first separator that exists in text
    let separator = separators[separators.length - 1];
    let newSeparators: string[] | undefined;

    for (let i = 0; i < separators.length; i++) {
      const s = separators[i];
      if (s === '') {
        separator = s;
        break;
      }
      if (text.includes(s)) {
        separator = s;
        newSeparators = separators.slice(i + 1);
        break;
      }
    }

    // Split text by separator
    const splits = this.splitOnSeparator(text, separator);

    // Process each split
    let goodSplits: string[] = [];
    const _separator = this.keepSeparator ? '' : separator;

    for (const s of splits) {
      const length = await this.lengthFunction(s);

      if (length < this.chunkSize) {
        // Split is small enough, keep it
        goodSplits.push(s);
      } else {
        // Split is too large
        if (goodSplits.length > 0) {
          // Merge accumulated good splits
          const mergedText = await this.mergeSplits(goodSplits, _separator);
          finalChunks.push(...mergedText);
          goodSplits = [];
        }

        if (!newSeparators) {
          // No more separators to try, keep as-is (will warn if too large)
          finalChunks.push(s);
        } else {
          // Recursively split with next separator
          const otherInfo = await this._splitText(s, newSeparators);
          finalChunks.push(...otherInfo);
        }
      }
    }

    // Merge remaining good splits
    if (goodSplits.length > 0) {
      const mergedText = await this.mergeSplits(goodSplits, _separator);
      finalChunks.push(...mergedText);
    }

    return finalChunks;
  }

  /**
   * Split text on separator, keeping separator if configured
   */
  private splitOnSeparator(text: string, separator: string): string[] {
    let splits: string[];

    if (separator) {
      if (this.keepSeparator) {
        // Use lookahead to keep separator at start of each split
        const regexEscapedSeparator = separator.replace(
          /[/\-\\^$*+?.()|[\]{}]/g,
          '\\$&'
        );
        splits = text.split(new RegExp(`(?=${regexEscapedSeparator})`));
      } else {
        splits = text.split(separator);
      }
    } else {
      // Split into individual characters
      splits = text.split('');
    }

    return splits.filter((s) => s !== '');
  }

  /**
   * Merge splits into chunks with overlap
   */
  private async mergeSplits(
    splits: string[],
    separator: string
  ): Promise<string[]> {
    const docs: string[] = [];
    const currentDoc: string[] = [];
    let total = 0;

    for (const d of splits) {
      const _len = await this.lengthFunction(d);

      // Check if adding this split would exceed chunk size
      if (
        total + _len + currentDoc.length * separator.length >
        this.chunkSize
      ) {
        if (total > this.chunkSize) {
          console.warn(
            `Created a chunk of size ${total}, which is longer than the specified ${this.chunkSize}`
          );
        }

        if (currentDoc.length > 0) {
          // Join current doc and save
          const doc = this.joinDocs(currentDoc, separator);
          if (doc !== null) {
            docs.push(doc);
          }

          // Remove splits from start until we're under overlap size
          while (
            total > this.chunkOverlap ||
            (total + _len + currentDoc.length * separator.length >
              this.chunkSize &&
              total > 0)
          ) {
            total -= await this.lengthFunction(currentDoc[0]);
            currentDoc.shift();
          }
        }
      }

      currentDoc.push(d);
      total += _len;
    }

    // Add final doc
    const doc = this.joinDocs(currentDoc, separator);
    if (doc !== null) {
      docs.push(doc);
    }

    return docs;
  }

  /**
   * Join documents with separator
   */
  private joinDocs(docs: string[], separator: string): string | null {
    const text = docs.join(separator).trim();
    return text === '' ? null : text;
  }

  /**
   * Create splitter configured for a specific language
   */
  static fromLanguage(
    language: 'markdown',
    options?: Partial<TextSplitterParams>
  ): RecursiveCharacterTextSplitter {
    return new RecursiveCharacterTextSplitter({
      ...options,
      separators: RecursiveCharacterTextSplitter.getSeparatorsForLanguage(language),
    });
  }

  /**
   * Get separators for a language
   */
  static getSeparatorsForLanguage(language: 'markdown'): string[] {
    if (language === 'markdown') {
      return [
        // Split by markdown headings (level 2-6)
        '\n## ',
        '\n### ',
        '\n#### ',
        '\n##### ',
        '\n###### ',
        // Code blocks
        '```\n\n',
        // Horizontal rules
        '\n\n***\n\n',
        '\n\n---\n\n',
        '\n\n___\n\n',
        // Paragraphs
        '\n\n',
        // Lines
        '\n',
        // Words
        ' ',
        // Characters
        '',
      ];
    }

    throw new Error(`Unsupported language: ${language}`);
  }
}
