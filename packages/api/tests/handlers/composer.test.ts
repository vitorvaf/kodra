import { describe, expect, it } from 'vitest';
import { makeHandlerTestKit } from '../helpers/make-handlers.js';

describe('composer:draft', () => {
  it('returns the drafted issue from the injected drafter', async () => {
    const { handlers } = makeHandlerTestKit();
    const result = await handlers['composer:draft']({
      description: 'add an audit trail',
    });
    expect(result.title).toMatch(/drafted/i);
    expect(result.body).toContain('add an audit trail');
  });

  it('rejects empty descriptions via validation', async () => {
    const { handlers } = makeHandlerTestKit();
    await expect(
      handlers['composer:draft']({ description: '' }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });
});
