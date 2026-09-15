// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { renderReleaseNotes, sanitizeHtml } from './markdown.js';

describe('renderReleaseNotes', () => {
  it('renders markdown release notes with the markdown renderer', () => {
    const html = renderReleaseNotes('## Fixed\n\n- **bold** item');
    expect(html).toContain('<h2>Fixed</h2>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('preserves safe markup from HTML release notes', () => {
    const html = renderReleaseNotes('<h2>Fixed</h2><p>hello <strong>world</strong></p>');
    expect(html).toContain('<h2>Fixed</h2>');
    expect(html).toContain('<strong>world</strong>');
  });

  it('sanitizes unsafe elements, attributes, and URLs', () => {
    const html = sanitizeHtml(
      '<img src=x onerror=alert(1)><a href="javascript:evil()">x</a>' +
        '<script>alert(1)</script><div onclick="x">text</div>',
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('<a href="#">x</a>');
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('<div');
    expect(html).toContain('text');
  });

  it('renders plain text as markdown', () => {
    expect(renderReleaseNotes('plain text')).toBe('<p>plain text</p>');
  });
});
