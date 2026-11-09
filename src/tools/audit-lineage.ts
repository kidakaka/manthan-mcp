// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

import { z } from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { MarkdownStore } from '../storage/markdown-store.js';
import { GitEngine } from '../storage/git-engine.js';
import { ResolvedManthanConfig } from '../config/schema.js';

export const AuditMemoryLineageInputSchema = {
  memory_id: z.string().optional().describe('ID of the memory artifact to inspect (e.g. "mem_01j9x8k2m")'),
  file_path: z.string().optional().describe('Direct file path of the memory file (relative or absolute)'),
  max_commits: z.number().int().min(1).max(50).default(10).describe('Maximum number of commit history entries to return (default: 10)'),
};

export function registerAuditLineageTool(
  server: any,
  config: ResolvedManthanConfig,
  store: MarkdownStore,
  git: GitEngine
) {
  const handler = async (args: any) => {
    try {
      let targetFilePath: string | null = null;

      if (args?.file_path) {
        targetFilePath = path.isAbsolute(args.file_path)
          ? args.file_path
          : path.resolve(config.workspace_root, args.file_path);
      } else if (args?.memory_id) {
        const artifact = store.findMemoryById(args.memory_id);
        if (artifact) {
          targetFilePath = artifact.file_path;
        }
      }

      if (!targetFilePath || !fs.existsSync(targetFilePath)) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Memory artifact not found for id="${args?.memory_id || ''}" or file_path="${args?.file_path || ''}"`,
            },
          ],
        };
      }

      const history = await git.getFileAuditLineage(targetFilePath, args?.max_commits ?? 10);
      const relativePath = path.relative(config.workspace_root, targetFilePath).replace(/\\/g, '/');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                file_path: relativePath,
                memory_id: args?.memory_id || path.basename(targetFilePath, '.md'),
                commit_count: history.length,
                lineage: history,
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
            text: `Error retrieving memory lineage: ${err.message}`,
          },
        ],
      };
    }
  };

  const toolDescription =
    'Provenance & Time-Travel: retrieves chronological Git commit history, agent author metadata, and diff audit trail for a memory artifact.';

  if (typeof server.registerTool === 'function') {
    server.registerTool(
      'audit_memory_lineage',
      {
        description: toolDescription,
        inputSchema: AuditMemoryLineageInputSchema,
      },
      handler
    );
  } else {
    server.tool('audit_memory_lineage', toolDescription, AuditMemoryLineageInputSchema, handler);
  }
}
