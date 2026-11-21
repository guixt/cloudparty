import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown, parseMarkdown } from './markdown';

const html = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

describe('Markdown der KI-Antworten', () => {
  it('Absätze, fett, kursiv, Code, durchgestrichen', () => {
    const out = html('Das ist **fett** und *kursiv* mit `code` und ~~weg~~.\nNeue Zeile.');
    expect(out).toContain('<strong>fett</strong>');
    expect(out).toContain('<em>kursiv</em>');
    expect(out).toContain('<code>code</code>');
    expect(out).toContain('<del>weg</del>');
    expect(out).toContain('<br/>');
    expect(out).not.toContain('**');
  });

  it('Listen mit Fettdruck, wie in der Antwort aus dem Screenshot', () => {
    const out = html('Übersicht:\n- **Raum Medien Tafeln (x −11 bis −2, z 6 bis 12):** Hier stehen Tafeln.\n- **Eingangshalle:** Bänke und Laternen.\n\nDanach ein Absatz.');
    expect(out).toContain('<ul>');
    expect(out.match(/<li>/g)).toHaveLength(2);
    expect(out).toContain('<strong>Eingangshalle:</strong>');
    expect(out).toContain('<p>Danach ein Absatz.</p>');
  });

  it('nummerierte und verschachtelte Listen', () => {
    const blocks = parseMarkdown('1. Eins\n2. Zwei\n   - Unterpunkt A\n   - Unterpunkt B\n3. Drei');
    expect(blocks).toHaveLength(1);
    const list = blocks[0] as Extract<(typeof blocks)[number], { type: 'list' }>;
    expect(list.ordered).toBe(true);
    expect(list.items).toHaveLength(3);
    expect(list.items[1].children[0]).toMatchObject({ type: 'list', ordered: false });
    expect(html('1. Eins\n2. Zwei')).toContain('<ol>');
  });

  it('Überschriften, Zitate, Trennlinien, Codeblöcke (auch unfertig)', () => {
    const out = html('## Titel\n\n> Hinweis\n\n---\n\n```js\nlet a = 1 < 2;\n```');
    expect(out).toContain('<h3>Titel</h3>');
    expect(out).toContain('<blockquote>Hinweis</blockquote>');
    expect(out).toContain('<hr/>');
    expect(out).toContain('let a = 1 &lt; 2;');
    expect(html('```\nunfertig')).toContain('<pre><code>unfertig</code></pre>');
  });

  it('Tabellen', () => {
    const out = html('| Name | Wert |\n| --- | --- |\n| a | 1 |\n| b | **2** |');
    expect(out).toContain('<th>Name</th>');
    expect(out.match(/<tr>/g)).toHaveLength(3);
    expect(out).toContain('<strong>2</strong>');
  });

  it('Links nur mit http/https, kein Einschleusen von HTML', () => {
    const out = html('[Seite](https://example.org/a) und [böse](javascript:alert(1)) und <img src=x onerror=alert(1)> <script>x</script>');
    expect(out).toContain('<a href="https://example.org/a" target="_blank" rel="noopener noreferrer">Seite</a>');
    expect(out).not.toContain('href="javascript');
    expect(out).toContain('&lt;img');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script');
  });

  it('Sternchen und Unterstriche mitten im Wort bleiben Text (z. B. Rechenzeichen, Bezeichner)', () => {
    const out = html('a * b * c und snake_case_name');
    expect(out).not.toContain('<em>');
    expect(out).toContain('snake_case_name');
  });

  it('leerer Text und reiner Text bleiben unverändert', () => {
    expect(html('')).toContain('ai-md');
    expect(html('Hallo Welt')).toContain('<p>Hallo Welt</p>');
  });
});
