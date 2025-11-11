export type ReprocessStage = 'ingest' | 'vision' | 'cleanup' | 'metadata' | 'embed';

type StageDefinition = {
  label: string;
  actionTitle: string;
  actionDescription: string;
  onlyStage: boolean;
};

export const REPROCESS_STAGE_DEFINITIONS: Record<ReprocessStage, StageDefinition> = {
  ingest: {
    label: 'Full Pipeline',
    actionTitle: 'Full Pipeline Re-run',
    actionDescription: 'Start over from PDF ingest through embeddings. Slowest but most thorough option.',
    onlyStage: false,
  },
  vision: {
    label: 'Vision Analysis',
    actionTitle: 'Re-run Vision Analysis',
    actionDescription: 'Refresh GPT-5 image analysis without touching markdown, metadata, or embeddings.',
    onlyStage: true,
  },
  cleanup: {
    label: 'Markdown Cleanup',
    actionTitle: 'Re-run Markdown Cleanup',
    actionDescription: 'Reapply formatting heuristics while keeping existing images, metadata, and embeddings.',
    onlyStage: true,
  },
  metadata: {
    label: 'Metadata Generation',
    actionTitle: 'Re-run Metadata Generation',
    actionDescription: 'Regenerate the resource title and description without re-ingesting or re-embedding content.',
    onlyStage: true,
  },
  embed: {
    label: 'Embedding Generation',
    actionTitle: 'Re-run Embedding Generation',
    actionDescription: 'Rebuild search fragments and embeddings using the current cleaned content.',
    onlyStage: true,
  },
};

export const REPROCESS_STAGE_ORDER: ReprocessStage[] = ['ingest', 'vision', 'cleanup', 'metadata', 'embed'];

export function getStageDisplayName(stage: ReprocessStage, subject?: string) {
  const base = REPROCESS_STAGE_DEFINITIONS[stage].label;
  return subject ? `${base}: ${subject}` : base;
}

export function getStageMessages(stage: ReprocessStage, subject?: string) {
  const label = REPROCESS_STAGE_DEFINITIONS[stage].label;
  const suffix = subject ? ` for ${subject}` : '';

  const base = `${label}${suffix}`;

  return {
    starting: `${label} starting${suffix}`,
    pending: `${label} running${suffix}`,
    success: `${label} completed${suffix}`,
    cancelled: `${label} cancelled${suffix}`,
    failure: (error: string) => `${base} failed: ${error}`,
  };
}
