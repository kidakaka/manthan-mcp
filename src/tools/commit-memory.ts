import { z } from 'zod';
import { MarkdownStore } from '../storage/markdown-store.js';
import { GitEngine } from '../storage/git-engine.js';
import { SqliteIndexer } from '../storage/sqlite-indexer.js';
import {
  generateMemoryId,
  MemoryFrontmatter,
  ResolvedManthanConfig,
} from '../config/schema.js';

export const CommitMemoryInputSchema = {
  namespace: z.string().min(1).describe('Topic namespace (e.g. "backend/payments", "architecture/auth")'),
  title: z.string().min(1).describe('Concise human-readable title summarizing the decision or state'),
  content: z.string().min(1).describe('Markdown formatted memory content (facts, decisions, specs, handoff notes)'),
  tags: z.array(z.string()).default([]).describe('Tags for categorizing and discovering this memory artifact'),
  author_agent: z.string().min(1).describe('Name or identifier of the AI agent creating this memory (e.g. "claude-code", "gemini-developer")'),
  trace_id: z.string().optional().describe('Optional observability trace ID correlating this memory mutation to a session/run'),
  supersedes_id: z.string().optional().describe('Optional memory ID that this new artifact supersedes/replaces'),
};

export function registerCommitMemoryTool(
  server: any,
  config: ResolvedManthanConfig,
  store: MarkdownStore,
  git: GitEngine,
  indexer: SqliteIndexer
) {
  const handler = async (args: any) => {
    try {
      const id = generateMemoryId('mem');
      const now = new Date().toISOString();
      const filesToCommit: string[] = [];

      // 1. If supersedes_id is provided, mark previous memory as superseded
      let supersededArtifact: any = null;
      if (args.supersedes_id) {
        const existing = store.findMemoryById(args.supersedes_id);
        if (existing) {
          supersededArtifact = store.updateFrontmatter(existing.file_path, {
            status: 'superseded',
            updated_at: now,
          });
          filesToCommit.push(supersededArtifact.file_path);
        } else {
          console.warn(`[Manthan] Warning: Memory ID to supersede not found: ${args.supersedes_id}`);
        }
      }

      // 2. Prepare new memory frontmatter
      const frontmatter: MemoryFrontmatter = {
        id,
        title: args.title,
        layer: 'working',
        namespace: args.namespace,
        status: 'active',
        author_agent: args.author_agent,
        trace_id: args.trace_id || null,
        supersedes: args.supersedes_id || null,
        tags: args.tags || [],
        updated_at: now,
      };

      const targetPath = store.resolveMemoryPath('working', args.namespace, id);
      const newArtifact = store.writeMemory(targetPath, frontmatter, args.content);
      filesToCommit.push(newArtifact.file_path);

      // 3. Git commit if auto_commit is enabled
      let commitSha = 'pending';
      if (config.git.auto_commit) {
        commitSha = await git.commitMemoryChanges({
          files: filesToCommit,
          namespace: args.namespace,
          title: args.title,
          author_agent: args.author_agent,
          trace_id: args.trace_id,
          commit_prefix: config.git.commit_prefix,
        });
      }

      // 4. Update SQLite FTS5 Index
      if (supersededArtifact) {
        indexer.indexMemory(supersededArtifact, commitSha);
      }
      indexer.indexMemory(newArtifact, commitSha);

      // Update git HEAD metadata in indexer
      indexer.setMetadata('git_head_sha', commitSha);
      indexer.setMetadata('last_indexed_at', now);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                id: newArtifact.frontmatter.id,
                title: newArtifact.frontmatter.title,
                layer: newArtifact.frontmatter.layer,
                namespace: newArtifact.frontmatter.namespace,
                status: newArtifact.frontmatter.status,
                file_path: newArtifact.file_path,
                git_commit_sha: commitSha,
                supersedes: args.supersedes_id || null,
                author_agent: newArtifact.frontmatter.author_agent,
                trace_id: newArtifact.frontmatter.trace_id,
                updated_at: newArtifact.frontmatter.updated_at,
                message: 'Memory written, committed to Git, and indexed in FTS5 successfully.',
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
            text: `Error committing memory: ${err.message}`,
          },
        ],
      };
    }
  };

  const toolDescription =
    'Deterministic state write: validates Markdown frontmatter, atomically commits to Git with agent provenance, and updates local FTS5 index.';

  if (typeof server.registerTool === 'function') {
    server.registerTool(
      'commit_memory',
      {
        description: toolDescription,
        inputSchema: CommitMemoryInputSchema,
      },
      handler
    );
  } else {
    server.tool('commit_memory', toolDescription, CommitMemoryInputSchema, handler);
  }
}
