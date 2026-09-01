import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { renderMarkdown } from '../../lib/markdown.js';

/**
 * A textarea wrapped with a markdown toolbar, keyboard shortcuts, and an
 * inline preview toggle. The textarea is the source of truth — `value` is
 * always plain markdown text.
 */
export interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  /** When true, the toolbar + preview toggle render. */
  showToolbar?: boolean;
  /** Auto-focus on mount. */
  autoFocus?: boolean;
  /** Optional id for label `htmlFor` wiring. */
  id?: string;
  /** Optional aria-label for the textarea. */
  ariaLabel?: string;
  /** Forwarded to the underlying textarea for paste handling. */
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  /** Class to apply to the outer wrapper. */
  className?: string;
  /** Inline style for the outer wrapper. */
  style?: CSSProperties;
  /** Inline style for the textarea — useful for resize / font tweaks. */
  textareaStyle?: CSSProperties;
  /** Visual label that appears at the top of the preview pane. */
  previewLabel?: string;
  /** Optional helper rendered below the toolbar (e.g. byte counter). */
  footer?: ReactNode;
  /** When true the editor renders without a border / chrome — for places
   *  where the field is inside an existing labelled container. */
  flat?: boolean;
}

export interface MarkdownEditorHandle {
  focus(): void;
  /** Imperative access to the textarea, e.g. for selection / paste handling. */
  getTextarea(): HTMLTextAreaElement | null;
}

interface WrapOpts {
  before: string;
  after: string;
  /** Placeholder used when the selection is empty. */
  placeholder?: string;
}

interface LineOpts {
  prefix: string;
  /** When set, toggles the prefix on/off for each affected line. */
  toggle?: boolean;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(props, ref) {
    const {
      value,
      onChange,
      placeholder,
      rows = 12,
      disabled = false,
      showToolbar = true,
      autoFocus = false,
      id,
      ariaLabel,
      onPaste,
      className,
      style,
      textareaStyle,
      previewLabel,
      footer,
      flat = false,
    } = props;

    const taRef = useRef<HTMLTextAreaElement | null>(null);
    const [previewing, setPreviewing] = useState(false);

    useImperativeHandle(
      ref,
      () => ({
        focus(): void {
          taRef.current?.focus();
        },
        getTextarea(): HTMLTextAreaElement | null {
          return taRef.current;
        },
      }),
      [],
    );

    /**
     * Replace the current selection with `next`, then place the caret /
     * selection between `selStart` and `selEnd` (positions are relative to
     * the new full value, not the inserted slice).
     */
    const applyEdit = useCallback(
      (range: { start: number; end: number }, next: string, selStart: number, selEnd: number): void => {
        const ta = taRef.current;
        if (!ta) return;
        const before = ta.value.slice(0, range.start);
        const after = ta.value.slice(range.end);
        const merged = before + next + after;
        onChange(merged);
        // Restore selection after React has committed the new value.
        queueMicrotask(() => {
          const el = taRef.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(selStart, selEnd);
        });
      },
      [onChange],
    );

    const wrap = useCallback(
      (opts: WrapOpts): void => {
        const ta = taRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const selected = ta.value.slice(start, end);
        const inner = selected.length > 0 ? selected : (opts.placeholder ?? '');
        const next = `${opts.before}${inner}${opts.after}`;
        const innerStart = start + opts.before.length;
        const innerEnd = innerStart + inner.length;
        applyEdit({ start, end }, next, innerStart, innerEnd);
      },
      [applyEdit],
    );

    const wrapLines = useCallback(
      (opts: LineOpts): void => {
        const ta = taRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const v = ta.value;
        // Expand the range to cover the start of the first selected line and
        // the end of the last selected line.
        const lineStart = v.lastIndexOf('\n', start - 1) + 1;
        const lineEndIdx = v.indexOf('\n', end);
        const lineEnd = lineEndIdx === -1 ? v.length : lineEndIdx;
        const block = v.slice(lineStart, lineEnd);
        const lines = block.split('\n');
        const allPrefixed = opts.toggle && lines.every((l) => l.startsWith(opts.prefix));
        const next = lines
          .map((line) => (allPrefixed ? line.slice(opts.prefix.length) : `${opts.prefix}${line}`))
          .join('\n');
        applyEdit({ start: lineStart, end: lineEnd }, next, lineStart, lineStart + next.length);
      },
      [applyEdit],
    );

    const insertOrdered = useCallback((): void => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const v = ta.value;
      const lineStart = v.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = v.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? v.length : lineEndIdx;
      const block = v.slice(lineStart, lineEnd);
      const lines = block.split('\n');
      const numbered = lines.map((line, i) => `${i + 1}. ${line.replace(/^\d+\.\s*/, '')}`).join('\n');
      applyEdit({ start: lineStart, end: lineEnd }, numbered, lineStart, lineStart + numbered.length);
    }, [applyEdit]);

