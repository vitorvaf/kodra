import { describe, expect, it } from 'vitest';
import { classifyPastedFile, resolveUploadContentType } from './attachments.js';

describe('pasted attachment helpers', () => {
  it('classifies image MIME types as images', () => {
    const file = { type: 'image/png', name: 'screenshot.png' };
    expect(classifyPastedFile(file)).toBe('image');
    expect(resolveUploadContentType(file)).toBe('image/png');
  });

  it('classifies supported data MIME types as data', () => {
    const file = { type: 'application/json', name: 'data.json' };
    expect(classifyPastedFile(file)).toBe('data');
    expect(resolveUploadContentType(file)).toBe('application/json');
  });

  it('sniffs JSON from a file extension when MIME is empty', () => {
    const file = { type: '', name: 'nfe.json' };
    expect(classifyPastedFile(file)).toBe('data');
    expect(resolveUploadContentType(file)).toBe('application/json');
  });

  it('rejects unsupported empty-MIME extensions', () => {
    const file = { type: '', name: 'dados.dat' };
    expect(classifyPastedFile(file)).toBeNull();
    expect(resolveUploadContentType(file)).toBeNull();
  });
});
