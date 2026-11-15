// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { SqliteIndexer } from '../src/storage/sqlite-indexer.js';
import { ResolvedManthanConfig, DEFAULT_CONFIG } from '../src/config/schema.js';

describe('Unit: SqliteIndexer Lifecycle, Glob Namespaces & Migrations', () => {
  let tempDir: string;
  let config: ResolvedManthanConfig;
  let indexer: SqliteIndexer;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manthan-sqlite-test-'));
    const dbPath = path.join(tempDir, 'index.db');
    config = {
      ...DEFAULT_CONFIG,
      workspace_root: tempDir,
      resolved_paths: {
        root_dir: path.join(tempDir, '.manthan/memory'),
        working_dir: path.join(tempDir, '.manthan/memory/working'),
        constitution_dir: path.join(tempDir, '.manthan/memory/constitution'),
        index_db_path: dbPath,
        config_file: path.join(tempDir, '.manthan.yaml'),
      },
    };
    indexer = new SqliteIndexer(config);
  });

  after(() => {
    indexer.close();
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore Windows temp file cleanup lock
    }
  });

  test('1. initSchema defensively migrates legacy v0.3.1 schema without data loss', () => {
    const legacyDbPath = path.join(tempDir, 'legacy.db');
    const legacyDb = new DatabaseSync(legacyDbPath);
    // Create legacy 13-column memories table
    legacyDb.exec(`
      CREATE TABLE memories (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        layer TEXT NOT NULL,
        namespace TEXT NOT NULL,
        status TEXT NOT NULL,
        author_agent TEXT NOT NULL,
        trace_id TEXT,
        supersedes TEXT,
        tags TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        file_path TEXT NOT NULL,
        git_commit_sha TEXT,
        content TEXT NOT NULL
      );
      INSERT INTO memories VALUES (
        'mem_legacy', 'Legacy Title', 'working', 'core', 'active', 'agent-old',
        NULL, NULL, '["legacy"]', '2026-01-01T00:00:00.000Z', '/path/legacy.md', 'sha123', 'Old content'
      );
    `);
    legacyDb.close();

    // Now open via SqliteIndexer with that dbPath
    const legacyConfig: ResolvedManthanConfig = {
      ...config,
      resolved_paths: { ...config.resolved_paths, index_db_path: legacyDbPath },
    };
    const legacyIndexer = new SqliteIndexer(legacyConfig);
    const db = legacyIndexer.getDatabase();

    const cols = db.prepare('PRAGMA table_info(memories)').all() as { name: string }[];
    const colNames = cols.map((c) => c.name);
    assert.ok(colNames.includes('stale_after'), 'stale_after column was added');
    assert.ok(colNames.includes('valid_until'), 'valid_until column was added');

    const row = db.prepare('SELECT * FROM memories WHERE id = ?').get('mem_legacy') as any;
    assert.strictEqual(row.title, 'Legacy Title');
    assert.strictEqual(row.stale_after, null);
    assert.strictEqual(row.valid_until, null);

    legacyIndexer.close();
  });

  test('2. Staleness Lifecycle: Excludes hard-expired memories by default and dampens soft-stale rank', () => {
    const now = new Date();
    const past2Days = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const past1Day = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const future2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();

    // Active memory
    indexer.indexMemory({
      frontmatter: {
        id: 'mem_fresh',
        title: 'Authentication Strategy Fresh',
        layer: 'working',
        namespace: 'auth',
        status: 'active',
        author_agent: 'agent',
        tags: ['auth'],
        updated_at: now.toISOString(),
      },
      content: 'Fresh authentication specs',
      file_path: 'auth/fresh.md',
    });

    // Soft-stale memory (stale_after in past, but valid_until in future)
    indexer.indexMemory({
      frontmatter: {
        id: 'mem_soft_stale',
        title: 'Authentication Strategy Soft Stale',
        layer: 'working',
        namespace: 'auth',
        status: 'active',
        author_agent: 'agent',
        tags: ['auth'],
        updated_at: past2Days,
        stale_after: past1Day,
        valid_until: future2Days,
      },
      content: 'Soft stale authentication specs',
      file_path: 'auth/soft.md',
    });

    // Hard-expired memory (valid_until in past)
    indexer.indexMemory({
      frontmatter: {
        id: 'mem_hard_expired',
        title: 'Authentication Strategy Hard Expired',
        layer: 'working',
        namespace: 'auth',
        status: 'active',
        author_agent: 'agent',
        tags: ['auth'],
        updated_at: past2Days,
        stale_after: past2Days,
        valid_until: past1Day,
      },
      content: 'Hard expired authentication specs',
      file_path: 'auth/hard.md',
    });

    // Constitutional rule (immune to staleness even with past timestamps)
    indexer.indexMemory({
      frontmatter: {
        id: 'mem_const_rule',
        title: 'Authentication Constitution Rule',
        layer: 'constitution',
        namespace: 'architecture/adr',
        status: 'active',
        author_agent: 'governance',
        tags: ['auth'],
        updated_at: past2Days,
        valid_until: past1Day, // immune
      },
      content: 'Constitutional rule on authentication',
      file_path: 'constitution/rule.md',
    });

    // 1. Default search: hard expired excluded, constitution preserved
    const resDefault = indexer.search({ query: 'Authentication' });
    assert.strictEqual(resDefault.stale_excluded_count, 1, 'stale_excluded_count is 1');
    assert.strictEqual(resDefault.constitution_rules.length, 1);
    assert.strictEqual(resDefault.constitution_rules[0].id, 'mem_const_rule');

    const workingIds = resDefault.working_memories.map((m) => m.id);
    assert.ok(workingIds.includes('mem_fresh'));
    assert.ok(workingIds.includes('mem_soft_stale'));
    assert.ok(!workingIds.includes('mem_hard_expired'), 'Hard expired must be excluded by default');

    // Verify ordering: fresh memory comes before soft stale memory
    assert.strictEqual(workingIds[0], 'mem_fresh');
    assert.strictEqual(workingIds[1], 'mem_soft_stale');
    const softResult = resDefault.working_memories.find((m) => m.id === 'mem_soft_stale');
    assert.strictEqual(softResult?.is_stale, true);
    assert.strictEqual(softResult?.is_expired, false);

    // 2. Search with include_stale: true -> includes hard-expired memory
    const resIncludeStale = indexer.search({ query: 'Authentication', include_stale: true });
    assert.strictEqual(resIncludeStale.stale_excluded_count, 0);
    const allWorkingIds = resIncludeStale.working_memories.map((m) => m.id);
    assert.ok(allWorkingIds.includes('mem_hard_expired'));
    const hardResult = resIncludeStale.working_memories.find((m) => m.id === 'mem_hard_expired');
    assert.strictEqual(hardResult?.is_stale, true);
    assert.strictEqual(hardResult?.is_expired, true);
  });

  test('3. Glob Namespaces: Supports single-segment * and recursive ** patterns', () => {
    indexer.indexMemory({
      frontmatter: {
        id: 'mem_api',
        title: 'Backend API Service',
        layer: 'working',
        namespace: 'backend/api',
        status: 'active',
        author_agent: 'agent',
        tags: ['api'],
        updated_at: new Date().toISOString(),
      },
      content: 'API documentation',
      file_path: 'backend/api.md',
    });

    indexer.indexMemory({
      frontmatter: {
        id: 'mem_api_v1',
        title: 'Backend API v1 Endpoint',
        layer: 'working',
        namespace: 'backend/api/v1',
        status: 'active',
        author_agent: 'agent',
        tags: ['api'],
        updated_at: new Date().toISOString(),
      },
      content: 'v1 endpoints',
      file_path: 'backend/api/v1.md',
    });

    indexer.indexMemory({
      frontmatter: {
        id: 'mem_ui',
        title: 'Frontend UI Widget',
        layer: 'working',
        namespace: 'frontend/ui',
        status: 'active',
        author_agent: 'agent',
        tags: ['ui'],
        updated_at: new Date().toISOString(),
      },
      content: 'UI widget',
      file_path: 'frontend/ui.md',
    });

    // Single-segment wildcard: 'backend/*' matches 'backend/api', NOT 'backend/api/v1'
    const resSingle = indexer.search({ namespace: 'backend/*' });
    const singleIds = resSingle.working_memories.map((m) => m.id);
    assert.ok(singleIds.includes('mem_api'));
    assert.ok(!singleIds.includes('mem_api_v1'));
    assert.ok(!singleIds.includes('mem_ui'));

    // Recursive wildcard: 'backend/**' matches both
    const resRecursive = indexer.search({ namespace: 'backend/**' });
    const recIds = resRecursive.working_memories.map((m) => m.id);
    assert.ok(recIds.includes('mem_api'));
    assert.ok(recIds.includes('mem_api_v1'));
    assert.ok(!recIds.includes('mem_ui'));
  });

  test('4. getNamespaceHierarchy returns structured nested tree with cumulative rollups', () => {
    const tree = indexer.getNamespaceHierarchy();
    assert.strictEqual(tree.name, 'root');
    assert.strictEqual(tree.path, '');
    assert.ok(tree.total_count > 0);

    const backendNode = tree.children.find((c) => c.name === 'backend');
    assert.ok(backendNode, 'backend namespace node exists');
    assert.strictEqual(backendNode.path, 'backend');
    assert.ok(backendNode.total_count >= 2);

    const apiNode = backendNode.children.find((c) => c.name === 'api');
    assert.ok(apiNode, 'backend/api node exists');
    assert.strictEqual(apiNode.path, 'backend/api');
  });
});
