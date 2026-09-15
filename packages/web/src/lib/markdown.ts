/**
 * Hand-rolled markdown to HTML renderer.
 *
 * Intentionally minimal — covers what the description / PR-body / house-rules
 * editor surfaces produce: paragraphs, headings (h1-h4), bold, italic, inline
 * code, fenced code, links, images, ordered / unordered lists, blockquotes,
 * horizontal rules, and line breaks. No HTML passthrough — every output is
 * escaped first and then re-decorated through whitelisted patterns, so the
 * preview is safe to drop into `dangerouslySetInnerHTML`.
 *
 * Keep this file dependency-free and under ~200 LOC.
 */

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ENTITIES[ch] ?? ch);
}

// Safer URL filter so the preview can't smuggle javascript: / data: schemes.
function safeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return '#';
  return escapeHtml(trimmed);
}

const RELEASE_NOTE_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'b',
  'i',
  'code',
  'pre',
  'blockquote',
  'a',
  'br',
  'hr',
]);

const RELEASE_NOTE_DROP_CONTENT_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed']);

export function looksLikeHtml(src: string): boolean {
  const trimmed = src.trim();
  return (
    trimmed.startsWith('<') &&
    /<\/?(?:h[1-6]|p|ul|ol|li|div|br|hr|strong|em|b|i|code|pre|blockquote|a)\b/i.test(trimmed)
  );
}

export function sanitizeHtml(src: string): string {
  const document = new DOMParser().parseFromString(src, 'text/html');
  const output = document.createElement('div');

  function appendNode(node: Node, parent: Element): void {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.nodeValue ?? ''));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const source = node as Element;
    const tag = source.tagName.toLowerCase();
    if (RELEASE_NOTE_DROP_CONTENT_TAGS.has(tag)) return;
    if (!RELEASE_NOTE_TAGS.has(tag)) {
      for (const child of source.childNodes) appendNode(child, parent);
      return;
    }

    const target = document.createElement(tag);
    if (tag === 'a') {
      const href = source.getAttribute('href');
      if (href !== null) {
        // safeUrl performs the scheme check; use the original value when
        // setting a DOM attribute so entity escaping is serialized once.
        const checkedHref = safeUrl(href);
        target.setAttribute('href', checkedHref === '#' ? '#' : href.trim());
      }
      const title = source.getAttribute('title');
      if (title !== null) target.setAttribute('title', title);
    } else if (tag === 'code') {
      const className = source.getAttribute('class');
      if (className !== null && /^lang-[\w-]+$/.test(className)) {
        target.setAttribute('class', className);
      }
    }
    parent.appendChild(target);
    for (const child of source.childNodes) appendNode(child, target);
  }

  for (const child of document.body.childNodes) appendNode(child, output);
  return output.innerHTML;
}

