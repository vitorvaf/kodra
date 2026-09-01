import type { Migration } from './types.js';

export const migration: Migration = {
  id: '0015_thread_last_model',
  up: `
    ALTER TABLE threads ADD COLUMN last_provider TEXT;
    ALTER TABLE threads ADD COLUMN last_model TEXT;
  `,
};
