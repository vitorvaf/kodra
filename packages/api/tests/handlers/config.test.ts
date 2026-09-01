import { describe, expect, it } from 'vitest';
import { makeHandlerTestKit } from '../helpers/make-handlers.js';

describe('config:get', () => {
  it('returns the configured owner / repo', async () => {
    const { handlers } = makeHandlerTestKit({ owner: 'octo', repo: 'hello' });
    const result = await handlers['config:get'](undefined);
    expect(result.owner).toBe('octo');
    expect(result.repo).toBe('hello');
  });
});
