// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

import { z } from 'zod';
import { SqliteIndexer } from '../storage/sqlite-indexer.js';

export const RecallMemoryInputSchema = {
  query: z.string().optional().describe('Search query string (natural language or keywords) to match against memory content, title, tags, and namespace'),
  namespace: z.string().optional().describe('Optional namespace filter supporting glob patterns (e.g. "backend/*", "backend/**")'),
  tags: z.array(z.string()).optional().describe('Optional tags filter to match memories with these tags'),
  include_constitution: z.boolean().default(true).describe('Whether to include high-priority constitutional guardrails (default: true)'),
  limit: z.number().int().min(1).max(50).default(5).describe('Maximum number of memories to return per category (default: 5)'),
  include_stale: z.boolean().default(false).describe('Whether to include hard-expired or stale working memories (default: false)'),
};

export function registerRecallMemoryTool(server: any, indexer: SqliteIndexer) {
  const handler = async (args: any) => {
    try {
      const results = indexer.search({
        query: args?.query,
        namespace: args?.namespace,
        tags: args?.tags,
        include_constitution: args?.include_constitution ?? true,
        limit: args?.limit ?? 5,
        include_stale: args?.include_stale ?? false,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error recalling memory: ${err.message}`,
          },
        ],
      };
    }
  };

  const toolDescription =
    'Lexical BM25 search across agent working memory and constitutional guardrails with Git commit SHA provenance and glob namespace filtering.';

  if (typeof server.registerTool === 'function') {
    server.registerTool(
      'recall_memory',
      {
        description: toolDescription,
        inputSchema: RecallMemoryInputSchema,
      },
      handler
    );
  } else {
    server.tool(
      'recall_memory',
      toolDescription,
      RecallMemoryInputSchema,
      handler
    );
  }
}
