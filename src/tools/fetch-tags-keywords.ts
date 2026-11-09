import { z } from 'zod';
import { SqliteIndexer } from '../storage/sqlite-indexer.js';
import { MarkdownStore } from '../storage/markdown-store.js';

export const FetchByTagsAndKeywordsInputSchema = {
  tags: z.array(z.string()).optional().describe('List of tags to filter by (e.g. ["bhn", "co-lending", "okf"])'),
  tag_mode: z.enum(['all', 'any']).default('all').describe('Tag conjunction mode: "all" (AND - must match all tags) or "any" (OR - matches any tag)'),
  keywords: z.string().optional().describe('Keyword search query for lexical BM25 relevance ranking across title, description, and content'),
  doc_type: z.string().optional().describe('Optional document type filter (e.g. "ADR", "Spec", "meeting-note", "Research")'),
  trust_tier: z.enum(['human-reviewed', 'machine-confirmed', 'unverified']).optional().describe('Optional OKF v0.2 trust tier filter'),
  limit: z.number().int().min(1).max(50).default(10).describe('Maximum number of matching documents to return (default: 10)'),
  snippets: z.boolean().default(true).describe('Whether to extract and include matching context excerpts from the content body'),
};

function extractSnippets(body: string, keywords: string[], maxSnippets: number = 2): string[] {
  if (!keywords || keywords.length === 0 || !body) return [];
  const paragraphs = body.split('\n\n');
  const snippets: string[] = [];

  for (const p of paragraphs) {
    const clean = p.replace(/\s+/g, ' ').trim();
    if (clean.length < 20) continue;

    for (const kw of keywords) {
      const idx = clean.toLowerCase().indexOf(kw.toLowerCase());
      if (idx !== -1) {
        if (clean.length > 300) {
          const start = Math.max(0, idx - 80);
          const end = Math.min(clean.length, idx + 180);
          snippets.push('...' + clean.substring(start, end).trim() + '...');
        } else {
          snippets.push(clean);
        }
        if (snippets.length >= maxSnippets) return snippets;
        break;
      }
    }
  }
  return snippets;
}

export function registerFetchByTagsAndKeywordsTool(
  server: any,
  indexer: SqliteIndexer,
  store: MarkdownStore
) {
  const handler = async (args: any) => {
    try {
      const tags = args?.tags || [];
      const tagMode = args?.tag_mode || 'all';
      const keywords = args?.keywords || '';
      const limit = args?.limit || 10;
      const includeSnippets = args?.snippets !== false;

      // Search using SQLite indexer
      const searchRes = indexer.search({
        query: keywords,
        tags: tags.length > 0 ? tags : undefined,
        include_constitution: true,
        limit: 50,
      });

      const allMatches = [...searchRes.constitution_rules, ...searchRes.working_memories];

      // In-memory filter for 'all' vs 'any' tag matching
      let filtered = allMatches;
      if (tags.length > 0) {
        const searchTags = tags.map((t: string) => t.toLowerCase().trim());
        filtered = allMatches.filter((item) => {
          const itemTags = (item.tags || []).map((t: string) => t.toLowerCase().trim());
          if (tagMode === 'all') {
            return searchTags.every((st: string) => itemTags.some((it: string) => it.includes(st)));
          } else {
            return searchTags.some((st: string) => itemTags.some((it: string) => it.includes(st)));
          }
        });
      }

      // Filter by doc_type if specified
      if (args?.doc_type) {
        const targetType = args.doc_type.toLowerCase();
        filtered = filtered.filter(
          (item) =>
            item.namespace.toLowerCase().includes(targetType) ||
            item.title.toLowerCase().includes(targetType)
        );
      }

      // Keyword terms for snippet extraction
      const kwTerms = keywords
        .split(/\s+/)
        .map((k: string) => k.trim())
        .filter((k: string) => k.length > 1);

      const items = filtered.slice(0, limit).map((m) => {
        const snippets = includeSnippets ? extractSnippets(m.content, kwTerms) : [];
        return {
          id: m.id,
          title: m.title,
          layer: m.layer,
          namespace: m.namespace,
          tags: m.tags,
          status: m.status,
          author_agent: m.author_agent,
          updated_at: m.updated_at,
          git_commit_sha: m.git_commit_sha,
          file_path: m.file_path,
          relevance_score: m.relevance_score,
          snippets: snippets.length > 0 ? snippets : undefined,
        };
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total_matches: items.length,
                query: {
                  tags: tags,
                  tag_mode: tagMode,
                  keywords: keywords || null,
                  doc_type: args?.doc_type || null,
                },
                results: items,
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
            text: `Error fetching memories by tags and keywords: ${err.message}`,
          },
        ],
      };
    }
  };

  const toolDescription =
    'Specialized harness to fetch, filter, and rank memories via multi-tag combinations (AND/OR) and BM25 lexical keywords with snippet context extraction.';

  if (typeof server.registerTool === 'function') {
    server.registerTool(
      'fetch_by_tags_and_keywords',
      {
        description: toolDescription,
        inputSchema: FetchByTagsAndKeywordsInputSchema,
      },
      handler
    );
  } else {
    server.tool('fetch_by_tags_and_keywords', toolDescription, FetchByTagsAndKeywordsInputSchema, handler);
  }
}
