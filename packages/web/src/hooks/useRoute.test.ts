import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseIssueRef } from '@kanbots/core';

// useRoute reads window.location at module scope inside its helpers, so give
// the node test environment a minimal window before importing the module.
interface FakeWindow {
  location: { hash: string };
  addEventListener: () => void;
  removeEventListener: () => void;
}

const fakeWindow: FakeWindow = {
  location: { hash: '' },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

beforeEach(() => {
  fakeWindow.location.hash = '';
  vi.stubGlobal('window', fakeWindow);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hrefFor', () => {
  it('builds hash routes for the board and for issues', async () => {
    const { hrefFor } = await import('./useRoute.js');
    expect(hrefFor({ name: 'board' })).toBe('#/');
    expect(hrefFor({ name: 'issue', number: parseIssueRef('42') })).toBe('#/issue/42');
    expect(hrefFor({ name: 'issue', number: parseIssueRef('FEAT-7') })).toBe('#/issue/FEAT-7');
  });
});

describe('navigate', () => {
  it('writes the route into the location hash', async () => {
    const { navigate } = await import('./useRoute.js');
    navigate({ name: 'issue', number: parseIssueRef('12') });
    expect(fakeWindow.location.hash).toBe('/issue/12');
    navigate({ name: 'board' });
    expect(fakeWindow.location.hash).toBe('/');
  });
});
