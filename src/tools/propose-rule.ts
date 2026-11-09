// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

import { z } from 'zod';
import { MarkdownStore } from '../storage/markdown-store.js';
import { GitEngine } from '../storage/git-engine.js';
import { SqliteIndexer } from '../storage/sqlite-indexer.js';
import {
  generateMemoryId,
  MemoryFrontmatter,
  ResolvedManthanConfig,
} from '../config/schema.js';

export const ProposeConstitutionRuleInputSchema = {
  title: z.string().min(1).describe('Title of the proposed constitutional rule or architectural guardrail'),
  content: z.string().min(1).describe('The rule specification in Markdown format'),
  namespace: z.string().min(1).describe('Category namespace for the rule (e.g. "architecture/adr", "security/auth")'),
  rationale: z.string().min(1).describe('Detailed engineering justification explaining why this should become an unalterable project law'),
  author_agent: z.string().min(1).describe('Name or identifier of the AI agent proposing the rule'),
  source_memory_id: z.string().optional().describe('Optional ID of an existing working memory being promoted to constitutional law'),
  create_branch: z.boolean().default(false).describe('Whether to create and isolate the proposal in a dedicated Git branch (e.g. manthan/rule-<id>)'),
};

export function registerProposeRuleTool(
  server: any,
  config: ResolvedManthanConfig,
  store: MarkdownStore,
  git: GitEngine,
  indexer: SqliteIndexer
) {
  const handler = async (args: any) => {
    try {
      const id = generateMemoryId('rule');
      const now = new Date().toISOString();

      if (args.create_branch) {
        const branchName = `manthan/rule-${id}`;
        await git.createAndCheckoutBranch(branchName);
      }

      const frontmatter: MemoryFrontmatter = {
        id,
        title: args.title,
        layer: 'constitution',
        namespace: args.namespace,
        status: 'draft',
        author_agent: args.author_agent,
        supersedes: args.source_memory_id || null,
        tags: ['constitution', 'rule-proposal', ...args.namespace.split('/')],
        updated_at: now,
      };

      const markdownContent = `
## Architectural Law Specification
${args.content.trim()}

## Engineering Rationale
${args.rationale.trim()}

${args.source_memory_id ? `\n## Source Working Memory\nPromoted from working memory ID: \`${args.source_memory_id}\`\n` : ''}
`.trim();

      const targetPath = store.resolveMemoryPath('constitution', args.namespace, id);
      const newArtifact = store.writeMemory(targetPath, frontmatter, markdownContent);

      let commitSha = 'pending';
      if (config.git.auto_commit) {
        commitSha = await git.commitMemoryChanges({
          files: [newArtifact.file_path],
          namespace: `constitution/${args.namespace}`,
          title: `[PROPOSAL] ${args.title}`,
          author_agent: args.author_agent,
          commit_prefix: config.git.commit_prefix,
        });
      }

      indexer.indexMemory(newArtifact, commitSha);
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
                status: newArtifact.frontmatter.status,
                file_path: newArtifact.file_path,
                git_commit_sha: commitSha,
                review_prompt:
                  'This rule has been staged with status: "draft". A human maintainer can review and promote it to status: "active".',
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
            text: `Error proposing constitution rule: ${err.message}`,
          },
        ],
      };
    }
  };

  const toolDescription =
    'Guardrail Promotion: proposes a new architectural law or ADR inside constitution memory with status: "draft" for human developer review.';

  if (typeof server.registerTool === 'function') {
    server.registerTool(
      'propose_constitution_rule',
      {
        description: toolDescription,
        inputSchema: ProposeConstitutionRuleInputSchema,
      },
      handler
    );
  } else {
    server.tool('propose_constitution_rule', toolDescription, ProposeConstitutionRuleInputSchema, handler);
  }
}
