# Storage Engine (`src/storage`)

## Overview
The `src/storage` package provides the dual-tier persistence layer for Manthan MCP. It implements the "Memory-as-Code" architecture through three collaborating sub-engines:
1. `GitEngine`: Manages local Git versioning, atomic commits, agent author metadata tagging, lineage audits, and rule proposal branches.
2. `MarkdownStore`: Manages structured Markdown files with strict YAML frontmatter on the local filesystem across `working` and `constitution` layers.
3. `SqliteIndexer`: Manages an embedded SQLite database utilizing Node's native `node:sqlite` (`DatabaseSync`) with an FTS5 virtual table and BM25 ranking for sub-5ms deterministic lexical retrieval.

## Interface
- `[git-engine.ts:CommitAuditEntry]`: Interface defining commit audit metadata (`sha`, `date`, `message`, `author_name`, `author_email`, `author_agent?`, `trace_id?`, `diff_summary?`).
- `[git-engine.ts:CommitOptions]`: Interface defining memory commit parameters (`files`, `namespace`, `title`, `author_agent`, `trace_id?`, `commit_prefix?`).
- `[git-engine.ts:GitEngine]`: Class managing Git version control operations for memory artifacts.
  - `isGitRepo(): Promise<boolean>`
  - `initRepo(): Promise<void>`
  - `getHeadSha(): Promise<string | null>`
  - `getFileCommitSha(filePath: string): Promise<string | null>`
  - `formatCommitMessage(options): string`
  - `parseAgentMetadata(message: string): { author_agent?: string; trace_id?: string }`
  - `commitMemoryChanges(options: CommitOptions): Promise<string>`
  - `getFileAuditLineage(filePath: string, maxCommits?: number): Promise<CommitAuditEntry[]>`
  - `createAndCheckoutBranch(branchName: string): Promise<void>`
- `[markdown-store.ts:MarkdownStore]`: Class managing Markdown and YAML frontmatter memory persistence.
  - `ensureDirectories(): void`
  - `resolveMemoryPath(layer: 'working' | 'constitution', namespace: string, id: string): string`
  - `writeMemory(filePath: string, frontmatter: MemoryFrontmatter, content: string): MemoryArtifact`
  - `readMemory(filePath: string): MemoryArtifact | null`
  - `updateFrontmatter(filePath: string, updates: Partial<MemoryFrontmatter>): MemoryArtifact`
  - `listAllMemories(): MemoryArtifact[]`
  - `findMemoryById(id: string): MemoryArtifact | null`
- `[sqlite-indexer.ts:SearchOptions]`: Interface defining memory search and recall query options.
- `[sqlite-indexer.ts:MemorySearchResult]`: Interface representing memory search result record with relevance score.
- `[sqlite-indexer.ts:RecallMemoryResponse]`: Interface representing segregated recall response (`constitution_rules`, `working_memories`, `total_count`).
- `[sqlite-indexer.ts:SqliteIndexer]`: Class managing SQLite relational and FTS5 full-text indexing and retrieval.
  - `getDatabase(): DatabaseSync`
  - `close(): void`
  - `forceRebuild(): void`
  - `getMetadata(key: string): string | null`
  - `setMetadata(key: string, value: string): void`
  - `indexMemory(artifact: MemoryArtifact, gitCommitSha?: string | null): void`
  - `search(options: SearchOptions): RecallMemoryResponse`
  - `getStatusCounts(): { total: number; working_active: number; working_superseded: number; constitution_active: number; constitution_draft: number }`

