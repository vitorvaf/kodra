import { describe, expect, it } from 'vitest';
import { makeHandlerTestKit } from '../helpers/make-handlers.js';

describe('cost:today', () => {
  it('returns zero when no runs have cost yet', async () => {
    const { handlers } = makeHandlerTestKit();
    const result = await handlers['cost:today'](undefined);
    expect(result.totalUsd).toBe(0);
    expect(typeof result.since).toBe('string');
  });
});
