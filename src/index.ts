#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import { loadConfig, DEFAULT_CONFIG } from './config/schema.js';
import { GitEngine } from './storage/git-engine.js';
import { MarkdownStore } from './storage/markdown-store.js';
import { SqliteIndexer } from './storage/sqlite-indexer.js';
import { startStdioServer } from './server.js';

const program = new Command();

program
  .name('manthan')
  .description('Commercial-grade, Git-native deterministic memory engine for AI agents (MCP)')
  .version('0.1.0');

// ==========================================
// Command: manthan init
// ==========================================
program
  .command('init')
  .description('Initialize Manthan memory store, configuration, and sample seed artifacts in a workspace')
  .option('-d, --dir <path>', 'Workspace directory path', process.cwd())
  .action(async (options) => {
    const workspaceRoot = path.resolve(options.dir);
    console.log(`\n⚡ Initializing Manthan memory store in: ${workspaceRoot}\n`);

    const configFile = path.join(workspaceRoot, '.manthan.yaml');
    if (!fs.existsSync(configFile)) {
      const configYaml = yaml.stringify(DEFAULT_CONFIG);
      fs.writeFileSync(configFile, configYaml, 'utf-8');
      console.log(`✅ Created configuration file: .manthan.yaml`);
    } else {
      console.log(`ℹ️  Configuration file already exists: .manthan.yaml`);
    }

    const config = loadConfig(workspaceRoot);
    const store = new MarkdownStore(config);
    const git = new GitEngine(workspaceRoot);
    const indexer = new SqliteIndexer(config);

    // 1. Ensure directory structures
    store.ensureDirectories();
    console.log(`✅ Created memory directory: ${config.storage.working_dir}`);
    console.log(`✅ Created constitution directory: ${config.storage.constitution_dir}`);

    // 2. Ensure .gitignore excludes SQLite database
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    const ignoreEntry = '\n# Manthan local search sidecar index\n.manthan/index.db*\n';
    if (fs.existsSync(gitignorePath)) {
      const existing = fs.readFileSync(gitignorePath, 'utf-8');
      if (!existing.includes('.manthan/index.db')) {
        fs.appendFileSync(gitignorePath, ignoreEntry, 'utf-8');
        console.log(`✅ Appended .manthan/index.db* to .gitignore`);
      }
    } else {
      fs.writeFileSync(gitignorePath, ignoreEntry.trim() + '\n', 'utf-8');
      console.log(`✅ Created .gitignore with .manthan/index.db*`);
    }

    // 3. Initialize Git if not a repo
    const isRepo = await git.isGitRepo();
    if (!isRepo) {
      await git.initRepo();
      console.log(`✅ Initialized Git repository`);
    }

    // 4. Seed initial constitutional rule
    const sampleRulePath = path.join(
      config.resolved_paths.constitution_dir,
      'core',
      'ADR-001-architecture-laws.md'
    );
    if (!fs.existsSync(sampleRulePath)) {
      store.writeMemory(
        sampleRulePath,
        {
          id: 'rule_01_core_architecture',
          title: 'Deterministic Memory & Git Single Source of Truth',
          layer: 'constitution',
          namespace: 'architecture/core',
          status: 'active',
          author_agent: 'system',
          tags: ['architecture', 'git', 'constitution', 'adr'],
          updated_at: new Date().toISOString(),
        },
        `# ADR-001: Deterministic Memory-as-Code

All agent memory mutations MUST be version-controlled in Git and backed by the local SQLite FTS5 index.
Constitutional guardrails cannot be directly overwritten by agents during standard task execution.
Agents may propose additions via \`propose_constitution_rule\` for human review.`
      );
      console.log(`✅ Seeded constitutional rule: .manthan/memory/constitution/core/ADR-001-architecture-laws.md`);
    }

    // 5. Seed initial working memory
    const sampleMemPath = path.join(
      config.resolved_paths.working_dir,
      'system',
      'getting-started.md'
    );
    if (!fs.existsSync(sampleMemPath)) {
      store.writeMemory(
        sampleMemPath,
        {
          id: 'mem_01_getting_started',
          title: 'Workspace Memory Initialization',
          layer: 'working',
          namespace: 'system/lifecycle',
          status: 'active',
          author_agent: 'system',
          tags: ['initialization', 'bootstrap', 'lifecycle'],
          updated_at: new Date().toISOString(),
        },
        `# System Initialized

Manthan deterministic memory store initialized.
Agents can now commit state, recall context with BM25 ranking, and propose constitutional guardrails.`
      );
      console.log(`✅ Seeded working memory: .manthan/memory/working/system/getting-started.md`);
    }

    // 6. Index seeded memories into SQLite FTS5
    const memories = store.listAllMemories();
    let initialSha: string | null = null;

    if (config.git.auto_commit) {
      try {
        initialSha = await git.commitMemoryChanges({
          files: ['.manthan.yaml', '.gitignore', config.storage.root_dir],
          namespace: 'system/init',
          title: 'initialize Manthan memory store and seed artifacts',
          author_agent: 'system',
          commit_prefix: config.git.commit_prefix,
        });
        console.log(`✅ Created atomic Git commit: ${initialSha.substring(0, 7)}`);
      } catch (e: any) {
        console.log(`ℹ️  Git commit skipped: ${e.message}`);
      }
    }

    for (const mem of memories) {
      indexer.indexMemory(mem, initialSha);
    }
    indexer.setMetadata('git_head_sha', initialSha || 'init');
    indexer.setMetadata('last_indexed_at', new Date().toISOString());
    console.log(`✅ Indexed ${memories.length} memory artifacts in SQLite FTS5 (${config.storage.index_db_path})`);

    console.log(`\n🎉 Manthan is ready! Run "manthan serve" to launch the MCP server.\n`);
  });

