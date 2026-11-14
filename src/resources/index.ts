// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResolvedManthanConfig } from '../config/schema.js';
import { MarkdownStore } from '../storage/markdown-store.js';
import { SqliteIndexer } from '../storage/sqlite-indexer.js';
import { GitEngine } from '../storage/git-engine.js';

export function registerManthanResources(
  server: McpServer,
  config: ResolvedManthanConfig,
  store: MarkdownStore,
  indexer: SqliteIndexer,
  git: GitEngine
): void {
  // 1. Constitutional Guardrails Resource
  const constitutionMetadata = {
    title: 'Constitutional Rules & Guardrails',
    description: 'Active architectural rules and non-negotiable project guardrails stored in .manthan/memory/constitution/',
    mimeType: 'text/markdown',
  };

  const constitutionHandler = async (uri: URL) => {
    const searchRes = indexer.search({
      include_constitution: true,
      exclude_superseded: true,
      limit: 50,
    });

    const rules = searchRes.constitution_rules;
    let text = `# 🏛️ Manthan Architectural Constitution & Guardrails\n\n`;
    text += `> Single source of truth for architectural laws, design conventions, and non-negotiable constraints.\n\n`;

    if (rules.length === 0) {
      text += `_No active constitutional rules found. Use \`propose_constitution_rule\` to establish project standards._\n`;
    } else {
      for (const rule of rules) {
        text += `## [${rule.id}] ${rule.title}\n`;
        text += `- **Namespace:** \`${rule.namespace}\`\n`;
        text += `- **Status:** \`${rule.status}\` | **Author:** \`${rule.author_agent}\`\n`;
        if (rule.git_commit_sha) {
          text += `- **Git Provenance:** \`${rule.git_commit_sha.substring(0, 7)}\`\n`;
        }
        if (rule.tags && rule.tags.length > 0) {
          text += `- **Tags:** ${rule.tags.map((t) => `\`#${t}\``).join(' ')}\n`;
        }
        text += `\n${rule.content.trim()}\n\n---\n\n`;
      }
    }

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: text.trimEnd() + '\n',
        },
      ],
    };
  };

  // 2. Active Working Memories Context Resource
  const activeContextMetadata = {
    title: 'Active Working Memories Context',
    description: 'Snapshot of active episodic memories, session handoffs, and specifications in .manthan/memory/working/',
    mimeType: 'text/markdown',
  };

  const activeContextHandler = async (uri: URL) => {
    const searchRes = indexer.search({
      include_constitution: false,
      exclude_superseded: true,
      limit: 25,
    });

    const memories = searchRes.working_memories;
    let text = `# 🧠 Manthan Active Working Context\n\n`;
    text += `> Snapshot of active episodic decisions, specs, and state handoffs.\n\n`;

    if (memories.length === 0) {
      text += `_No active working memories recorded. Use \`commit_memory\` to persist agent state decisions._\n`;
    } else {
      for (const mem of memories) {
        text += `### [${mem.id}] ${mem.title}\n`;
        text += `- **Namespace:** \`${mem.namespace}\` | **Updated:** \`${mem.updated_at}\`\n`;
        text += `- **Author:** \`${mem.author_agent}\`\n`;
        if (mem.git_commit_sha) {
          text += `- **Commit SHA:** \`${mem.git_commit_sha.substring(0, 7)}\`\n`;
        }
        if (mem.tags && mem.tags.length > 0) {
          text += `- **Tags:** ${mem.tags.map((t) => `\`#${t}\``).join(' ')}\n`;
        }
        text += `\n${mem.content.trim()}\n\n---\n\n`;
      }
    }

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: text.trimEnd() + '\n',
        },
      ],
    };
  };

  // 3. Engine Status & Diagnostics Resource
  const statusMetadata = {
    title: 'Manthan Engine Status',
    description: 'Real-time telemetry, memory artifact counts, and Git synchronization status',
    mimeType: 'application/json',
  };

  const statusHandler = async (uri: URL) => {
    const statusCounts = indexer.getStatusCounts();
    const headSha = await git.getHeadSha();
    const cachedSha = indexer.getMetadata('git_head_sha');
    const lastIndexedAt = indexer.getMetadata('last_indexed_at');

    const payload = {
      project: config.project,
      version: config.version,
      workspace_root: config.workspace_root,
      git: {
        head_sha: headSha,
        cached_head_sha: cachedSha,
        in_sync: headSha === cachedSha,
        auto_commit: config.git.auto_commit,
        branch_strategy: config.git.branch_strategy,
      },
      counts: statusCounts,
      retrieval: {
        bm25_weights: config.retrieval?.bm25_weights,
      },
      last_indexed_at: lastIndexedAt,
    };

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(payload, null, 2),
        },
      ],
    };
  };

  // Register resources using McpServer registerResource / resource API
  const s = server as any;
  if (typeof s.registerResource === 'function') {
    s.registerResource('constitution', 'manthan://constitution', constitutionMetadata, constitutionHandler);
    s.registerResource('active_context', 'manthan://active-context', activeContextMetadata, activeContextHandler);
    s.registerResource('status', 'manthan://status', statusMetadata, statusHandler);
  } else if (typeof s.resource === 'function') {
    s.resource('constitution', 'manthan://constitution', constitutionMetadata, constitutionHandler);
    s.resource('active_context', 'manthan://active-context', activeContextMetadata, activeContextHandler);
    s.resource('status', 'manthan://status', statusMetadata, statusHandler);
  }
}