    const insertHeading = useCallback(
      (level: 2 | 3): void => {
        const ta = taRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const v = ta.value;
        const lineStart = v.lastIndexOf('\n', start - 1) + 1;
        const lineEndIdx = v.indexOf('\n', end);
        const lineEnd = lineEndIdx === -1 ? v.length : lineEndIdx;
        const block = v.slice(lineStart, lineEnd);
        const marker = '#'.repeat(level);
        // Strip an existing heading marker if present, then either apply the
        // new one or leave the line bare (toggle-off when already at level).
        const stripped = block.replace(/^#{1,6}\s+/, '');
        const next = block.startsWith(`${marker} `) ? stripped : `${marker} ${stripped}`;
        applyEdit(
          { start: lineStart, end: lineEnd },
          next,
          lineStart,
          lineStart + next.length,
        );
      },
      [applyEdit],
    );

    const insertLink = useCallback((): void => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = ta.value.slice(start, end);
      if (selected.length === 0) {
        const next = `[text](url)`;
        applyEdit({ start, end }, next, start + 1, start + 5);
      } else {
        const next = `[${selected}](url)`;
        // Caret lands on "url" so the user can type the destination.
        const urlStart = start + selected.length + 3;
        applyEdit({ start, end }, next, urlStart, urlStart + 3);
      }
    }, [applyEdit]);

