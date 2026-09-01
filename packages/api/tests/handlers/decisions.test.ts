import { describe, expect, it } from 'vitest';
import { makeHandlerTestKit } from '../helpers/make-handlers.js';

describe('decisions:pending', () => {
  it('returns an empty list when no decisions are pending', async () => {
    const { handlers } = makeHandlerTestKit();
    expect(await handlers['decisions:pending'](undefined)).toEqual([]);
  });
});
