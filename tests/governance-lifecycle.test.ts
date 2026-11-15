// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MarkdownStore } from '../src/storage/markdown-store.js';
import { GitEngine } from '../src/storage/git-engine.js';
import { SqliteIndexer } from '../src/storage/sqlite-indexer.js';
import { ResolvedManthanConfig, DEFAULT_CONFIG } from '../src/config/schema.js';
import { registerCommitMemoryTool } from '../src/tools/commit-memory.js';
import { registerRecallMemoryTool } from '../src/tools/recall-memory.js';
import { registerProposeRuleTool } from '../src/tools/propose-rule.js';
import { registerManthanResources } from '../src/resources/index.js';

describe('Integration: Manthan v0.4.0 Governance, Lifecycle & Glob Namespaces', () => {
  let tempDir: string;
  let config: ResolvedManthanConfig;
  let store: MarkdownStore;
  let git: GitEngine;
  let indexer: SqliteIndexer;
  let server: McpServer;
  let toolHandlers: Map<string, Function>;
  let resourceHandlers: Map<string, Function>;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manthan-v040-test-'));
    const dbPath = path.join(tempDir, 'index.db');

    config = {
      ...DEFAULT_CONFIG,
      workspace_root: tempDir,
      governance: {
        prioritize_constitution_on_recall: true,
        allow_direct_constitution_writes: false,
        allowed_tags: ['database', 'auth', 'billing', 'api'],
        tag_policy: 'warn',
        secret_scanning: true,
      },
      resolved_paths: {
        root_dir: path.join(tempDir, '.manthan/memory'),
        working_dir: path.join(tempDir, '.manthan/memory/working'),
        constitution_dir: path.join(tempDir, '.manthan/memory/constitution'),
        index_db_path: dbPath,
        config_file: path.join(tempDir, '.manthan.yaml'),
      },
    };

    fs.mkdirSync(config.resolved_paths.working_dir, { recursive: true });
    fs.mkdirSync(config.resolved_paths.constitution_dir, { recursive: true });

    store = new MarkdownStore(config);
    git = new GitEngine(tempDir);
    await git.initRepo();
    store.ensureDirectories();
    indexer = new SqliteIndexer(config);

    toolHandlers = new Map();
    resourceHandlers = new Map();

    server = new McpServer({ name: 'manthan-test', version: '0.4.0' });

    // Mock registerTool / tool capturing handlers
    const s = server as any;
    s.registerTool = (name: string, meta: any, handler: Function) => {
      toolHandlers.set(name, handler);
    };
    s.tool = (name: string, desc: string, schema: any, handler: Function) => {
      toolHandlers.set(name, handler);
    };
    s.registerResource = (name: string, uri: string, meta: any, handler: Function) => {
      resourceHandlers.set(uri, handler);
    };
    s.resource = (name: string, uri: string, meta: any, handler: Function) => {
      resourceHandlers.set(uri, handler);
    };

    registerCommitMemoryTool(server, config, store, git, indexer);
    registerRecallMemoryTool(server, indexer);
    registerProposeRuleTool(server, config, store, git, indexer);
    registerManthanResources(server, config, store, indexer, git);
  });

  after(() => {
    indexer.close();
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore lock on tempDir
    }
  });

  test('1. commit_memory intercepts secrets and provides allow_secrets bypass', async () => {
    const commitFn = toolHandlers.get('commit_memory')!;
    assert.ok(commitFn, 'commit_memory tool registered');

    // Attempt to commit AWS access key without allow_secrets
    const blockedRes = await commitFn({
      namespace: 'backend/auth',
      title: 'AWS Config Notes',
      content: 'Production key is AKIAIOSFODNN7EXAMPLE',
      author_agent: 'agent-1',
    });

    assert.strictEqual(blockedRes.isError, true);
    assert.ok(blockedRes.content[0].text.includes('Pre-commit secret validation failed'));
    assert.ok(blockedRes.content[0].text.includes('AWS Access Key'));
    assert.ok(!blockedRes.content[0].text.includes('AKIAIOSFODNN7EXAMPLE'), 'Must mask secret');

    // Submit with allow_secrets: true -> succeeds
    const allowedRes = await commitFn({
      namespace: 'backend/auth',
      title: 'AWS Config Mock',
      content: 'Fixture key is AKIAIOSFODNN7EXAMPLE',
      author_agent: 'agent-1',
      allow_secrets: true,
    });

    assert.ok(!allowedRes.isError);
    const parsed = JSON.parse(allowedRes.content[0].text);
    assert.strictEqual(parsed.title, 'AWS Config Mock');
  });

  test('2. commit_memory normalizes tags and enforces tag_policy', async () => {
    const commitFn = toolHandlers.get('commit_memory')!;

    // 1. Policy is 'warn': 'databaes' mapped to 'database', unknown tag 'randomxyz' warned
    const warnRes = await commitFn({
      namespace: 'backend/db',
      title: 'Database Architecture',
      content: 'PostgreSQL setup',
      author_agent: 'agent-1',
      tags: ['databaes', 'randomxyz'],
    });

    assert.ok(!warnRes.isError);
    const parsedWarn = JSON.parse(warnRes.content[0].text);
    assert.ok(parsedWarn.tag_mappings.some((m: any) => m.original === 'databaes' && m.mapped === 'database'));
    assert.ok(parsedWarn.tag_warnings?.length > 0);

    // 2. Change policy to 'strict': unmapped tag triggers error
    const strictConfig: ResolvedManthanConfig = {
      ...config,
      governance: {
        ...config.governance,
        tag_policy: 'strict',
      },
    };
    registerCommitMemoryTool(server, strictConfig, store, git, indexer);
    const strictCommitFn = toolHandlers.get('commit_memory')!;

    const strictRes = await strictCommitFn({
      namespace: 'backend/db',
      title: 'Database Architecture Strict',
      content: 'PostgreSQL setup',
      author_agent: 'agent-1',
      tags: ['unrecognizedtag'],
    });

    assert.strictEqual(strictRes.isError, true);
    assert.ok(strictRes.content[0].text.includes('Tag policy strict violation'));

    // Reset back to warn
    registerCommitMemoryTool(server, config, store, git, indexer);
  });

  test('3. propose_constitution_rule intercepts secrets across all fields', async () => {
    const proposeFn = toolHandlers.get('propose_constitution_rule')!;
    assert.ok(proposeFn, 'propose_constitution_rule tool registered');

    // Attempt secret in rationale
    const blocked = await proposeFn({
      title: 'Rule On Keys',
      content: 'Do not commit keys',
      namespace: 'security/keys',
      rationale: 'Secret leak example sk-proj-12345678901234567890',
      author_agent: 'agent-1',
    });

    assert.strictEqual(blocked.isError, true);
    assert.ok(blocked.content[0].text.includes('Pre-commit secret validation failed'));
    assert.ok(blocked.content[0].text.includes('AI API Key'));

    // Bypass with allow_secrets: true
    const allowed = await proposeFn({
      title: 'Rule On Keys Allowed',
      content: 'Do not commit keys',
      namespace: 'security/keys',
      rationale: 'Fixture example sk-proj-12345678901234567890',
      author_agent: 'agent-1',
      allow_secrets: true,
    });

    assert.ok(!allowed.isError);
  });

  test('4. recall_memory supports include_stale and glob namespaces', async () => {
    const commitFn = toolHandlers.get('commit_memory')!;
    const recallFn = toolHandlers.get('recall_memory')!;

    const now = new Date();
    const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // Commit an expired memory
    await commitFn({
      namespace: 'services/billing',
      title: 'Billing Temporary Cache Token',
      content: 'Temporary cache key info',
      author_agent: 'agent-1',
      valid_until: pastDate,
    });

    // Commit an active memory
    await commitFn({
      namespace: 'services/billing/v2',
      title: 'Billing Permanent Architecture',
      content: 'Billing gateway design',
      author_agent: 'agent-1',
      valid_until: futureDate,
    });

    // 1. Recall without include_stale (default: false)
    const resDefault = await recallFn({
      query: 'Billing',
      namespace: 'services/**',
    });
    const parsedDefault = JSON.parse(resDefault.content[0].text);
    assert.strictEqual(parsedDefault.stale_excluded_count, 1);
    assert.strictEqual(parsedDefault.working_memories.length, 1);
    assert.strictEqual(parsedDefault.working_memories[0].title, 'Billing Permanent Architecture');
    // Content immutability verification: content remains pure without prepended banners
    assert.strictEqual(parsedDefault.working_memories[0].content, 'Billing gateway design');

    // 2. Recall with include_stale: true
    const resStale = await recallFn({
      query: 'Billing',
      namespace: 'services/**',
      include_stale: true,
    });
    const parsedStale = JSON.parse(resStale.content[0].text);
    assert.strictEqual(parsedStale.stale_excluded_count, 0);
    assert.strictEqual(parsedStale.working_memories.length, 2);
  });

  test('5. Native Resource: manthan://namespaces returns structured tree', async () => {
    const namespacesHandler = resourceHandlers.get('manthan://namespaces')!;
    assert.ok(namespacesHandler, 'manthan://namespaces resource registered');

    const res = await namespacesHandler(new URL('manthan://namespaces'));
    assert.strictEqual(res.contents[0].mimeType, 'application/json');

    const tree = JSON.parse(res.contents[0].text);
    assert.strictEqual(tree.name, 'root');
    assert.ok(tree.total_count > 0);

    const servicesNode = tree.children.find((c: any) => c.name === 'services');
    assert.ok(servicesNode, 'services node exists in tree');
    assert.strictEqual(servicesNode.path, 'services');
  });

  test('6. Native Resource: manthan://active-context omits expired and banners soft-stale', async () => {
    const commitFn = toolHandlers.get('commit_memory')!;
    const now = new Date();
    const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // Soft-stale memory: stale_after in past, valid_until in future
    await commitFn({
      namespace: 'ops/deploy',
      title: 'Deployment Soft Stale Checklist',
      content: 'Verify cluster nodes before rollout',
      author_agent: 'agent-1',
      stale_after: pastDate,
      valid_until: futureDate,
    });

    const contextHandler = resourceHandlers.get('manthan://active-context')!;
    assert.ok(contextHandler, 'manthan://active-context resource registered');

    const res = await contextHandler(new URL('manthan://active-context'));
    assert.strictEqual(res.contents[0].mimeType, 'text/markdown');
    const md = res.contents[0].text;

    // Must include warning banner for soft stale memory
    assert.ok(md.includes('Warning: This working memory has passed its soft-stale threshold'));
    assert.ok(md.includes('Deployment Soft Stale Checklist'));
  });
});
