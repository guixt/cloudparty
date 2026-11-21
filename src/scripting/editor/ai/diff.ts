/** Einfacher Zeilen-Diff (LCS) für die Vorschau. */
export interface DiffLine {
  type: 'same' | 'add' | 'del';
  text: string;
}

export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const mid = a.slice(start, endA);
  const mid2 = b.slice(start, endB);
  const n = mid.length;
  const m = mid2.length;
  // lcs[i][j] = Länge der LCS von mid[i..] und mid2[j..]
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = mid[i] === mid2[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = a.slice(0, start).map((text) => ({ type: 'same', text }));
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && mid[i] === mid2[j]) {
      out.push({ type: 'same', text: mid[i] });
      i++;
      j++;
    } else if (i < n && (j >= m || lcs[i + 1][j] >= lcs[i][j + 1])) {
      out.push({ type: 'del', text: mid[i++] });
    } else {
      out.push({ type: 'add', text: mid2[j++] });
    }
  }
  for (const text of a.slice(endA)) out.push({ type: 'same', text });
  return out;
}

export function diffStats(diff: readonly DiffLine[]): { added: number; removed: number } {
  return { added: diff.filter((d) => d.type === 'add').length, removed: diff.filter((d) => d.type === 'del').length };
}