    const insertImage = useCallback((): void => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = ta.value.slice(start, end);
      const alt = selected.length > 0 ? selected : 'alt text';
      const next = `![${alt}](url)`;
      const urlStart = start + alt.length + 4;
      applyEdit({ start, end }, next, urlStart, urlStart + 3);
    }, [applyEdit]);

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
      if (previewing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod) {
        const k = e.key.toLowerCase();
        if (k === 'b') {
          e.preventDefault();
          wrap({ before: '**', after: '**', placeholder: 'bold' });
          return;
        }
        if (k === 'i') {
          e.preventDefault();
          wrap({ before: '*', after: '*', placeholder: 'italic' });
          return;
        }
        if (k === 'k') {
          e.preventDefault();
          const ta = taRef.current;
          const hasSelection =
            ta !== null && ta.selectionStart !== ta.selectionEnd;
          if (hasSelection) insertLink();
          else wrap({ before: '`', after: '`', placeholder: 'code' });
          return;
        }
        if (k === 'l') {
          e.preventDefault();
          wrapLines({ prefix: '- ', toggle: true });
          return;
        }
        if (k === 'p') {
          e.preventDefault();
          setPreviewing((v) => !v);
          return;
        }
      }
    }

    function handleChange(e: ChangeEvent<HTMLTextAreaElement>): void {
      onChange(e.target.value);
    }

    const html = useMemo(() => (previewing ? renderMarkdown(value) : ''), [previewing, value]);

    const rootClass = ['kb-md-editor', flat ? 'is-flat' : '', className ?? '']
      .filter(Boolean)
      .join(' ');

    return (
      <div className={rootClass} style={style}>
        {showToolbar && (
          <div className="kb-md-toolbar" role="toolbar" aria-label="Formatting">
            <ToolbarBtn
              title="Bold (Cmd+B)"
              onClick={() => wrap({ before: '**', after: '**', placeholder: 'bold' })}
              disabled={disabled || previewing}
            >
              <span style={{ fontWeight: 700 }}>B</span>
            </ToolbarBtn>
            <ToolbarBtn
              title="Italic (Cmd+I)"
              onClick={() => wrap({ before: '*', after: '*', placeholder: 'italic' })}
              disabled={disabled || previewing}
            >
              <span style={{ fontStyle: 'italic', fontFamily: 'var(--ff-serif)' }}>I</span>
            </ToolbarBtn>
            <ToolbarBtn
              title="Inline code (Cmd+K)"
              onClick={() => wrap({ before: '`', after: '`', placeholder: 'code' })}
              disabled={disabled || previewing}
            >
              <span style={{ fontFamily: 'var(--ff-mono)' }}>{'</>'}</span>
            </ToolbarBtn>
            <span className="kb-md-sep" aria-hidden />
            <ToolbarBtn
              title="Heading 2"
              onClick={() => insertHeading(2)}
              disabled={disabled || previewing}
            >
              H2
            </ToolbarBtn>
            <ToolbarBtn
              title="Heading 3"
              onClick={() => insertHeading(3)}
              disabled={disabled || previewing}
            >
              H3
            </ToolbarBtn>
            <span className="kb-md-sep" aria-hidden />
            <ToolbarBtn
              title="Bulleted list (Cmd+L)"
              onClick={() => wrapLines({ prefix: '- ', toggle: true })}
              disabled={disabled || previewing}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                <circle cx="3" cy="4" r="1" fill="currentColor" />
                <circle cx="3" cy="8" r="1" fill="currentColor" />
                <circle cx="3" cy="12" r="1" fill="currentColor" />
                <rect x="6" y="3.4" width="8" height="1.2" fill="currentColor" />
                <rect x="6" y="7.4" width="8" height="1.2" fill="currentColor" />
                <rect x="6" y="11.4" width="8" height="1.2" fill="currentColor" />
              </svg>
            </ToolbarBtn>
            <ToolbarBtn
              title="Numbered list"
              onClick={insertOrdered}
              disabled={disabled || previewing}
            >
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10 }}>1.</span>
            </ToolbarBtn>
            <ToolbarBtn
              title="Block quote"
              onClick={() => wrapLines({ prefix: '> ', toggle: true })}
              disabled={disabled || previewing}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                <rect x="2" y="2" width="2" height="12" fill="currentColor" />
                <rect x="6" y="3.4" width="8" height="1.2" fill="currentColor" opacity="0.6" />
                <rect x="6" y="7.4" width="8" height="1.2" fill="currentColor" opacity="0.6" />
                <rect x="6" y="11.4" width="6" height="1.2" fill="currentColor" opacity="0.6" />
              </svg>
            </ToolbarBtn>
            <span className="kb-md-sep" aria-hidden />
            <ToolbarBtn
              title="Link (Cmd+K with selection)"
              onClick={insertLink}
              disabled={disabled || previewing}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                <path
                  d="M6.5 4.5 L4.5 4.5 A3 3 0 0 0 4.5 10.5 L6.5 10.5 M9.5 4.5 L11.5 4.5 A3 3 0 0 1 11.5 10.5 L9.5 10.5 M5.5 7.5 L10.5 7.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </ToolbarBtn>
            <ToolbarBtn
              title="Insert image (uses ![alt](url) placeholder)"
              onClick={insertImage}
              disabled={disabled || previewing}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
                <circle cx="6" cy="7" r="1.2" fill="currentColor" />
                <path d="M2.6 12.4 L6.5 8.5 L9.5 11 L11.5 9 L13.4 11" stroke="currentColor" strokeWidth="1.3" fill="none" />
              </svg>
            </ToolbarBtn>
            <span className="grow" />
            <button
              type="button"
              className={`kb-md-preview-toggle${previewing ? ' on' : ''}`}
              onClick={() => setPreviewing((v) => !v)}
              title="Toggle preview (Cmd+P)"
              disabled={disabled}
            >
              {previewing ? 'Edit' : 'Preview'}
            </button>
          </div>
        )}
        {previewing ? (
          <div className="kb-md-preview" aria-live="polite">
            {previewLabel ? <div className="kb-md-preview-label">{previewLabel}</div> : null}
            {value.trim().length === 0 ? (
              <div className="kb-md-preview-empty">Nothing to preview yet.</div>
            ) : (
              <div className="kb-md-preview-body" dangerouslySetInnerHTML={{ __html: html }} />
            )}
          </div>
        ) : (
          <textarea
            ref={taRef}
            id={id}
            aria-label={ariaLabel}
            className="kb-md-textarea"
            value={value}
            placeholder={placeholder}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            rows={rows}
            disabled={disabled}
            spellCheck
            autoFocus={autoFocus}
            style={textareaStyle}
            {...(onPaste !== undefined ? { onPaste } : {})}
          />
        )}
        {footer ? <div className="kb-md-footer">{footer}</div> : null}
      </div>
    );
  },
);

interface ToolbarBtnProps {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

function ToolbarBtn({ title, onClick, disabled, children }: ToolbarBtnProps) {
  return (
    <button
      type="button"
      className="kb-md-tb-btn"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      // Prevent the textarea from losing selection when the toolbar button
      // is pressed — keep the caret + selection where the user left it.
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}
