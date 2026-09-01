import { describe, expect, it } from 'vitest';
import { makeHandlerTestKit } from '../helpers/make-handlers.js';

describe('workspace:get', () => {
  it('returns a workspace tied to the configured repo', async () => {
    const { handlers } = makeHandlerTestKit({ owner: 'octo', repo: 'hello' });
    const result = await handlers['workspace:get'](undefined);
    expect(result).toHaveProperty('id');
    expect(result.name).toBeTruthy();
  });
});

describe('folders:list', () => {
  it('returns an empty list initially', async () => {
    const { handlers } = makeHandlerTestKit();
    expect(await handlers['folders:list'](undefined)).toEqual([]);
  });
});