// ==========================================
// Command: manthan serve
// ==========================================
program
  .command('serve')
  .description('Start the Model Context Protocol (MCP) server over Stdio')
  .option('-d, --dir <path>', 'Workspace directory path', process.cwd())
  .action(async (options) => {
    const workspaceRoot = path.resolve(options.dir);
    await startStdioServer(workspaceRoot);
  });

// ==========================================
// Command: manthan status
// ==========================================
program
  .command('status')
  .description('Display status and metrics of the Manthan memory store')
  .option('-d, --dir <path>', 'Workspace directory path', process.cwd())
  .action(async (options) => {
    const workspaceRoot = path.resolve(options.dir);
    const config = loadConfig(workspaceRoot);
    const git = new GitEngine(workspaceRoot);
    const indexer = new SqliteIndexer(config);

    const isRepo = await git.isGitRepo();
    const headSha = await git.getHeadSha();
    const counts = indexer.getStatusCounts();
    const lastIndexedAt = indexer.getMetadata('last_indexed_at') || 'never';
    const indexedSha = indexer.getMetadata('git_head_sha') || 'none';

    let dbSizeBytes = 0;
    if (fs.existsSync(config.resolved_paths.index_db_path)) {
      dbSizeBytes = fs.statSync(config.resolved_paths.index_db_path).size;
    }

    console.log(`\n🏛️  Manthan Memory Engine Status:`);
    console.log(`-----------------------------------------------`);
    console.log(`Project:              ${config.project} (v${config.version})`);
    console.log(`Workspace:            ${config.workspace_root}`);
    console.log(`Git Repository:       ${isRepo ? 'Connected' : 'Not initialized'}`);
    console.log(`Git HEAD SHA:         ${headSha ? headSha.substring(0, 9) : 'None'}`);
    console.log(`Index HEAD SHA:       ${indexedSha ? indexedSha.substring(0, 9) : 'None'}`);
    console.log(`Last Indexed:         ${lastIndexedAt}`);
    console.log(`Sidecar DB Size:      ${(dbSizeBytes / 1024).toFixed(2)} KB`);
    console.log(`\n📊 Memory Artifact Counts:`);
    console.log(`-----------------------------------------------`);
    console.log(`Working Active:       ${counts.working_active}`);
    console.log(`Working Superseded:   ${counts.working_superseded}`);
    console.log(`Constitution Active:  ${counts.constitution_active}`);
    console.log(`Constitution Draft:   ${counts.constitution_draft}`);
    console.log(`Total Memories:       ${counts.total}\n`);
  });

// ==========================================
// Command: manthan reindex
// ==========================================
program
  .command('reindex')
  .description('Rebuild SQLite FTS5 search index from Markdown storage')
  .option('-d, --dir <path>', 'Workspace directory path', process.cwd())
  .action(async (options) => {
    const workspaceRoot = path.resolve(options.dir);
    const config = loadConfig(workspaceRoot);
    const git = new GitEngine(workspaceRoot);
    const store = new MarkdownStore(config);
    const indexer = new SqliteIndexer(config);

    console.log(`\n🔄 Rebuilding Manthan FTS5 index from disk...`);
    indexer.forceRebuild();

    const all = store.listAllMemories();
    const headSha = (await git.getHeadSha()) || 'unknown_sha';

    for (const mem of all) {
      const sha = (await git.getFileCommitSha(mem.file_path)) || headSha;
      indexer.indexMemory(mem, sha);
    }

    const now = new Date().toISOString();
    indexer.setMetadata('git_head_sha', headSha);
    indexer.setMetadata('last_indexed_at', now);

    console.log(`✅ Successfully indexed ${all.length} artifacts in ${config.storage.index_db_path}`);
    console.log(`Stamping Git HEAD: ${headSha ? headSha.substring(0, 9) : 'none'}\n`);
  });

program.parse(process.argv);
