function escapeField(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(escapeField).join(',')];
  for (const row of rows) lines.push(row.map(escapeField).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}
