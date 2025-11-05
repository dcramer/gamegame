/**
 * Format a timestamp as a relative time string
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Relative time string (e.g., "5m ago", "just now")
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

/**
 * Format a duration between two timestamps
 * @param start - Start timestamp in milliseconds
 * @param end - End timestamp in milliseconds (defaults to now)
 * @returns Duration string (e.g., "2m 30s", "1h 45m")
 */
export function formatDuration(start: number, end?: number): string {
  const endTime = end || Date.now();
  const diff = endTime - start;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes < 1) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