function applyInline(src: string): string {
  let out = escapeHtml(src);
  // The source is already HTML-escaped here, so an optional title reads as
  // `&quot;...&quot;` rather than raw quotes, and needs no second escaping.
  // Images first so the link rule below doesn't claim them.
  out = out.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^"]*?)&quot;)?\)/g,
    (_m, alt: string, url: string, title?: string) => {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<img src="${safeUrl(url)}" alt="${escapeHtml(alt)}"${titleAttr} />`;
    },
  );
  // Links.
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^"]*?)&quot;)?\)/g,
    (_m, label: string, url: string, title?: string) => {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${safeUrl(url)}"${titleAttr} rel="noreferrer noopener" target="_blank">${label}</a>`;
    },
  );
  // Inline code — protect its contents from further inline processing by
  // running the rule before bold/italic and skipping nested matches.
  out = out.replace(/`([^`\n]+)`/g, (_m, code: string) => `<code>${code}</code>`);
  // Bold (** or __) then italic (* or _). Order matters so `**word**` doesn't
  // get eaten as italic-italic.
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
  // Hard line breaks: two trailing spaces before a newline.
  out = out.replace(/ {2}\n/g, '<br />');
  return out;
}

interface ListItem {
  ordered: boolean;
  level: number;
  text: string;
}

function flushList(items: ListItem[], out: string[]): void {
  if (items.length === 0) return;
  const ordered = items[0]!.ordered;
  out.push(ordered ? '<ol>' : '<ul>');
  for (const item of items) {
    out.push(`<li>${applyInline(item.text)}</li>`);
  }
  out.push(ordered ? '</ol>' : '</ul>');
  items.length = 0;
}

function flushParagraph(buf: string[], out: string[]): void {
  if (buf.length === 0) return;
  out.push(`<p>${applyInline(buf.join(' ').trim())}</p>`);
  buf.length = 0;
}

function flushBlockquote(buf: string[], out: string[]): void {
  if (buf.length === 0) return;
  out.push(`<blockquote>${applyInline(buf.join(' ').trim())}</blockquote>`);
  buf.length = 0;
}

export function renderMarkdown(src: string): string {
  if (!src) return '';
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  const para: string[] = [];
  const quote: string[] = [];
  const list: ListItem[] = [];

  let inCode = false;
  let codeBuf: string[] = [];
  let codeLang = '';

  for (const raw of lines) {
    const line = raw;

    // Fenced code blocks — verbatim, no inline rules.
    const fence = /^```(\S*)\s*$/.exec(line);
    if (fence) {
      if (inCode) {
        out.push(
          `<pre><code${codeLang ? ` class="lang-${escapeHtml(codeLang)}"` : ''}>${escapeHtml(codeBuf.join('\n'))}</code></pre>`,
        );
        codeBuf = [];
        codeLang = '';
        inCode = false;
      } else {
        flushParagraph(para, out);
        flushBlockquote(quote, out);
        flushList(list, out);
        inCode = true;
        codeLang = fence[1] ?? '';
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // Blank line → close any open block.
    if (/^\s*$/.test(line)) {
      flushParagraph(para, out);
      flushBlockquote(quote, out);
      flushList(list, out);
      continue;
    }

    // Headings.
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flushParagraph(para, out);
      flushBlockquote(quote, out);
      flushList(list, out);
      const level = heading[1]!.length;
      out.push(`<h${level}>${applyInline(heading[2]!)}</h${level}>`);
      continue;
    }

    // Horizontal rule.
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph(para, out);
      flushBlockquote(quote, out);
      flushList(list, out);
      out.push('<hr />');
      continue;
    }

    // Lists (bullet or numbered).
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    const numbered = /^(\s*)\d+\.\s+(.*)$/.exec(line);
    if (bullet ?? numbered) {
      flushParagraph(para, out);
      flushBlockquote(quote, out);
      const match = bullet ?? numbered!;
      const ordered = bullet === null;
      const level = Math.floor((match[1]!.length || 0) / 2);
      const text = match[2] ?? '';
      // If the list type flips, flush and start a new one. Nested lists are
      // rendered flat — keeping the renderer simple is more important than
      // perfect nesting for our prose surfaces.
      if (list.length > 0 && list[0]!.ordered !== ordered) {
        flushList(list, out);
      }
      list.push({ ordered, level, text });
      continue;
    }
    flushList(list, out);

    // Blockquote.
    const quoteMatch = /^>\s?(.*)$/.exec(line);
    if (quoteMatch) {
      flushParagraph(para, out);
      quote.push(quoteMatch[1] ?? '');
      continue;
    }
    flushBlockquote(quote, out);

    // Default → paragraph.
    para.push(line.trim());
  }

  // EOF flush.
  if (inCode) {
    out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  }
  flushParagraph(para, out);
  flushBlockquote(quote, out);
  flushList(list, out);

  return out.join('\n');
}

export function renderReleaseNotes(src: string): string {
  return looksLikeHtml(src) ? sanitizeHtml(src) : renderMarkdown(src);
}
