/**
 * Kleiner, sicherer Markdown-Darstellung für Antworten der KI (ohne Abhängigkeit, ohne HTML-Einschleusung:
 * es werden nur React-Elemente erzeugt). Unterstützt Überschriften, Absätze, Listen (auch verschachtelt), Zitate,
 * Codeblöcke, Tabellen, Trennlinien sowie **fett**, *kursiv*, `Code`, ~~durchgestrichen~~ und Links (nur http/https).
 * Unfertiger Text während des Streamens bleibt lesbar.
 */
import { Fragment, type ReactNode } from 'react';

export type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; text: string; lang?: string }
  | { type: 'list'; ordered: boolean; items: { text: string; children: Block[] }[] }
  | { type: 'quote'; text: string }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'rule' };

const BULLET = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}
const isTableSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('-');

/** Zerlegt Markdown-Text in Blöcke. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    const fence = /^\s*```(\S*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // schließender Zaun (fehlt beim Streamen evtl.)
      blocks.push({ type: 'code', text: body.join('\n'), ...(fence[1] ? { lang: fence[1] } : {}) });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') rows.push(cells(lines[i++]));
      blocks.push({ type: 'table', header, rows });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', text: quote.join('\n') });
      continue;
    }
    if (BULLET.test(line)) {
      const start = BULLET.exec(line)!;
      const ordered = /\d/.test(start[2]);
      const baseIndent = start[1].length;
      const items: { text: string; children: Block[] }[] = [];
      while (i < lines.length) {
        const m = BULLET.exec(lines[i]);
        if (!m || m[1].length < baseIndent || m[1].length >= baseIndent + 2) {
          if (m && m[1].length >= baseIndent + 2 && items.length > 0) {
            // verschachtelte Liste: alle weiter eingerückten Zeilen sammeln
            const nested: string[] = [];
            while (i < lines.length && (BULLET.test(lines[i]) ? BULLET.exec(lines[i])![1].length >= baseIndent + 2 : /^\s{2,}\S/.test(lines[i]))) nested.push(lines[i++]);
            items[items.length - 1].children.push(...parseMarkdown(nested.map((l) => l.slice(Math.min(baseIndent + 2, l.length - l.trimStart().length))).join('\n')));
            continue;
          }
          // Fortsetzungszeile des letzten Punktes (eingerückt, keine neue Aufzählung)
          if (!m && items.length > 0 && /^\s{2,}\S/.test(lines[i])) {
            items[items.length - 1].text += `\n${lines[i++].trim()}`;
            continue;
          }
          break;
        }
        items.push({ text: m[3], children: [] });
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    // Absatz: bis zur Leerzeile oder dem nächsten Blockbeginn
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^\s*```/.test(lines[i]) && !/^(#{1,6})\s/.test(lines[i]) && !BULLET.test(lines[i]) && !/^\s*>/.test(lines[i])) para.push(lines[i++]);
    if (para.length === 0) {
      para.push(lines[i++]);
    }
    blocks.push({ type: 'paragraph', text: para.join('\n') });
  }
  return blocks;
}

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|(~~[^~\n]+?~~)|(\*[^*\s][^*\n]*?\*|(?<![A-Za-z0-9])_[^_\s][^_\n]*?_(?![A-Za-z0-9]))|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/;

/** Inline-Auszeichnung zu React-Knoten. */
export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest.length > 0) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const token = m[0];
    const key = `${keyPrefix}${k++}`;
    if (m[1]) out.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={key}>{renderInline(token.slice(2, -2), `${key}.`)}</strong>);
    else if (m[3]) out.push(<del key={key}>{renderInline(token.slice(2, -2), `${key}.`)}</del>);
    else if (m[4]) out.push(<em key={key}>{renderInline(token.slice(1, -1), `${key}.`)}</em>);
    else {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token)!;
      out.push(
        <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>,
      );
    }
    rest = rest.slice(m.index + token.length);
  }
  return out;
}

function lines(text: string, key: string): ReactNode[] {
  return text.split('\n').flatMap((line, idx, all) => [...renderInline(line, `${key}${idx}.`), idx < all.length - 1 ? <br key={`${key}br${idx}`} /> : null]);
}

function renderBlock(b: Block, key: string): ReactNode {
  switch (b.type) {
    case 'heading': {
      const Tag = (`h${Math.min(6, Math.max(3, b.level + 1))}` as 'h3' | 'h4' | 'h5' | 'h6');
      return <Tag key={key}>{renderInline(b.text, `${key}.`)}</Tag>;
    }
    case 'paragraph':
      return <p key={key}>{lines(b.text, `${key}.`)}</p>;
    case 'code':
      return (
        <pre key={key}>
          <code>{b.text}</code>
        </pre>
      );
    case 'quote':
      return <blockquote key={key}>{lines(b.text, `${key}.`)}</blockquote>;
    case 'rule':
      return <hr key={key} />;
    case 'list': {
      const Tag = b.ordered ? 'ol' : 'ul';
      return (
        <Tag key={key}>
          {b.items.map((item, idx) => (
            <li key={idx}>
              {lines(item.text, `${key}.${idx}.`)}
              {item.children.map((c, ci) => renderBlock(c, `${key}.${idx}.c${ci}`))}
            </li>
          ))}
        </Tag>
      );
    }
    case 'table':
      return (
        <div key={key} className="ai-md-table">
          <table>
            <thead>
              <tr>
                {b.header.map((h, idx) => (
                  <th key={idx}>{renderInline(h, `${key}.h${idx}.`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci}>{renderInline(c, `${key}.${ri}.${ci}.`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="ai-md" data-testid="ai-md">
      {blocks.map((b, i) => (
        <Fragment key={i}>{renderBlock(b, `b${i}`)}</Fragment>
      ))}
    </div>
  );
}
