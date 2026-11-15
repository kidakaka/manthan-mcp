// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import {
  GovernanceConfigSchema,
  MemoryFrontmatterSchema,
  normalizeMemoryFrontmatter,
} from '../src/config/schema.js';

describe('Unit: Configuration & Schema Extensions (v0.4.0)', () => {
  test('1. GovernanceConfigSchema provides expected v0.4.0 defaults', () => {
    const config = GovernanceConfigSchema.parse({});
    assert.strictEqual(config.tag_policy, 'warn');
    assert.strictEqual(config.secret_scanning, true);
    assert.strictEqual(config.allowed_tags, undefined);
  });

  test('2. GovernanceConfigSchema parses custom taxonomy and policy', () => {
    const config = GovernanceConfigSchema.parse({
      allowed_tags: ['auth', 'database', 'frontend'],
      tag_policy: 'strict',
      secret_scanning: false,
    });
    assert.deepStrictEqual(config.allowed_tags, ['auth', 'database', 'frontend']);
    assert.strictEqual(config.tag_policy, 'strict');
    assert.strictEqual(config.secret_scanning, false);
  });

  test('3. MemoryFrontmatterSchema accepts valid stale_after and valid_until', () => {
    const data = {
      id: 'mem_1',
      title: 'Valid TTL',
      layer: 'working',
      namespace: 'test',
      status: 'active',
      author_agent: 'agent-1',
      tags: ['test'],
      updated_at: '2026-11-15T10:00:00.000Z',
      stale_after: '2026-11-16T00:00:00.000Z',
      valid_until: '2026-11-20T00:00:00.000Z',
    };
    const parsed = MemoryFrontmatterSchema.parse(data);
    assert.strictEqual(parsed.stale_after, '2026-11-16T00:00:00.000Z');
    assert.strictEqual(parsed.valid_until, '2026-11-20T00:00:00.000Z');
  });

  test('4. MemoryFrontmatterSchema rejects stale_after > valid_until', () => {
    const data = {
      id: 'mem_1',
      title: 'Invalid TTL',
      layer: 'working',
      namespace: 'test',
      status: 'active',
      author_agent: 'agent-1',
      tags: ['test'],
      updated_at: '2026-11-15T10:00:00.000Z',
      stale_after: '2026-11-25T00:00:00.000Z',
      valid_until: '2026-11-20T00:00:00.000Z',
    };
    assert.throws(() => {
      MemoryFrontmatterSchema.parse(data);
    }, /stale_after must be earlier than or equal to valid_until/);
  });

  test('5. normalizeMemoryFrontmatter handles safe ISO parsing and null fallbacks', () => {
    const raw = {
      id: 'mem_test',
      title: 'Test',
      stale_after: '2026-11-16T12:00:00.000Z',
      valid_until: 'invalid-date',
    };
    const normalized = normalizeMemoryFrontmatter(raw, '/tmp/test.md');
    assert.strictEqual(normalized.stale_after, '2026-11-16T12:00:00.000Z');
    assert.strictEqual(normalized.valid_until, null);
  });
});
