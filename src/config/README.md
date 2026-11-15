# Configuration & Client Linker (`src/config`)

## Overview
The `src/config` package manages declarative configuration loading, schema validation, frontmatter normalization, and automated client linking for Manthan MCP. It validates `.manthan.yaml` manifests using Zod, establishes default pathing and retrieval weights, standardizes memory artifact schemas across layers, and injects server configurations into host client applications (Claude Desktop, Cursor, and VS Code).

## Interface
- `[schema.ts:StorageConfigSchema]`: Zod schema defining storage paths (`root_dir`, `working_dir`, `constitution_dir`, `index_db_path`)
- `[schema.ts:GitConfigSchema]`: Zod schema defining git management options (`auto_commit`, `branch_strategy`, `commit_prefix`)
- `[schema.ts:GovernanceConfigSchema]`: Zod schema defining governance recall and write policies
- `[schema.ts:RetrievalWeightsSchema]`: Zod schema defining BM25 retrieval field weights (`title`, `namespace`, `tags`, `content`)
- `[schema.ts:RetrievalConfigSchema]`: Zod schema defining retrieval configuration wrapping `bm25_weights`
- `[schema.ts:ManthanConfigSchema]`: Zod schema for overall project configuration
- `[schema.ts:ResolvedManthanConfig]`: Interface extending `ManthanConfig` with `workspace_root` and resolved absolute paths
- `[schema.ts:MemoryLayerEnum]`: Zod enum for memory layers (`'working' | 'constitution'`)
- `[schema.ts:MemoryStatusEnum]`: Zod enum for memory statuses (`'active' | 'superseded' | 'draft' | 'archived' | 'accepted' | 'proposed' | 'deprecated' | 'wip'`)
- `[schema.ts:MemoryFrontmatterSchema]`: Zod schema validating memory artifact frontmatter attributes
- `[schema.ts:normalizeMemoryFrontmatter]`: Normalizes raw frontmatter or OKF v0.2 metadata into `MemoryFrontmatter`
- `[schema.ts:MemoryArtifact]`: Interface representing loaded memory artifact frontmatter, content, path, and optional git SHA
- `[schema.ts:generateMemoryId]`: Helper generating unique memory identifiers with a prefix
- `[schema.ts:DEFAULT_CONFIG]`: Default parsed `ManthanConfig` constant
- `[schema.ts:loadConfig]`: Loads and parses `.manthan.yaml` from workspace root into `ResolvedManthanConfig`
- `[client-linker.ts:McpServerConfigEntry]`: Interface defining command, args, and env for an MCP server entry
- `[client-linker.ts:McpConfigFileStructure]`: Interface defining client MCP configuration structure containing `mcpServers` dictionary
- `[client-linker.ts:LinkResult]`: Interface describing the outcome of a client configuration linking operation
- `[client-linker.ts:getClaudeDesktopConfigPath]`: Resolves the OS-specific Claude Desktop configuration file path
- `[client-linker.ts:getCursorConfigPath]`: Resolves project-level Cursor configuration path (`.cursor/mcp.json`)
- `[client-linker.ts:getVSCodeConfigPath]`: Resolves project-level VS Code configuration path (`.vscode/mcp.json`)
- `[client-linker.ts:generateMcpServerConfig]`: Generates standard `McpServerConfigEntry` for launching Manthan
- `[client-linker.ts:updateMcpConfigFile]`: Updates or creates client MCP JSON configuration file while creating backups
- `[client-linker.ts:linkClaudeDesktop]`: Configures Manthan MCP server entry in Claude Desktop
- `[client-linker.ts:linkCursor]`: Configures Manthan MCP server entry in Cursor
- `[client-linker.ts:linkVSCode]`: Configures Manthan MCP server entry in VS Code
- `[client-linker.ts:linkAllClients]`: Sequentially configures Manthan across Cursor, VS Code, and Claude Desktop

