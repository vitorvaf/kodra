import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.js';

describe('renderMarkdown', () => {
  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('wraps plain text in a paragraph and joins soft-wrapped lines', () => {
    expect(renderMarkdown('hello\nworld')).toBe('<p>hello world</p>');
  });

  it('splits paragraphs on blank lines', () => {
    expect(renderMarkdown('one\n\ntwo')).toBe('<p>one</p>\n<p>two</p>');
  });

  it('escapes raw HTML so the output is safe for dangerouslySetInnerHTML', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
  });

  it('renders headings with inline formatting', () => {
    expect(renderMarkdown('## Hello **world**')).toBe('<h2>Hello <strong>world</strong></h2>');
  });

  it('renders bold, italic and inline code', () => {
    expect(renderMarkdown('**b** _i_ `c`')).toBe(
      '<p><strong>b</strong> <em>i</em> <code>c</code></p>',
    );
  });

  it('renders links with a safe rel/target and blocks javascript: urls', () => {
    expect(renderMarkdown('[x](https://a.b)')).toBe(
      '<p><a href="https://a.b" rel="noreferrer noopener" target="_blank">x</a></p>',
    );
    expect(renderMarkdown('[x](javascript:alert(1))')).toContain('href="#"');
  });

  it('keeps an optional link title even though the source is escaped first', () => {
    expect(renderMarkdown('[x](https://a.b "Tom & Jerry")')).toContain(' title="Tom &amp; Jerry"');
  });

  it('renders images before links so they are not claimed by the link rule', () => {
    expect(renderMarkdown('![alt](https://a.b/i.png "t")')).toBe(
      '<p><img src="https://a.b/i.png" alt="alt" title="t" /></p>',
    );
  });

  it('renders fenced code verbatim, escaped, with a language class', () => {
    expect(renderMarkdown('```ts\nconst a = "<b>";\n```')).toBe(
      '<pre><code class="lang-ts">const a = &quot;&lt;b&gt;&quot;;</code></pre>',
    );
  });

  it('closes an unterminated fence at end of input', () => {
    expect(renderMarkdown('```\nx')).toBe('<pre><code>x</code></pre>');
  });

  it('renders unordered and ordered lists and flushes when the type flips', () => {
    expect(renderMarkdown('- a\n- b\n1. c')).toBe(
      '<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n<ol>\n<li>c</li>\n</ol>',
    );
  });

  it('renders blockquotes and horizontal rules', () => {
    expect(renderMarkdown('> quoted\n\n---')).toBe('<blockquote>quoted</blockquote>\n<hr />');
  });

  it('trims trailing whitespace and closing hashes from headings', () => {
    expect(renderMarkdown('# a  ##  \nb')).toBe('<h1>a</h1>\n<p>b</p>');
  });

  it('normalizes CRLF input', () => {
    expect(renderMarkdown('a\r\n\r\nb')).toBe('<p>a</p>\n<p>b</p>');
  });
});
