/**
 * Formatting utilities for CLI output
 */

export function formatTable(rows: any[], columns: { key: string; label: string; width?: number }[]) {
  if (rows.length === 0) {
    return;
  }

  // Calculate column widths
  const widths = columns.map((col) => {
    const maxContentWidth = Math.max(
      col.label.length,
      ...rows.map((row) => String(row[col.key] || '').length)
    );
    return col.width || maxContentWidth;
  });

  // Print header
  const header = columns.map((col, i) => col.label.padEnd(widths[i])).join('  ');
  console.log(header);
  console.log('-'.repeat(header.length));

  // Print rows
  for (const row of rows) {
    const line = columns.map((col, i) => String(row[col.key] || '').padEnd(widths[i])).join('  ');
    console.log(line);
  }
}

export function success(message: string) {
  console.log(`✅ ${message}`);
}

export function error(message: string) {
  console.error(`❌ ${message}`);
}

export function info(message: string) {
  console.log(`ℹ️  ${message}`);
}

export function warning(message: string) {
  console.warn(`⚠️  ${message}`);
}