## Invariants
- `[schema.ts:GitConfigSchema]` `branch_strategy` is constrained to `'direct' | 'session-branch'` with default `'direct'`.
- `[schema.ts:MemoryLayerEnum]` `layer` is strictly constrained to `'working' | 'constitution'`.
- `[schema.ts:MemoryStatusEnum]` `status` is constrained to `'active' | 'superseded' | 'draft' | 'archived' | 'accepted' | 'proposed' | 'deprecated' | 'wip'`.
- `[schema.ts:MemoryFrontmatterSchema]` `id`, `title`, `namespace`, `author_agent`, and `updated_at` are strictly non-empty strings (min(1)).
- `[schema.ts:normalizeMemoryFrontmatter]` `layer` resolves to `'constitution'` if `filePath` includes `'constitution'`, `data.layer === 'constitution'`, or `data.type === 'ADR'`; otherwise defaults to `'working'`.
- `[schema.ts:normalizeMemoryFrontmatter]` `namespace` defaults to `'architecture/adr'` when constitution-classified and unspecified; otherwise defaults to `'general'`.
- `[schema.ts:normalizeMemoryFrontmatter]` `author_agent` resolves via `data.author_agent` -> `data.generated.by` -> `'legacy-author'` (if `data.timestamp` present) -> `'system'`.
- `[schema.ts:normalizeMemoryFrontmatter]` `updated_at` resolves via `data.updated_at` -> `data.generated.at` -> `data.timestamp` -> current ISO timestamp.
- `[schema.ts:loadConfig]` configuration file target is strictly resolved as `<workspaceRoot>/.manthan.yaml` with `workspaceRoot` defaulting to `process.cwd()`.
- `[client-linker.ts:getClaudeDesktopConfigPath]` path resolution branches on `process.platform`: `%APPDATA%/Claude` on win32, `~/Library/Application Support/Claude` on darwin, and `$XDG_CONFIG_HOME` or `~/.config/Claude` on linux/others.
- `[client-linker.ts:getCursorConfigPath]` path is strictly `<workspaceRoot>/.cursor/mcp.json`.
- `[client-linker.ts:getVSCodeConfigPath]` path is strictly `<workspaceRoot>/.vscode/mcp.json`.
- `[client-linker.ts:generateMcpServerConfig]` if `customScriptPath` is provided, command is `'node'` with script path and serve flags; else if `useNpx` is true (default), command is `'npx'` with `-y @kidakaka/manthan-mcp`; else command is `'manthan'`.
- `[client-linker.ts:updateMcpConfigFile]` `existingData.mcpServers` is guaranteed to be an object before writing server entry.
- `[client-linker.ts:linkAllClients]` strictly executes link operations in order: Cursor, VS Code, Claude Desktop.

## Side Effects
- `[schema.ts:DEFAULT_CONFIG]` performs schema parsing during module initialization.
- `[schema.ts:loadConfig]` checks existence of and synchronously reads `.manthan.yaml` via `fs.existsSync` and `fs.readFileSync`.
- `[schema.ts:loadConfig]` writes warning log to stderr via `console.warn` if parsing `.manthan.yaml` fails.
- `[schema.ts:normalizeMemoryFrontmatter]` calls `Date.prototype.toISOString()` when `updated_at` is absent, and invokes `generateMemoryId` (calling `Date.now` and `Math.random`) when `id` is absent.
- `[client-linker.ts:getClaudeDesktopConfigPath]` accesses `process.platform`, `process.env`, and `os.homedir()`.
- `[client-linker.ts:updateMcpConfigFile]` creates parent directories synchronously via `fs.mkdirSync(dir, { recursive: true })` if nonexistent.
- `[client-linker.ts:updateMcpConfigFile]` reads configuration file synchronously via `fs.readFileSync`.
- `[client-linker.ts:updateMcpConfigFile]` writes backup file at `<configFilePath>.bak` via `fs.writeFileSync` when existing valid content is present.
- `[client-linker.ts:updateMcpConfigFile]` copies backup file to `<configFilePath>.bak-${Date.now()}` via `fs.copyFileSync` when existing file fails JSON parsing.
- `[client-linker.ts:updateMcpConfigFile]` synchronously overwrites configuration file with formatted JSON via `fs.writeFileSync`.
- `[client-linker.ts:linkClaudeDesktop]` performs filesystem read, write, and backup operations for Claude Desktop config via `updateMcpConfigFile`.
- `[client-linker.ts:linkCursor]` performs filesystem directory creation, read, write, and backup operations for Cursor config via `updateMcpConfigFile`.
- `[client-linker.ts:linkVSCode]` performs filesystem directory creation, read, write, and backup operations for VS Code config via `updateMcpConfigFile`.
- `[client-linker.ts:linkAllClients]` sequentially modifies filesystem config files across Cursor, VS Code, and Claude Desktop.

## Verification
- Run: `npm test`
