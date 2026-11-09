import { z } from 'zod';
import { MarkdownStore } from '../storage/markdown-store.js';
import { GitEngine } from '../storage/git-engine.js';
import { SqliteIndexer } from '../storage/sqlite-indexer.js';
import { ResolvedManthanConfig } from '../config/schema.js';

export const SyncMemoryIndexInputSchema = {
  force_rebuild: z.boolean().default(false).describe('Whether to drop the existing SQLite index and rebuild completely from scratch'),
};

export function registerSyncIndexTool(
  server: any,
  config: ResolvedManthanConfig,
  store: MarkdownStore,
  git: GitEngine,
  indexer: SqliteIndexer
) {
  const handler = async (args: any) => {
    try {
      const startTime = Date.now();

      if (args?.force_rebuild) {
        indexer.forceRebuild();
      }

      const allMemories = store.listAllMemories();
      const headSha = (await git.getHeadSha()) || 'unknown_sha';

      let workingCount = 0;
      let constitutionCount = 0;

      for (const artifact of allMemories) {
        const fileSha = (await git.getFileCommitSha(artifact.file_path)) || headSha;
        indexer.indexMemory(artifact, fileSha);

        if (artifact.frontmatter.layer === 'constitution') {
          constitutionCount++;
        } else {
          workingCount++;
        }
      }

      const now = new Date().toISOString();
      indexer.setMetadata('git_head_sha', headSha);
      indexer.setMetadata('last_indexed_at', now);
      indexer.setMetadata('version', config.version);

      const durationMs = Date.now() - startTime;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                indexed_total: allMemories.length,
                working_memories: workingCount,
                constitution_rules: constitutionCount,
                git_head_sha: headSha,
                force_rebuild: args?.force_rebuild ?? false,
                sync_timestamp: now,
                duration_ms: durationMs,
                message: 'Memory sidecar index synchronized successfully.',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error synchronizing memory index: ${err.message}`,
          },
        ],
      };
    }
  };

  const toolDescription =
    'Sidecar Maintenance: scans .manthan/memory/, parses Markdown frontmatter, synchronizes the SQLite FTS5 index, and stamps the current Git commit SHA.';

  if (typeof server.registerTool === 'function') {
    server.registerTool(
      'sync_memory_index',
      {
        description: toolDescription,
        inputSchema: SyncMemoryIndexInputSchema,
      },
      handler
    );
  } else {
    server.tool('sync_memory_index', toolDescription, SyncMemoryIndexInputSchema, handler);
  }
}