## Invariants
- `[git-engine.ts:GitEngine.formatCommitMessage]` Defaults prefix to `'chore(manthan):'` when `commit_prefix` is unspecified.
- `[git-engine.ts:GitEngine.formatCommitMessage]` Commit message format matches `${prefix} [${options.namespace}] ${options.title} [agent:${options.author_agent}${tracePart}]`.
- `[git-engine.ts:GitEngine.commitMemoryChanges]` Requires repo initialization via `initRepo()` before staging or committing.
- `[git-engine.ts:GitEngine.commitMemoryChanges]` Normalizes staged file paths to forward slashes relative to `workspaceRoot`.
- `[git-engine.ts:GitEngine.commitMemoryChanges]` Configures Git commit author explicitly as `"${options.author_agent} <agent@manthan.internal>"`.
- `[git-engine.ts:GitEngine.getFileAuditLineage]` Returns empty array `[]` if directory is not a git repository.
- `[git-engine.ts:GitEngine.initRepo]` Configures fallback `user.name 'Manthan Agent'` and `user.email 'manthan@agent.internal'` if `user.name` is empty or not configured.
- `[markdown-store.ts:MarkdownStore.resolveMemoryPath]` Resolves under `constitution_dir` if `layer === 'constitution'`, else under `working_dir`.
- `[markdown-store.ts:MarkdownStore.resolveMemoryPath]` Sanitizes namespace by replacing backslashes with `/` and stripping leading/trailing slashes; filenames end in `${id}.md`.
- `[markdown-store.ts:MarkdownStore.writeMemory]` Validates frontmatter through `MemoryFrontmatterSchema.parse` prior to write.
- `[markdown-store.ts:MarkdownStore.readMemory]` Returns `null` if target file does not exist or if frontmatter parsing fails.
- `[markdown-store.ts:MarkdownStore.updateFrontmatter]` Throws `Error` if file does not exist at `filePath`.
- `[markdown-store.ts:MarkdownStore.updateFrontmatter]` Sets `updated_at` to `new Date().toISOString()` if not explicitly provided in updates.
- `[markdown-store.ts:MarkdownStore.listAllMemories]` Ignores non-markdown files and walks directory tree for files ending in `'.md'`.
- `[sqlite-indexer.ts:SqliteIndexer.getDatabase]` Reuses cached singleton `this.db`; sets `PRAGMA journal_mode = WAL` and `synchronous = NORMAL`.
- `[sqlite-indexer.ts:SqliteIndexer.indexMemory]` Deletes existing record from `memories_fts` by id before inserting to maintain FTS index consistency.
- `[sqlite-indexer.ts:SqliteIndexer.search]` Defaults `include_constitution` to `true`, `limit` to `5`, and `exclude_superseded` to `true`.
- `[sqlite-indexer.ts:SqliteIndexer.search]` Filters out statuses `'superseded'` and `'archived'` when `exclude_superseded` is true.
- `[sqlite-indexer.ts:SqliteIndexer.search]` Slices `constitution_rules` and `working_memories` separately up to `limit`; `total_count` is their combined count.
- `[sqlite-indexer.ts:SqliteIndexer.search]` Default BM25 column weights fallback to `title: 5.0, namespace: 2.0, tags: 3.0, content: 1.0` when omitted from retrieval config.

## Side Effects
- `[git-engine.ts:GitEngine.initRepo]` Initializes Git repository on disk via `simpleGit.init()` and configures `user.name` and `user.email`.
- `[git-engine.ts:GitEngine.commitMemoryChanges]` Stages files via `git.add()` and records commit in git repository via `git.commit()`.
- `[git-engine.ts:GitEngine.createAndCheckoutBranch]` Alters repository branch and HEAD pointer via `git.checkoutLocalBranch()` or `git.checkout()`.
- `[git-engine.ts:GitEngine.getFileAuditLineage]` Emits warning logs to `console.warn` on git log/show failure.
- `[markdown-store.ts:MarkdownStore.ensureDirectories]` Creates `working_dir` and `constitution_dir` on filesystem via `fs.mkdirSync(..., { recursive: true })`.
- `[markdown-store.ts:MarkdownStore.writeMemory]` Recursively creates directory via `fs.mkdirSync` and writes markdown artifact to disk via `fs.writeFileSync`.
- `[markdown-store.ts:MarkdownStore.readMemory]` Emits warning logs to `console.warn` on parsing error.
- `[markdown-store.ts:MarkdownStore.updateFrontmatter]` Modifies file on disk by invoking `writeMemory`.
- `[sqlite-indexer.ts:SqliteIndexer.getDatabase]` Creates parent directory via `fs.mkdirSync`, opens SQLite database file via `new DatabaseSync`, and executes DDL table creation statements (`memories`, `memories_fts`, `index_metadata`).
- `[sqlite-indexer.ts:SqliteIndexer.close]` Closes SQLite database connection and releases OS file locks via `this.db.close()`.
- `[sqlite-indexer.ts:SqliteIndexer.forceRebuild]` Drops tables `memories_fts`, `memories`, `index_metadata` and recreates tables via `db.exec()`.
- `[sqlite-indexer.ts:SqliteIndexer.setMetadata]` Inserts or replaces rows in `index_metadata` SQLite table.
- `[sqlite-indexer.ts:SqliteIndexer.indexMemory]` Writes rows to `memories` table and `memories_fts` virtual table in SQLite database.

## Verification
- Run: `npm test`
