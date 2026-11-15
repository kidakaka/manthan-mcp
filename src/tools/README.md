# MCP Tools Implementation (`src/tools`)

## Overview
The `src/tools` package implements the 6 Model Context Protocol (MCP) tool handlers exposed by Manthan. These tools allow client AI agents to perform deterministic BM25 retrieval, atomic Git-backed memory commits, constitutional rule proposals, provenance lineage auditing, sidecar index rebuilding, and tag/keyword-filtered retrieval.

## Interface
- `[recall-memory.ts:RecallMemoryInputSchema]`: Zod schema defining parameters for `recall_memory` tool (`query`, `namespace?`, `tags?`, `include_constitution?`, `limit?`, `exclude_superseded?`).
- `[recall-memory.ts:registerRecallMemoryTool]`: Registers `recall_memory` tool handler on the MCP server.
- `[commit-memory.ts:CommitMemoryInputSchema]`: Zod schema defining parameters for `commit_memory` tool (`namespace`, `title`, `content`, `tags?`, `author_agent`, `trace_id?`, `supersedes_id?`).
- `[commit-memory.ts:registerCommitMemoryTool]`: Registers `commit_memory` tool handler on the MCP server.
- `[propose-rule.ts:ProposeConstitutionRuleInputSchema]`: Zod schema defining parameters for `propose_constitution_rule` tool (`title`, `content`, `namespace`, `rationale`, `author_agent`, `source_memory_id?`, `create_branch?`).
- `[propose-rule.ts:registerProposeRuleTool]`: Registers `propose_constitution_rule` tool handler on the MCP server.
- `[audit-lineage.ts:AuditMemoryLineageInputSchema]`: Zod schema defining parameters for `audit_memory_lineage` tool (`memory_id?`, `file_path?`, `max_commits?`).
- `[audit-lineage.ts:registerAuditLineageTool]`: Registers `audit_memory_lineage` tool handler on the MCP server.
- `[sync-index.ts:SyncMemoryIndexInputSchema]`: Zod schema defining parameters for `sync_memory_index` tool (`force_rebuild?`).
- `[sync-index.ts:registerSyncIndexTool]`: Registers `sync_memory_index` tool handler on the MCP server.
- `[fetch-tags-keywords.ts:FetchByTagsAndKeywordsInputSchema]`: Zod schema defining parameters for `fetch_by_tags_and_keywords` tool (`tags?`, `tag_mode?`, `keywords?`, `doc_type?`, `trust_tier?`, `limit?`, `snippets?`).
- `[fetch-tags-keywords.ts:registerFetchByTagsAndKeywordsTool]`: Registers `fetch_by_tags_and_keywords` tool handler on the MCP server.

