import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, ResolvedManthanConfig } from './config/schema.js';
import { GitEngine } from './storage/git-engine.js';
import { MarkdownStore } from './storage/markdown-store.js';
import { SqliteIndexer } from './storage/sqlite-indexer.js';
import { registerRecallMemoryTool } from './tools/recall-memory.js';
import { registerCommitMemoryTool } from './tools/commit-memory.js';
import { registerProposeRuleTool } from './tools/propose-rule.js';
import { registerAuditLineageTool } from './tools/audit-lineage.js';
import { registerSyncIndexTool } from './tools/sync-index.js';
import { registerFetchByTagsAndKeywordsTool } from './tools/fetch-tags-keywords.js';

export interface ManthanContext {
  server: McpServer;
  config: ResolvedManthanConfig;
  store: MarkdownStore;
  git: GitEngine;
  indexer: SqliteIndexer;
}

/**
 * Creates and initializes the Manthan MCP Server instance with all tools registered.
 */
export function createManthanServer(workspaceRoot: string = process.cwd()): ManthanContext {
  const config = loadConfig(workspaceRoot);
  const git = new GitEngine(workspaceRoot);
  const store = new MarkdownStore(config);
  const indexer = new SqliteIndexer(config);

  // Ensure directories exist
  store.ensureDirectories();

  const server = new McpServer({
    name: '@manthan/mcp-server',
    version: config.version || '0.1.0',
  });

  // Register the 5 core deterministic tools
  registerRecallMemoryTool(server, indexer);
  registerCommitMemoryTool(server, config, store, git, indexer);
  registerProposeRuleTool(server, config, store, git, indexer);
  registerAuditLineageTool(server, config, store, git);
  registerSyncIndexTool(server, config, store, git, indexer);
  registerFetchByTagsAndKeywordsTool(server, indexer, store);

  return {
    server,
    config,
    store,
    git,
    indexer,
  };
}

/**
 * Starts the MCP Server over standard I/O (StdioServerTransport).
 * Note: Uses console.error for diagnostics so stdout remains exclusively
 * reserved for MCP JSON-RPC transport frames.
 */
export async function startStdioServer(workspaceRoot: string = process.cwd()): Promise<void> {
  const { server, config, store, git, indexer } = createManthanServer(workspaceRoot);

  // Perform quick initial sync if index is empty
  const headSha = await git.getHeadSha();
  const cachedSha = indexer.getMetadata('git_head_sha');

  if (!cachedSha || cachedSha !== headSha) {
    const allMemories = store.listAllMemories();
    if (allMemories.length > 0) {
      for (const m of allMemories) {
        indexer.indexMemory(m, headSha);
      }
      if (headSha) {
        indexer.setMetadata('git_head_sha', headSha);
      }
      indexer.setMetadata('last_indexed_at', new Date().toISOString());
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[Manthan MCP Server] running on stdio for workspace: ${config.workspace_root}`);
}
