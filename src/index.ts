#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'yaml';
import { loadConfig, DEFAULT_CONFIG } from './config/schema.js';
import { GitEngine } from './storage/git-engine.js';
import { MarkdownStore } from './storage/markdown-store.js';
import { SqliteIndexer } from './storage/sqlite-indexer.js';
import { startStdioServer } from './server.js';
import {
  linkClaudeDesktop,
  linkCursor,
  linkVSCode,
  linkAllClients,
  LinkResult,
  getClaudeDesktopConfigPath,
} from './config/client-linker.js';

const __filename = fileURLToPath(import.meta.url);

function printOnboardingBanner(
  workspaceRoot: string,
  initialSha: string | null,
  memoryCount: number,
  clientResults: LinkResult[]
): void {
  const line = '═'.repeat(66);
  const thinLine = '─'.repeat(66);

  console.log(`
┌${'─'.repeat(66)}┐
│                                                                  │
│   🏛️   M A N T H A N  —  Deterministic Agent Memory Engine         │
│   "Memory-as-Code" via Model Context Protocol (MCP)              │
│                                                                  │
└${'─'.repeat(66)}┘

📁 Workspace:       ${workspaceRoot}
🌿 Git Repository:  ${initialSha ? `Connected (commit ${initialSha.substring(0, 7)})` : 'Connected'}
🧠 Active Memory:   .manthan/memory/working/
🛡️  Constitution:    .manthan/memory/constitution/
⚡ Sidecar Index:   .manthan/index.db (SQLite FTS5 BM25)
📊 Seed Artifacts:  ${memoryCount} initial memories indexed

${line}
💡 HOW MCP WORKS (Zero Terminal Daemons Needed!)
${line}
You DO NOT need to run "manthan serve" in a background terminal.
Your LLM client (Claude, Cursor, etc.) launches Manthan automatically
as an isolated background sidecar process over stdio.

${thinLine}
🔌 INSTANT CLIENT CONNECTIONS
${thinLine}`);

  if (clientResults.length > 0) {
    for (const res of clientResults) {
      if (res.status === 'created' || res.status === 'updated') {
        const displayPath = path.isAbsolute(res.configPath)
          ? path.relative(workspaceRoot, res.configPath) || res.configPath
          : res.configPath;
        console.log(`  ✅ ${res.client.padEnd(16)} -> ${displayPath}`);
      } else if (res.status === 'error') {
        console.log(`  ⚠️  ${res.client.padEnd(16)} ${res.message}`);
      }
    }
  }

  const sampleConfig = JSON.stringify(
    {
      mcpServers: {
        manthan: {
          command: 'npx',
          args: ['-y', '@kidakaka/manthan-mcp', 'serve', '--dir', workspaceRoot],
        },
      },
    },
    null,
    2
  );

  console.log(`
  To link Claude Desktop automatically, run:
    npx @kidakaka/manthan-mcp link claude
    (or: manthan link claude)

  Or paste into your Claude Desktop config (${getClaudeDesktopConfigPath()}):
${sampleConfig
  .split('\n')
  .map((l) => '  ' + l)
  .join('\n')}

🎉 All set! Open your project in Cursor, VS Code, or Claude to start.
`);
}

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
  .option('-c, --client <client>', 'Auto-link to specific LLM client (claude, cursor, vscode, all)')
  .option('--no-client-configs', 'Skip generating workspace-level client configs (.cursor, .vscode)')
  .option('--local', 'Configure clients using local development node script instead of npx')
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

    const clientResults: LinkResult[] = [];
    const linkerOpts = {
      useNpx: !options.local,
      customScriptPath: options.local ? __filename : undefined,
    };

    if (options.clientConfigs !== false) {
      clientResults.push(linkCursor(workspaceRoot, linkerOpts));
      clientResults.push(linkVSCode(workspaceRoot, linkerOpts));
    }

    if (options.client) {
      const target = String(options.client).toLowerCase();
      if (target === 'claude') {
        clientResults.push(linkClaudeDesktop(workspaceRoot, linkerOpts));
      } else if (target === 'cursor' && options.clientConfigs === false) {
        clientResults.push(linkCursor(workspaceRoot, linkerOpts));
      } else if (target === 'vscode' && options.clientConfigs === false) {
        clientResults.push(linkVSCode(workspaceRoot, linkerOpts));
      } else if (target === 'all') {
        clientResults.push(linkClaudeDesktop(workspaceRoot, linkerOpts));
      }
    }

    printOnboardingBanner(workspaceRoot, initialSha, memories.length, clientResults);
  });

// ==========================================
// Command: manthan link [client]
// ==========================================
program
  .command('link [client]')
  .description('Automatically link Manthan MCP server into LLM client configuration (claude, cursor, vscode, all)')
  .option('-d, --dir <path>', 'Workspace directory path', process.cwd())
  .option('--local', 'Use local development node script instead of npx')
  .action((client = 'all', options) => {
    const workspaceRoot = path.resolve(options.dir);
    const linkerOpts = {
      useNpx: !options.local,
      customScriptPath: options.local ? __filename : undefined,
    };
    const target = client.toLowerCase();

    console.log(`\n🔗 Linking Manthan MCP server for workspace: ${workspaceRoot}\n`);

    let results: LinkResult[] = [];
    if (target === 'claude') {
      results = [linkClaudeDesktop(workspaceRoot, linkerOpts)];
    } else if (target === 'cursor') {
      results = [linkCursor(workspaceRoot, linkerOpts)];
    } else if (target === 'vscode') {
      results = [linkVSCode(workspaceRoot, linkerOpts)];
    } else if (target === 'all') {
      results = linkAllClients(workspaceRoot, linkerOpts);
    } else {
      console.error(`❌ Unknown client: "${client}". Choose from: claude, cursor, vscode, all`);
      process.exit(1);
    }

    for (const res of results) {
      if (res.status === 'created' || res.status === 'updated') {
        console.log(`✅ ${res.client}: ${res.message}`);
      } else if (res.status === 'error') {
        console.error(`❌ ${res.client}: ${res.message}`);
      }
    }

    console.log(`\n👉 Restart your LLM client (if open) to activate Manthan memory!\n`);
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