## Invariants
- `[audit-lineage.ts:AuditMemoryLineageInputSchema]` `max_commits` must be an integer between 1 and 50 (default: 10).
- `[audit-lineage.ts:registerAuditLineageTool]` Target file must resolve to an existing file via `fs.existsSync`, otherwise returns an error response with `isError: true`.
- `[audit-lineage.ts:registerAuditLineageTool]` `targetFilePath` resolves from absolute or `workspace_root`-relative `args.file_path`, or from `store.findMemoryById(args.memory_id)`.
- `[commit-memory.ts:CommitMemoryInputSchema]` `namespace`, `title`, `content`, and `author_agent` must each be non-empty strings with minimum length 1.
- `[commit-memory.ts:CommitMemoryInputSchema]` `tags` defaults to an empty array.
- `[commit-memory.ts:registerCommitMemoryTool]` Newly created memory artifacts are always initialized with layer `'working'` and status `'active'`.
- `[commit-memory.ts:registerCommitMemoryTool]` When `supersedes_id` matches an existing memory, that memory's status is updated to `'superseded'`.
- `[commit-memory.ts:registerCommitMemoryTool]` `git_commit_sha` defaults to `'pending'` if `config.git.auto_commit` is false.
- `[fetch-tags-keywords.ts:FetchByTagsAndKeywordsInputSchema]` `tag_mode` must be `'all'` or `'any'` (default: `'all'`).
- `[fetch-tags-keywords.ts:FetchByTagsAndKeywordsInputSchema]` `trust_tier` must be `'human-reviewed'`, `'machine-confirmed'`, or `'unverified'` if specified.
- `[fetch-tags-keywords.ts:FetchByTagsAndKeywordsInputSchema]` `limit` must be an integer between 1 and 50 (default: 10).
- `[fetch-tags-keywords.ts:FetchByTagsAndKeywordsInputSchema]` `snippets` defaults to true.
- `[fetch-tags-keywords.ts:registerFetchByTagsAndKeywordsTool]` Candidate search against SQLite indexer always enforces `include_constitution: true` and `limit: 50`.
- `[propose-rule.ts:ProposeConstitutionRuleInputSchema]` `title`, `content`, `namespace`, `rationale`, and `author_agent` must each be non-empty strings with minimum length 1.
- `[propose-rule.ts:ProposeConstitutionRuleInputSchema]` `create_branch` defaults to false.
- `[propose-rule.ts:registerProposeRuleTool]` Proposed rules are always created with layer `'constitution'` and status `'draft'`.
- `[propose-rule.ts:registerProposeRuleTool]` Frontmatter tags for proposed rules always prepend `'constitution'` and `'rule-proposal'` before split namespace segments.
- `[propose-rule.ts:registerProposeRuleTool]` `git_commit_sha` defaults to `'pending'` if `config.git.auto_commit` is false.
- `[recall-memory.ts:RecallMemoryInputSchema]` `include_constitution` defaults to true.
- `[recall-memory.ts:RecallMemoryInputSchema]` `limit` must be an integer between 1 and 50 (default: 5).
- `[sync-index.ts:SyncMemoryIndexInputSchema]` `force_rebuild` defaults to false.
- `[sync-index.ts:registerSyncIndexTool]` `headSha` falls back to `'unknown_sha'` if `git.getHeadSha()` returns null or falsy.
- `[sync-index.ts:registerSyncIndexTool]` File commit SHA falls back to `headSha` if `git.getFileCommitSha()` returns null or falsy.

## Side Effects
- `[commit-memory.ts:registerCommitMemoryTool]` Modifies frontmatter on disk for superseded memory files via `store.updateFrontmatter`.
- `[commit-memory.ts:registerCommitMemoryTool]` Logs a warning to `console.warn` if `supersedes_id` does not match an existing memory.
- `[commit-memory.ts:registerCommitMemoryTool]` Writes new memory Markdown files to disk via `store.writeMemory`.
- `[commit-memory.ts:registerCommitMemoryTool]` Commits memory files to Git via `git.commitMemoryChanges` when `config.git.auto_commit` is true.
- `[commit-memory.ts:registerCommitMemoryTool]` Inserts or updates records in SQLite FTS5 index via `indexer.indexMemory`.
- `[commit-memory.ts:registerCommitMemoryTool]` Updates metadata keys `'git_head_sha'` and `'last_indexed_at'` in SQLite index via `indexer.setMetadata`.
- `[propose-rule.ts:registerProposeRuleTool]` Creates and checks out a new Git branch `manthan/rule-${id}` via `git.createAndCheckoutBranch` when `args.create_branch` is true.
- `[propose-rule.ts:registerProposeRuleTool]` Writes proposed rule Markdown files to disk under constitution layer via `store.writeMemory`.
- `[propose-rule.ts:registerProposeRuleTool]` Commits proposed rule files to Git via `git.commitMemoryChanges` when `config.git.auto_commit` is true.
- `[propose-rule.ts:registerProposeRuleTool]` Inserts proposed rules into SQLite index via `indexer.indexMemory` and updates `'last_indexed_at'` via `indexer.setMetadata`.
- `[sync-index.ts:registerSyncIndexTool]` Drops and rebuilds SQLite FTS5 database via `indexer.forceRebuild` when `args.force_rebuild` is true.
- `[sync-index.ts:registerSyncIndexTool]` Re-indexes all memory artifacts into SQLite index via `indexer.indexMemory`.
- `[sync-index.ts:registerSyncIndexTool]` Updates metadata keys `'git_head_sha'`, `'last_indexed_at'`, and `'version'` in SQLite index via `indexer.setMetadata`.

## Verification
- Run: `npm test`
