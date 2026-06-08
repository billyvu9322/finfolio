import { describe, expect, it } from 'vitest';

import { buildCsv } from '../../src/lib/csv.js';

describe('buildCsv', () => {
  it('joins headers + rows with CRLF and a BOM', () => {
    const output = buildCsv(['a', 'b'], [[1, 2], [3, 4]]);
    expect(output.startsWith('\uFEFF')).toBe(true);
    expect(output).toContain('a,b\r\n1,2\r\n3,4');
  });

  it('escapes commas, quotes, and newlines', () => {
    const output = buildCsv(['x'], [['a,b'], ['he said "hi"'], ['line\nbreak']]);
    expect(output).toContain('"a,b"');
    expect(output).toContain('"he said ""hi"""');
    expect(output).toContain('"line\nbreak"');
  });
});
