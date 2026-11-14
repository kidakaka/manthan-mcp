import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as yaml from 'yaml';
import { loadConfig, DEFAULT_CONFIG } from '../src/config/schema.js';
import { GitEngine } from '../src/storage/git-engine.js';
import { MarkdownStore } from '../src/storage/markdown-store.js';
import { SqliteIndexer } from '../src/storage/sqlite-indexer.js';
import { createManthanServer } from '../src/server.js';

test('Manthan E2E Memory Flow: Standalone Init, Commit, Supersede, Recall & Provenance', async (t) => {
  // 1. Create temporary workspace
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manthan-e2e-'));
  const configPath = path.join(tempDir, '.manthan.yaml');
  fs.writeFileSync(configPath, yaml.stringify(DEFAULT_CONFIG), 'utf-8');

  const config = loadConfig(tempDir);
  const git = new GitEngine(tempDir);
  const store = new MarkdownStore(config);
  const indexer = new SqliteIndexer(config);

  await git.initRepo();
  store.ensureDirectories();

  t.after(() => {
    try {
      indexer.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on Windows file locks
    }
  });

  let firstMemoryId: string = '';
  let firstCommitSha: string = '';

  await t.test('1. Commit working memory artifact with atomic Git commit', async () => {
    const { server } = createManthanServer(tempDir);
    assert.ok(server, 'Server should be created');

    const now = new Date().toISOString();
    firstMemoryId = 'mem_test_idempotency_v1';

    const targetPath = store.resolveMemoryPath('working', 'backend/payments', firstMemoryId);
    const artifact = store.writeMemory(
      targetPath,
      {
        id: firstMemoryId,
        title: 'API Idempotency Key Header Standard',
        layer: 'working',
        namespace: 'backend/payments',
        status: 'active',
        author_agent: 'claude-code',
        trace_id: 'tr_test_98234',
        tags: ['idempotency', 'api', 'payments'],
        updated_at: now,
      },
      '## Context\nClients must pass Idempotency-Key header on all POST requests.\n'
    );

    assert.ok(fs.existsSync(artifact.file_path), 'Memory file should exist on disk');

    // Commit to git
    firstCommitSha = await git.commitMemoryChanges({
      files: [artifact.file_path],
      namespace: 'backend/payments',
      title: 'API Idempotency Key Header Standard',
      author_agent: 'claude-code',
      trace_id: 'tr_test_98234',
    });

    assert.ok(firstCommitSha && firstCommitSha.length >= 7, 'Valid git commit SHA should be produced');

    // Index in SQLite FTS5
    indexer.indexMemory(artifact, firstCommitSha);
    indexer.setMetadata('git_head_sha', firstCommitSha);

    const indexedStatus = indexer.getStatusCounts();
    assert.equal(indexedStatus.working_active, 1, 'Should have 1 active working memory');
  });

  await t.test('2. Recall memory with lexical BM25 search and Git SHA provenance', async () => {
    const searchResults = indexer.search({
      query: 'idempotency header',
      include_constitution: true,
      limit: 5,
    });

    assert.equal(searchResults.working_memories.length, 1, 'Should find 1 working memory matching query');
    const item = searchResults.working_memories[0];
    assert.equal(item.id, firstMemoryId);
    assert.equal(item.status, 'active');
    assert.equal(item.git_commit_sha, firstCommitSha);
    assert.equal(item.author_agent, 'claude-code');
    assert.equal(item.trace_id, 'tr_test_98234');
    assert.ok(item.content.includes('Idempotency-Key header'), 'Content should be preserved');
  });

  let secondMemoryId: string = '';
  let secondCommitSha: string = '';

  await t.test('3. Supersede older memory with v2 artifact and verify state transitions', async () => {
    const now = new Date().toISOString();
    secondMemoryId = 'mem_test_idempotency_v2';

    // 1. Update old memory status to superseded
    const oldExisting = store.findMemoryById(firstMemoryId);
    assert.ok(oldExisting, 'Original memory should be found');
    const supersededOld = store.updateFrontmatter(oldExisting.file_path, {
      status: 'superseded',
      updated_at: now,
    });

    // 2. Write new memory superseding the old one
    const targetPathV2 = store.resolveMemoryPath('working', 'backend/payments', secondMemoryId);
    const artifactV2 = store.writeMemory(
      targetPathV2,
      {
        id: secondMemoryId,
        title: 'API Idempotency Key Standard v2 (UUIDv4 Requirement)',
        layer: 'working',
        namespace: 'backend/payments',
        status: 'active',
        author_agent: 'claude-code',
        trace_id: 'tr_test_98235',
        supersedes: firstMemoryId,
        tags: ['idempotency', 'api', 'payments', 'uuid'],
        updated_at: now,
      },
      '## Context v2\nIdempotency-Key must strictly be a UUIDv4 format string.\n'
    );

    // 3. Atomic Git commit of both files
    secondCommitSha = await git.commitMemoryChanges({
      files: [supersededOld.file_path, artifactV2.file_path],
      namespace: 'backend/payments',
      title: 'Update Idempotency Standard to v2 with UUIDv4',
      author_agent: 'claude-code',
      trace_id: 'tr_test_98235',
    });

    assert.ok(secondCommitSha, 'New commit SHA should be produced');

    // 4. Update indexer
    indexer.indexMemory(supersededOld, secondCommitSha);
    indexer.indexMemory(artifactV2, secondCommitSha);
    indexer.setMetadata('git_head_sha', secondCommitSha);

    const counts = indexer.getStatusCounts();
    assert.equal(counts.working_active, 1, 'Should still have 1 active memory');
    assert.equal(counts.working_superseded, 1, 'Should have 1 superseded memory');
  });

  await t.test('4. Verify recall excludes superseded memory and surfaces active v2', async () => {
    const searchResults = indexer.search({
      query: 'idempotency',
      include_constitution: true,
      limit: 5,
    });

    assert.equal(searchResults.working_memories.length, 1, 'Should return only active memory');
    const returned = searchResults.working_memories[0];
    assert.equal(returned.id, secondMemoryId);
    assert.equal(returned.supersedes, firstMemoryId);
    assert.equal(returned.git_commit_sha, secondCommitSha);
    assert.ok(returned.content.includes('UUIDv4'));
  });

  await t.test('5. Propose constitutional rule with draft status', async () => {
    const ruleId = 'rule_test_db_limits';
    const targetPath = store.resolveMemoryPath('constitution', 'database/pool', ruleId);

    const ruleArtifact = store.writeMemory(
      targetPath,
      {
        id: ruleId,
        title: 'ADR-002: Maximum Database Pool Limits',
        layer: 'constitution',
        namespace: 'database/pool',
        status: 'draft',
        author_agent: 'claude-code',
        tags: ['constitution', 'rule-proposal', 'database'],
        updated_at: new Date().toISOString(),
      },
      '## Architectural Law\nMaximum connection pool size must not exceed 20 connections.\n'
    );

    const ruleCommitSha = await git.commitMemoryChanges({
      files: [ruleArtifact.file_path],
      namespace: 'constitution/database/pool',
      title: '[PROPOSAL] ADR-002: Maximum Database Pool Limits',
      author_agent: 'claude-code',
    });

    indexer.indexMemory(ruleArtifact, ruleCommitSha);

    const constitutionQuery = indexer.search({
      query: 'database pool',
      include_constitution: true,
      limit: 5,
    });

    assert.equal(constitutionQuery.constitution_rules.length, 1);
    assert.equal(constitutionQuery.constitution_rules[0].status, 'draft');
    assert.equal(constitutionQuery.constitution_rules[0].layer, 'constitution');
  });

  await t.test('6. Audit memory lineage via Git history', async () => {
    const targetPath = store.resolveMemoryPath('working', 'backend/payments', secondMemoryId);
    const lineage = await git.getFileAuditLineage(targetPath, 10);

    assert.ok(lineage.length >= 1, 'Should find at least 1 commit in lineage');
    const latestCommit = lineage[0];
    assert.equal(latestCommit.sha, secondCommitSha);
    assert.equal(latestCommit.author_agent, 'claude-code');
    assert.equal(latestCommit.trace_id, 'tr_test_98235');
  });

  await t.test('7. Force rebuild sidecar index from disk and verify HEAD sync', async () => {
    indexer.forceRebuild();

    const all = store.listAllMemories();
    const headSha = await git.getHeadSha();

    for (const mem of all) {
      const sha = (await git.getFileCommitSha(mem.file_path)) || headSha;
      indexer.indexMemory(mem, sha);
    }
    indexer.setMetadata('git_head_sha', headSha || 'unknown');

    const countsAfter = indexer.getStatusCounts();
    assert.equal(countsAfter.total, 3, 'Should have 3 total memories indexed (2 working + 1 constitution)');
    assert.equal(countsAfter.working_active, 1);
    assert.equal(countsAfter.working_superseded, 1);
    assert.equal(countsAfter.constitution_draft, 1);
  });

  await t.test('8. Ingest OKF v0.2 document and fetch via tags and keywords', async () => {
    // Write a document using native OKF v0.2 frontmatter
    const okfFilePath = path.join(tempDir, '.manthan/memory/constitution/core/ADR-019-okf-upgrade.md');
    fs.mkdirSync(path.dirname(okfFilePath), { recursive: true });
    fs.writeFileSync(
      okfFilePath,
      `---
type: ADR
title: "ADR-019: Upgrade to Open Knowledge Format v0.2"
description: "Upgrades memory engine to support OKF v0.2 generated actor convention"
tags: [okf, architecture, knowledge-format]
generated: { by: google/gemini, at: "2026-11-09T00:00:00Z" }
status: accepted
---

## Context
All memory documents should follow OKF v0.2 frontmatter specifications.
`
    );

    const artifact = store.readMemory(okfFilePath);
    assert.ok(artifact, 'OKF v0.2 document should be parsed');
    assert.equal(artifact.frontmatter.title, 'ADR-019: Upgrade to Open Knowledge Format v0.2');
    assert.equal(artifact.frontmatter.author_agent, 'google/gemini');
    assert.equal(artifact.frontmatter.layer, 'constitution');
    assert.equal(artifact.frontmatter.status, 'accepted');

    indexer.indexMemory(artifact, 'sha_okf_test');

    const searchResults = indexer.search({
      query: 'knowledge format upgrade',
      tags: ['okf'],
      include_constitution: true,
    });

    assert.ok(searchResults.constitution_rules.length >= 1);
    const matched = searchResults.constitution_rules.find((r) => r.id === 'ADR-019-okf-upgrade');
    assert.ok(matched, 'Should find indexed OKF v0.2 document');
    assert.equal(matched.author_agent, 'google/gemini');
  });

  await t.test('9. BM25 Column Weighting: Title match ranks higher than Content match', async () => {
    // Artifact A has search term in Title
    const titleMatchArtifact = store.writeMemory(
      store.resolveMemoryPath('working', 'infra/k8s', 'mem_k8s_title_match'),
      {
        id: 'mem_k8s_title_match',
        title: 'Kubernetes Pod Autoscaler Policy',
        layer: 'working',
        namespace: 'infra/k8s',
        status: 'active',
        author_agent: 'claude-code',
        tags: ['infrastructure'],
        updated_at: new Date().toISOString(),
      },
      'Details on autoscaling pods.'
    );

    // Artifact B has search term only deep in content body
    const bodyMatchArtifact = store.writeMemory(
      store.resolveMemoryPath('working', 'infra/logging', 'mem_k8s_body_match'),
      {
        id: 'mem_k8s_body_match',
        title: 'Log Aggregation Architecture',
        layer: 'working',
        namespace: 'infra/logging',
        status: 'active',
        author_agent: 'claude-code',
        tags: ['logging'],
        updated_at: new Date().toISOString(),
      },
      'We stream logs from every Kubernetes Pod Autoscaler to Loki.'
    );

    indexer.indexMemory(titleMatchArtifact, 'sha_k8s_title');
    indexer.indexMemory(bodyMatchArtifact, 'sha_k8s_body');

    const searchResults = indexer.search({
      query: 'Kubernetes Pod Autoscaler',
      include_constitution: false,
      limit: 10,
    });

    const results = searchResults.working_memories;
    assert.ok(results.length >= 2, 'Should find both matching artifacts');

    const titleIndex = results.findIndex((m) => m.id === 'mem_k8s_title_match');
    const bodyIndex = results.findIndex((m) => m.id === 'mem_k8s_body_match');

    assert.ok(titleIndex !== -1, 'Title match artifact must be in results');
    assert.ok(bodyIndex !== -1, 'Body match artifact must be in results');
    assert.ok(
      titleIndex < bodyIndex,
      `Title match (idx ${titleIndex}) must rank higher than body match (idx ${bodyIndex}) due to BM25 column weighting`
    );
  });

  await t.test('10. Native MCP Resources: Read constitution, active-context, and status', async () => {
    const { server } = createManthanServer(tempDir);
    const registered = (server as any)._registeredResources;

    assert.ok(registered['manthan://constitution'], 'manthan://constitution resource should be registered');
    assert.ok(registered['manthan://active-context'], 'manthan://active-context resource should be registered');
    assert.ok(registered['manthan://status'], 'manthan://status resource should be registered');

    // 1. Read manthan://constitution
    const constResult = await registered['manthan://constitution'].readCallback(new URL('manthan://constitution'));
    assert.ok(constResult && constResult.contents && constResult.contents.length > 0);
    assert.equal(constResult.contents[0].mimeType, 'text/markdown');
    assert.match(constResult.contents[0].text, /Manthan Architectural Constitution/);

    // 2. Read manthan://active-context
    const contextResult = await registered['manthan://active-context'].readCallback(new URL('manthan://active-context'));
    assert.ok(contextResult && contextResult.contents && contextResult.contents.length > 0);
    assert.equal(contextResult.contents[0].mimeType, 'text/markdown');
    assert.match(contextResult.contents[0].text, /Manthan Active Working Context/);

    // 3. Read manthan://status
    const statusResult = await registered['manthan://status'].readCallback(new URL('manthan://status'));
    assert.ok(statusResult && statusResult.contents && statusResult.contents.length > 0);
    assert.equal(statusResult.contents[0].mimeType, 'application/json');

    const statusJson = JSON.parse(statusResult.contents[0].text);
    assert.ok(statusJson.counts.total > 0, 'Status should report total memories count');
    assert.ok(statusJson.retrieval.bm25_weights, 'Status should report BM25 weights');
    assert.equal(statusJson.retrieval.bm25_weights.title, 5.0);
  });
});
