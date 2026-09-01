import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0018_remove_api_key_providers',
  up: `
    DELETE FROM provider_config
    WHERE id IN ('anthropic', 'openai', 'google', 'deepseek', 'xai');
    UPDATE provider_settings
    SET default_provider = NULL
    WHERE default_provider IN ('anthropic', 'openai', 'google', 'deepseek', 'xai');
  `,
};
