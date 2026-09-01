import { describe, expect, it } from 'vitest';
import {
  AGENT_LABELS,
  ALL_KANBOTS_LABELS,
  STATUS_LABELS,
  agentFromLabels,
  statusFromLabels,
  withAgentLabel,
  withStatusLabel,
} from '../src/labels.js';

describe('labels', () => {
  it('exposes all status labels', () => {
    const keys = Object.keys(STATUS_LABELS);
    expect(keys).toEqual(['backlog', 'todo', 'inProgress', 'review', 'done']);
  });

  it('exposes all agent labels', () => {
    const keys = Object.keys(AGENT_LABELS);
    expect(keys).toEqual(['idle', 'queued', 'running', 'blocked', 'review', 'failed']);
  });

  it('extracts status from a label list', () => {
    expect(statusFromLabels(['status:in-progress', 'bug'])).toBe('inProgress');
    expect(statusFromLabels(['bug'])).toBeNull();
    expect(statusFromLabels([])).toBeNull();
  });

  it('extracts agent from a label list', () => {
    expect(agentFromLabels(['agent:running', 'priority:high'])).toBe('running');
    expect(agentFromLabels([])).toBeNull();
  });

  it('returns first match if multiple status labels are present', () => {
    expect(statusFromLabels(['status:done', 'status:todo'])).toBe('todo');
  });

  it('ALL_KANBOTS_LABELS contains 11 entries', () => {
    expect(ALL_KANBOTS_LABELS).toHaveLength(11);
  });

  it('all labels have valid 6-char hex colors', () => {
    for (const label of ALL_KANBOTS_LABELS) {
      expect(label.color).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it('withStatusLabel replaces existing status label', () => {
    const next = withStatusLabel(['bug', 'status:todo'], 'inProgress');
    expect(next).toContain('status:in-progress');
    expect(next).not.toContain('status:todo');
    expect(next).toContain('bug');
  });

  it('withAgentLabel replaces existing agent label', () => {
    const next = withAgentLabel(['priority:high', 'agent:idle'], 'running');
    expect(next).toContain('agent:running');
    expect(next).not.toContain('agent:idle');
    expect(next).toContain('priority:high');
  });

  it('withStatusLabel adds when no status present', () => {
    const next = withStatusLabel(['bug'], 'todo');
    expect(next).toEqual(['bug', 'status:todo']);
  });
});
