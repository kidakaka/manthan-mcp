# Core Application & Server Runtime (`src`)

## Overview
The `src` package serves as the core runtime, server factory, and CLI entrypoint for Manthan MCP. It integrates configuration loading, storage engines, MCP resource endpoints, and tool handlers into a unified `ManthanContext`. It exposes both a Commander-based CLI (`manthan`) for lifecycle actions (`init`, `link`, `serve`, `status`, `reindex`) and the Model Context Protocol stdio transport runtime for agent integrations.

## Interface
- Direct symbols:
  - `[server.ts:ManthanContext]`: Context interface aggregating `server: McpServer`, `config: ResolvedManthanConfig`, `store: MarkdownStore`, `git: GitEngine`, and `indexer: SqliteIndexer`.
  - `[server.ts:createManthanServer]`: Factory initializing `ManthanContext`, ensuring storage directories, and registering all tools and resources: `(workspaceRoot?: string) => ManthanContext`.
  - `[server.ts:startStdioServer]`: Connects MCP server over `StdioServerTransport` with automatic startup index synchronization: `(workspaceRoot?: string) => Promise<void>`.
  - `[index.ts:program]`: Commander CLI program instance defining `manthan` commands.
  - `[index.ts:init]`: CLI command `init` to bootstrap `.manthan.yaml`, storage directories, git repository, seed memories, and LLM client configurations.
  - `[index.ts:link]`: CLI command `link [client]` to configure MCP client settings (`claude`, `cursor`, `vscode`, `all`).
  - `[index.ts:serve]`: CLI command `serve` to launch the stdio MCP server.
  - `[index.ts:status]`: CLI command `status` to inspect health, git head, and memory counts.
  - `[index.ts:reindex]`: CLI command `reindex` to force rebuild and sync SQLite FTS5 database from markdown storage.
- Subdirectories:
  - [Configuration & Client Linker](./config/README.md): Configuration schema parsing, normalization, and client linking.
  - [Resources Provider](./resources/README.md): MCP zero-turn resource endpoints (`manthan://constitution`, `manthan://active-context`, `manthan://status`).
  - [Storage Engine](./storage/README.md): Dual-tier persistence via Git versioning, Markdown store, and SQLite FTS5 sidecar indexer.
  - [MCP Tools](./tools/README.md): MCP tool implementations for memory recall, commit, constitutional rule proposal, lineage auditing, and indexing.

## Invariants
- `[server.ts:createManthanServer]` `store.ensureDirectories()` is always called before registering tools or resources.
- `[server.ts:startStdioServer]` `stdout` is reserved exclusively for JSON-RPC transport frames; all diagnostics, warnings, and notifications route through `console.error` (stderr).
- `[server.ts:startStdioServer]` Reindexes all memories into SQLite before connecting transport if cached `git_head_sha` does not match current Git HEAD SHA.
- `[index.ts:init]` `.manthan.yaml` is written with `DEFAULT_CONFIG` only if it does not already exist.
- `[index.ts:init]` `.gitignore` is updated with `.manthan/index.db*` only if not already present.
- `[index.ts:init]` `git.initRepo()` is executed only if workspace is not already a Git repository.
- `[index.ts:init]` Seed rule (`ADR-001-architecture-laws.md`) and seed working memory (`getting-started.md`) are created only if they do not exist.
- `[index.ts:link]` Client name must be one of `'claude'`, `'cursor'`, `'vscode'`, or `'all'`; otherwise exits process with code 1.
- `[index.ts:reindex]` Calls `indexer.forceRebuild()` to reset database before reindexing all memories found on disk.

## Side Effects
- `[server.ts:createManthanServer]` Creates storage directories on disk via `store.ensureDirectories()`.
- `[server.ts:startStdioServer]` Connects server to `StdioServerTransport` (attaching to `process.stdin` / `process.stdout`), updates SQLite database index and metadata on SHA mismatch, and outputs diagnostics to `process.stderr`.
- `[index.ts:init]` Creates `.manthan.yaml`, creates or appends to `.gitignore`, initializes Git repository, writes seed markdown files, creates atomic git commit (if `auto_commit` is enabled), populates SQLite index database, writes LLM client configuration files, and outputs logs to `stdout`.
- `[index.ts:link]` Reads and modifies LLM client configuration files on disk (Claude Desktop, Cursor, VS Code), writes to `stdout`/`stderr`, and may call `process.exit(1)`.
- `[index.ts:serve]` Starts stdio MCP server by calling `startStdioServer`.
- `[index.ts:status]` Reads filesystem stats, Git status, and SQLite database metadata; writes formatted status report to `stdout`.
- `[index.ts:reindex]` Drops and rebuilds SQLite FTS5 database tables on disk, writes memory index rows, and logs progress to `stdout`.
- `[index.ts:program]` Parses `process.argv` and executes command handlers.

## Verification
- Run: `npm test`
