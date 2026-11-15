# Manthan v0.4.0: Memory Governance, Staleness Lifecycle & Glob Namespaces

*   **Author:** Prasad Ajinkya
*   **Status:** Approved
*   **Date:** 2026-11-15

---

## Overview

Manthan v0.4.0 introduces lifecycle governance, secret leakage prevention, tag taxonomy validation, and hierarchical glob namespace retrieval to the Manthan Model Context Protocol (MCP) server.

While Manthan v0.1.x–v0.3.x established deterministic Git-backed Markdown storage and embedded SQLite FTS5 search sidecars, uncurated agent writes accumulate obsolete working context, risk accidental credential commits, and face exact-prefix namespace restrictions. This milestone addresses these operational risks with zero new external runtime dependencies.

## The Problem

1. **Context Pollution & Obsolete Memories:** Ephemeral working memories (e.g. temporary debugging state, resolved intermediate tasks) remain active indefinitely alongside constitutional rules, polluting agent recall context windows and increasing token costs.
2. **Credential Leakage in Repositories:** Autonomous agents documenting setup instructions or API interactions can inadvertently persist live API keys, bearer tokens, or private keys to Git history.
3. **Taxonomy Fragmentation:** Uncurated agent tags lead to typographical errors or domain drift, degrading keyword discovery across sessions.
4. **Exact-Prefix Namespace Restrictions:** Agents cannot query cross-cutting wildcards (e.g., `*/auth` or `backend/**`) to retrieve memories across subsystem hierarchies, requiring multiple sequential recall tool calls.
5. **Database Migration Failures:** Existing workspaces with initialized SQLite sidecars will crash on upgrade if new schema columns are added without defensive runtime migrations.

## Goals

*   **Goal 1 (Lifecycle State Machine):** Differentiate soft decay (`stale_after`) from hard expiration (`valid_until`) in `MemoryFrontmatterSchema`. Hard-expired working memories must be omitted from default recall queries unless callers explicitly pass `include_stale: true`.
*   **Goal 2 (Constitutional Immunity):** Ensure constitutional memory rules (`layer: 'constitution'`) remain permanently exempt from automated staleness and expiration.
*   **Goal 3 (Pre-Commit Secret Scanning):** Implement a centralized pre-commit scanner across all write operations (`commit_memory`, `propose_constitution_rule`) that halts commits when private keys or token patterns are detected, returns masked error diagnostics, and provides an explicit `allow_secrets: boolean` bypass parameter for fixtures.
*   **Goal 4 (Bounded Tag Taxonomy):** Provide configurable tag governance in `.manthan.yaml`. Auto-map typo tags within an edit distance <= 2, return explicit remapping telemetry, and support a configurable `tag_policy` (`warn` vs `strict`).
*   **Goal 5 (Hierarchical Glob Namespaces):** Support single-segment `*` and recursive `**` namespace queries using native Node.js 22 `path.posix.matchesGlob`, combined with indexed SQL prefix pruning.
*   **Goal 6 (Namespace Resource):** Expose `manthan://namespaces` returning a structured JSON document with granular counts per node (`active_count`, `stale_count`, `constitution_count`, `total_count`).
*   **Goal 7 (Defensive Migrations):** Automatically upgrade existing v0.3.x `.manthan/index.db` databases at startup via `PRAGMA table_info` and `ALTER TABLE` without crashing or requiring manual resets.

## Non-Goals

*   **Background Deletion Daemons:** Manthan will not run background cron processes that delete markdown files from disk or prune Git history.
*   **External Vault Integration:** Direct runtime integration with HashiCorp Vault, AWS Secrets Manager, or cloud KMS is out of scope.
*   **Git Session-Branching:** Automated branch worktree isolation (`manthan/session-<id>`) is deferred to v0.5.0.
*   **Enterprise Multi-Repo Federation:** Cross-repository constitutional mounting and remote submodules are deferred to v0.6.0.

## Open Questions

*   None. Architectural decisions and boundary conditions are specified below.

## Critical User Journeys (CUJs)

### CUJ 1: Stale Memory Exclusion & Inspection
*   **Given**: A repository containing active memories, a memory with `valid_until: "2026-11-14T00:00:00.000Z"` (expired), and a constitutional rule with `updated_at: "2026-01-01T00:00:00.000Z"`.
*   **When**: An agent calls `recall_memory(query: "auth")` with default options (`include_stale: false`).
*   **Then**: The expired working memory is omitted from `working_memories`, the constitutional rule is preserved, and the response metadata reports `stale_excluded_count: 1`. When the agent queries with `include_stale: true`, the expired memory is returned with `is_stale: true` and `is_expired: true`, preserving raw content immutability.

### CUJ 2: Pre-commit Secret Interception & Fixture Bypass
*   **Given**: An agent executing a task attempts to persist notes containing a live AWS access key (`AKIAIOSFODNN7EXAMPLE`) without setting `allow_secrets`.
*   **When**: The agent calls `commit_memory`.
*   **Then**: The tool halts execution before filesystem writes or Git commits, returning a structured error with masked snippet (`AKIA****...`), pattern category (`AWS Access Key ID`), line number, and corrective instructions. When the agent re-submits with `allow_secrets: true`, the commit succeeds.

### CUJ 3: Typo Tag Normalization & Feedback
*   **Given**: `.manthan.yaml` defines `governance.allowed_tags: ["database", "auth", "billing"]`.
*   **When**: An agent calls `commit_memory` with `tags: ["databaes", "auth"]`.
*   **Then**: The system auto-maps `"databaes"` to `"database"` (edit distance 1), commits the frontmatter with `"database"`, and returns `tag_mappings: [{ original: "databaes", mapped: "database", distance: 1 }]` in the tool response.

### CUJ 4: Recursive Glob Namespace Querying
*   **Given**: Namespaces exist for `backend/api/v1`, `backend/services/billing`, and `frontend/ui`.
*   **When**: An agent calls `recall_memory(namespace: "backend/**")`.
*   **Then**: Results include memories from both `backend/api/v1` and `backend/services/billing`, while excluding `frontend/ui`.

### CUJ 5: Namespace Hierarchy Resource Discovery
*   **Given**: A repository with nested working and constitutional memories across `architecture/adr`, `backend/api`, and `backend/db`.
*   **When**: A client agent reads the MCP resource `manthan://namespaces`.
*   **Then**: The resource returns a structured JSON hierarchy tree where the root and intermediate nodes report cumulative rollups of `active_count`, `stale_count`, `constitution_count`, and `total_count`.

### CUJ 6: Defensive Database Migration on v0.3.x Startup
*   **Given**: An existing workspace initialized on Manthan v0.3.1 with a 13-column `memories` table in `.manthan/index.db`.
*   **When**: The Manthan v0.4.0 server boots or runs `SqliteIndexer.initSchema()`.
*   **Then**: The indexer inspects table metadata via `PRAGMA table_info`, detects missing `stale_after` and `valid_until` columns, issues non-destructive `ALTER TABLE` statements, updates secondary indexes, and continues without runtime errors or data loss.

---

## Technical Plan (Architecture)

### 1. Architectural Overview & Subsystem Topology

Manthan v0.4.0 adds three domain capabilities (Governance, Security, and Lifecycle) into the existing read/write pipeline while maintaining the unidirectional flow from MCP tool invocations to Git-backed Markdown storage and SQLite FTS5 synchronization.

```mermaid
flowchart TD
    subgraph Client["MCP Client (IDE / Agent)"]
        CommitTool["commit_memory"]
        ProposeTool["propose_constitution_rule"]
        RecallTool["recall_memory / fetch_by_tags_and_keywords"]
        ResourceCall["manthan://namespaces / manthan://active-context"]
    end

    subgraph Governance["Governance & Security Pipeline"]
        SecScanner["SecretScanner (assertNoSecrets)"]
        TagGov["TagGovernance (bounded Levenshtein)"]
        TimeNorm["Timestamp Normalizer (UTC RFC 3339)"]
    end

    subgraph Storage["Storage Engine"]
        MDStore["MarkdownStore (Git working tree)"]
        GitEng["GitEngine (auto-commit)"]
        SQLIdx["SqliteIndexer (FTS5 + B-Tree)"]
    end

    CommitTool -->|"pre-write"| SecScanner
    ProposeTool -->|"pre-write"| SecScanner
    SecScanner -->|"pass"| TagGov
    TagGov --> TimeNorm
    TimeNorm --> MDStore
    MDStore --> GitEng
    GitEng --> SQLIdx

    RecallTool -->|"query"| SQLIdx
    ResourceCall --> SQLIdx
```

### 2. Component Specifications

#### A. Configuration & Frontmatter Subsystem (`src/config/schema.ts`)
*   **`MemoryFrontmatterSchema` Extension:**
    ```typescript
    export const MemoryFrontmatterSchema = z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      layer: MemoryLayerEnum.default('working'),
      namespace: z.string().min(1),
      status: MemoryStatusEnum.default('active'),
      author_agent: z.string().min(1),
      trace_id: z.string().nullable().optional(),
      supersedes: z.string().nullable().optional(),
      tags: z.array(z.string()).default([]),
      updated_at: z.string().min(1),
      stale_after: z.string().datetime().nullable().optional(),
      valid_until: z.string().datetime().nullable().optional(),
    }).refine((data) => {
      if (data.stale_after && data.valid_until) {
        return new Date(data.stale_after) <= new Date(data.valid_until);
      }
      return true;
    }, {
      message: 'stale_after must be earlier than or equal to valid_until',
      path: ['stale_after'],
    });
    ```
*   **`GovernanceConfigSchema` Extension:**
    ```typescript
    export const GovernanceConfigSchema = z.object({
      prioritize_constitution_on_recall: z.boolean().default(true),
      allow_direct_constitution_writes: z.boolean().default(false),
      allowed_tags: z.array(z.string()).optional(),
      tag_policy: z.enum(['warn', 'strict']).default('warn'),
      secret_scanning: z.boolean().default(true),
    });
    ```
*   **`normalizeMemoryFrontmatter` Safe Parsing:**
    Incoming date values (`updated_at`, `stale_after`, `valid_until`) are safely parsed:
    ```typescript
    function parseSafeIso(val: any): string | null {
      if (!val || typeof val !== 'string' || val.trim() === '') return null;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    ```
    Missing optional timestamps default to `null`.

#### B. Secret Scanner Domain Service (`src/security/secret-scanner.ts`)
*   **Encapsulation:** Pure TypeScript service evaluating text fields with zero external runtime dependencies.
*   **Pattern Suite (Stateless $O(N)$ linear scans without persistent `/g` flags):**
    *   `AWS Access Key`: `/\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/`
    *   `GitHub PAT / App Token`: `/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b/`
    *   `Private Key Block`: `/-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/`
    *   `OpenAI / Anthropic Keys`: `/\b(sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,})\b/`
    *   `Bearer JWTs`: `/\bBearer\s+(ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*)\b/i`
*   **Multi-Field Signature:**
    ```typescript
    export interface SecretMatch {
      rule: string;
      line: number;
      masked: string;
    }

    export class SecretScanner {
      static scanText(text: string): SecretMatch[];
      static assertNoSecrets(
        fields: Record<string, string | undefined>,
        allowSecrets?: boolean
      ): void;
    }
    ```
*   **Masking Logic:** Replaces inner characters with asterisks: `sk-proj-ab1234567890` becomes `sk-proj-****...[REDACTED]`. Plaintext secrets are never returned in error messages or logs.
*   **Bypass:** When `allowSecrets: true` or `governance.secret_scanning === false`, validation passes immediately.

#### C. Tag Taxonomy Normalizer (`src/utils/levenshtein.ts`)
*   **Algorithm:** Dynamic programming Levenshtein distance matrix calculation.
*   **Interface Contract:**
    ```typescript
    export interface TagMapping {
      original: string;
      mapped: string;
      distance: number;
    }

    export interface TagNormalizationResult {
      tags: string[];
      mappings: TagMapping[];
      unmapped: string[];
    }
    ```
*   **Matching Rules:**
    *   Target tag normalized to lowercase and trimmed.
    *   If tag exists in `allowed_tags` (case-insensitive), returns exact match.
    *   If length <= 3, no fuzzy mapping (preserves short acronyms like `ui`, `ai`, `db`).
    *   If length == 4, edit distance must be <= 1.
    *   If length >= 5, edit distance must be <= 2.
    *   If multiple allowed tags tie for minimal distance, no mapping is performed.

#### D. Storage Evolution & Search Pipeline (`src/storage/sqlite-indexer.ts`)
*   **Defensive Table Migration & Base DDL in `initSchema()`:**
    ```sql
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      layer TEXT NOT NULL,
      namespace TEXT NOT NULL,
      status TEXT NOT NULL,
      author_agent TEXT NOT NULL,
      trace_id TEXT,
      supersedes TEXT,
      tags TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      stale_after TEXT,
      valid_until TEXT,
      file_path TEXT NOT NULL,
      git_commit_sha TEXT,
      content TEXT NOT NULL
    );
    ```
    For existing tables, check `PRAGMA table_info(memories)`:
    ```typescript
    const cols = db.prepare('PRAGMA table_info(memories)').all() as { name: string }[];
    const colNames = new Set(cols.map(c => c.name));
    if (!colNames.has('stale_after')) {
      try { db.exec('ALTER TABLE memories ADD COLUMN stale_after TEXT;'); } catch {}
    }
    if (!colNames.has('valid_until')) {
      try { db.exec('ALTER TABLE memories ADD COLUMN valid_until TEXT;'); } catch {}
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memories_lifecycle ON memories (layer, status, valid_until, stale_after);
      CREATE INDEX IF NOT EXISTS idx_memories_namespace ON memories (namespace);
    `);
    ```
*   **Updating `indexMemory()`:**
    Update `INSERT OR REPLACE INTO memories` to bind 15 columns, including `frontmatter.stale_after ?? null` and `frontmatter.valid_until ?? null`.
*   **Lifecycle Filtering & Deterministic Multi-Tier Sorting in `search()`:**
    Pass parameterized `nowIso = new Date().toISOString()` into prepared statements:
    ```sql
    -- Hard TTL Expiry Exclusion (Constitutional rules immune)
    AND (
      m.layer = 'constitution'
      OR m.valid_until IS NULL
      OR m.valid_until > ?
      OR ? = 1 -- include_stale
    )
    ```
    Multi-tiered SQL order:
    ```sql
    ORDER BY (
      CASE WHEN (m.layer = 'working' AND m.stale_after IS NOT NULL AND m.stale_after <= ?) THEN 1 ELSE 0 END
    ) ASC, score ASC, m.updated_at DESC
    ```
*   **POSIX Glob Matching via `path.posix.matchesGlob`:**
    If `options.namespace` contains wildcards (`*` or `?`):
    *   Extract static prefix before first wildcard and prune candidates using `(m.namespace = ? OR m.namespace LIKE ? || '/%')`.
    *   Filter candidate rows in-memory using `path.posix.matchesGlob(row.namespace, options.namespace)`.
*   **Candidate Processing Pass & Telemetry:**
    During row mapping, candidates matching search criteria that are excluded because `m.layer !== 'constitution' && m.valid_until && m.valid_until <= nowIso && !options.include_stale` increment `stale_excluded_count`. Memories where `stale_after <= nowIso` or `valid_until <= nowIso` receive `is_stale: true`. Hard-expired memories receive `is_expired: true`.

#### E. Tool & Resource Contracts
*   **TypeScript Retrieval Interfaces (`src/storage/sqlite-indexer.ts`):**
    ```typescript
    export interface SearchOptions {
      query?: string;
      namespace?: string;
      tags?: string[];
      include_constitution?: boolean;
      limit?: number;
      exclude_superseded?: boolean;
      include_stale?: boolean;
    }

    export interface MemorySearchResult {
      id: string;
      title: string;
      layer: 'working' | 'constitution';
      namespace: string;
      status: string;
      author_agent: string;
      trace_id: string | null;
      supersedes: string | null;
      tags: string[];
      updated_at: string;
      stale_after?: string | null;
      valid_until?: string | null;
      is_stale?: boolean;
      is_expired?: boolean;
      file_path: string;
      git_commit_sha: string | null;
      content: string;
      relevance_score?: number;
    }

    export interface RecallMemoryResponse {
      constitution_rules: MemorySearchResult[];
      working_memories: MemorySearchResult[];
      total_count: number;
      stale_excluded_count: number;
    }
    ```
*   **`commit_memory` Runtime Policy Enforcement:**
    *   Accepts `stale_after: z.string().optional()`, `valid_until: z.string().optional()`, `allow_secrets: z.boolean().default(false)`.
    *   If `config.governance.secret_scanning !== false`, runs `SecretScanner.assertNoSecrets({ title: args.title, content: args.content }, args.allow_secrets)`.
    *   Normalizes tags via `normalizeTags(args.tags, config.governance.allowed_tags)`.
    *   If `config.governance.tag_policy === 'strict'` and unmapped tags exist, aborts commit throwing `McpError` listing unmapped tags and allowed taxonomy.
    *   If `tag_policy === 'warn'`, commits unmapped tags as-is and returns `tag_warnings: string[]` alongside `tag_mappings: TagMapping[]`.
*   **`propose_constitution_rule`:**
    *   Accepts `allow_secrets: z.boolean().default(false)`.
    *   If `config.governance.secret_scanning !== false`, runs `SecretScanner.assertNoSecrets({ title: args.title, content: args.content, rationale: args.rationale }, args.allow_secrets)`.
*   **`manthan://namespaces` Resource Schema:**
    *   Exposed with `mimeType: "application/json"`.
    *   `SqliteIndexer.getNamespaceHierarchy()` queries distinct namespaces and returns a nested tree where branch nodes contain cumulative recursive rollups:
    ```json
    {
      "name": "root",
      "path": "",
      "active_count": 14,
      "stale_count": 2,
      "constitution_count": 4,
      "total_count": 20,
      "children": [
        {
          "name": "backend",
          "path": "backend",
          "active_count": 9,
          "stale_count": 1,
          "constitution_count": 0,
          "total_count": 10,
          "children": [
            {
              "name": "api",
              "path": "backend/api",
              "active_count": 5,
              "stale_count": 0,
              "constitution_count": 0,
              "total_count": 5,
              "children": []
            }
          ]
        }
      ]
    }
    ```

---

## Alternatives Considered

### Alternative A: Unconstrained Levenshtein Tag Fuzzy-Mapping

*   **Pros**: Automatically corrects arbitrary spelling mistakes without requiring upfront synonym lists or strict error correction loops.
*   **Cons**: Lacks semantic awareness. Distance metrics measure typographical differences, not conceptual equivalence. Distinct valid domain concepts (e.g., `#kms` vs `#k8s`, `#auth` vs `#audit`, `#auto` vs `#auth`) are silently rewritten, corrupting the memory index and causing future queries for the original tag to return zero results.
*   **Reason for Rejection**: Causes silent metadata corruption and breaks retrieval determinism. Bounding edit distance to small typographical variations (<= 2), returning explicit `tag_mappings` in the tool response, and providing configurable fallback policies (`warn` vs `strict`) preserves data integrity while catching common typos.

### Alternative B: Identical Binary Exclusion on Both `stale_after` and `valid_until`

*   **Pros**: Simplifies query implementation to a single boolean disjunction in SQL.
*   **Cons**: Having two fields with identical side-effects is architecturally redundant, creates confusion for callers, and abruptly excludes historical context, increasing the likelihood that agents repeat prior failed approaches or generate ungrounded decisions.
*   **Reason for Rejection**: Causes abrupt context loss. Differentiating `stale_after` as soft decay (warning banner in active context + rank dampening) and `valid_until` as hard TTL ensures historical continuity while preventing obsolete hallucinations.

### Alternative C: External Globbing Libraries (`picomatch` / `minimatch`)

*   **Pros**: Widely tested POSIX glob parsing libraries with extensive configuration options.
*   **Cons**: Adds new third-party dependencies, increasing supply chain exposure and node_modules footprint.
*   **Reason for Rejection**: Node.js v22.5.0+ natively provides `node:path/posix.matchesGlob()`. Manthan requires Node >= 22.5.0 in `package.json`, making external glob packages redundant.

### Alternative D: Rigid Secret Blocking Without Bypass

*   **Pros**: Absolute guarantee that no credential-matching patterns can ever enter Git history.
*   **Cons**: Rejects commits when agents document legitimate architectural patterns, mock credentials, or test fixtures without providing a mechanism to proceed.
*   **Reason for Rejection**: Causes agent deadlocks on legitimate documentation. Providing masked diagnostic errors and an explicit `allow_secrets: boolean` bypass parameter allows intentional fixtures while preventing accidental leaks.

### Alternative E: Flat List Representation for `manthan://namespaces`

*   **Pros**: Minimally smaller JSON payload with simpler SQL aggregation (`GROUP BY namespace`).
*   **Cons**: Fails to communicate parent-child scope relationships across nested domains (e.g., `backend/api/v1` vs `backend/db`), requiring client agents to reconstruct tree structures in their own context.
*   **Reason for Rejection**: Hierarchical tree representations enable agents to discover knowledge boundaries and subsystem taxonomy in a single glance.

---

## Non-Functional Requirements

### Security & Privacy
*   **Zero Leakage in Diagnostics:** Error messages generated by `SecretScanner` must never echo plaintext credentials into MCP stdio responses, application logs, or terminal outputs. Matched strings must be redacted using standard masking (e.g. `sk-proj-****...`).
*   **Dual-Path Enforcement:** Secret scanning must be applied uniformly to both `commit_memory` (working memories) and `propose_constitution_rule` (constitutional rules).
*   **Linear Scan Guarantees:** All secret detection regular expressions must be linear O(N) with no nested quantifiers to eliminate ReDoS vulnerabilities on the single-threaded Node.js event loop.

### Performance & Latency
*   **Search Query Overhead:** Target search query execution latency of < 5ms for workloads up to 10,000 indexed memories, leveraging compound index `idx_memories_lifecycle (layer, status, valid_until, stale_after)`.
*   **Zero External Dependencies:** Built-in Node.js 22 `path.posix.matchesGlob()` and an inlined dynamic programming Levenshtein algorithm maintain zero new runtime dependencies, keeping bundle size and initialization latency minimal.

### Migration & Backward Compatibility
*   **Defensive Table Migration:** Workspaces created on v0.1.0 through v0.3.1 must run on v0.4.0 without requiring manual index deletion. `initSchema()` must dynamically detect missing columns via `PRAGMA table_info` and execute non-destructive `ALTER TABLE` statements.
*   **Permissive Schema Hydration:** Pre-existing memory files on disk lacking `stale_after` or `valid_until` frontmatter fields must continue to load without Zod validation errors, defaulting to non-expiring permanent memories.
*   **Default Open Taxonomy:** If `governance.allowed_tags` is omitted or empty, tag taxonomy governance remains disabled, preserving full backward compatibility for unconfigured repositories.

---

## Detailed Implementation Plan

### Target Files to Create/Modify

#### 1. `src/config/schema.ts` (Modify)
*   **Type / Scope**: TypeScript Configuration and Frontmatter Schema
*   **Proposed Changes**:
    *   Extend `MemoryFrontmatterSchema` with optional ISO datetime strings: `stale_after: z.string().datetime().nullable().optional()` and `valid_until: z.string().datetime().nullable().optional()`.
    *   Add a Zod schema refinement ensuring `stale_after <= valid_until` when both fields are populated.
    *   Extend `GovernanceConfigSchema` with `allowed_tags: z.array(z.string()).optional()`, `tag_policy: z.enum(['warn', 'strict']).default('warn')`, and `secret_scanning: z.boolean().default(true)`.
    *   Update `normalizeMemoryFrontmatter()` to safely parse incoming dates into canonical UTC ISO strings (`parseSafeIso`), returning `null` when omitted or invalid.

#### 2. `src/security/secret-scanner.ts` (Create)
*   **Type / Scope**: Security Domain Service
*   **Proposed Changes**:
    *   Create `SecretScanner` class compiling linear regular expressions for AWS Access Keys, GitHub PATs, Private Key blocks, OpenAI/Anthropic API keys, and Bearer JWTs (without stateful `/g` flags).
    *   Implement `scanText(text: string): SecretMatch[]` returning line numbers, rule categories, and masked snippets (`sk-proj-****...`).
    *   Implement `assertNoSecrets(fields: Record<string, string | undefined>, allowSecrets?: boolean): void` throwing structured, masked validation errors when unredacted secrets are detected and `allowSecrets` is false.

#### 3. `src/utils/levenshtein.ts` (Create)
*   **Type / Scope**: Pure Utility Function
*   **Proposed Changes**:
    *   Implement dynamic programming Levenshtein distance matrix calculation (`levenshteinDistance(a: string, b: string): number`).
    *   Export `TagMapping` and `TagNormalizationResult` interfaces.
    *   Implement `normalizeTags(tags: string[], allowedTags?: string[]): TagNormalizationResult` enforcing length-based thresholds:
        *   Length <= 3: No mapping (preserves abbreviations).
        *   Length == 4: Distance must be <= 1.
        *   Length >= 5: Distance must be <= 2.
        *   Ties: No mapping.

#### 4. `src/storage/sqlite-indexer.ts` (Modify)
*   **Type / Scope**: Storage Engine and Relational Indexer
*   **Proposed Changes**:
    *   In `initSchema()`, update base `CREATE TABLE IF NOT EXISTS memories` DDL to include `stale_after TEXT, valid_until TEXT`.
    *   Execute defensive `PRAGMA table_info(memories)` checks and run `ALTER TABLE memories ADD COLUMN ...` inside a try/catch block for existing v0.3.x databases. Create `idx_memories_lifecycle` and `idx_memories_namespace` secondary indexes.
    *   Update `indexMemory()` to persist `frontmatter.stale_after ?? null` and `frontmatter.valid_until ?? null` into the relational table.
    *   Export updated `SearchOptions`, `MemorySearchResult` (with `stale_after`, `valid_until`, `is_stale`, `is_expired`), and `RecallMemoryResponse` (with `stale_excluded_count`).
    *   In `search()`, incorporate parameterized `nowIso = new Date().toISOString()` into SQL queries and apply multi-tiered sorting:
        `ORDER BY (CASE WHEN (m.layer = 'working' AND m.stale_after IS NOT NULL AND m.stale_after <= ?) THEN 1 ELSE 0 END) ASC, score ASC, m.updated_at DESC`.
    *   Implement POSIX glob matching via `path.posix.matchesGlob` with static prefix SQL pruning.
    *   Compute `stale_excluded_count` during candidate row evaluation.
    *   Implement `getNamespaceHierarchy(): NamespaceNode` aggregating counts per namespace.

#### 5. `src/tools/commit-memory.ts` (Modify)
*   **Type / Scope**: MCP Memory Mutation Tool
*   **Proposed Changes**:
    *   Add `stale_after: z.string().optional()`, `valid_until: z.string().optional()`, and `allow_secrets: z.boolean().default(false)` to `CommitMemoryInputSchema`.
    *   If `config.governance.secret_scanning !== false`, execute `SecretScanner.assertNoSecrets({ title: args.title, content: args.content }, args.allow_secrets)` before file write.
    *   Normalize tags using `normalizeTags()`. If `config.governance.tag_policy === 'strict'` and unmapped tags exist, throw `McpError`. If `tag_policy === 'warn'`, persist unmapped tags and return `tag_warnings`.
    *   Return `tag_mappings: TagMapping[]` in the successful commit response payload.

#### 6. `src/tools/recall-memory.ts` (Modify)
*   **Type / Scope**: MCP Memory Retrieval Tool
*   **Proposed Changes**:
    *   Add `include_stale: z.boolean().default(false)` to `RecallMemoryInputSchema`.
    *   Update schema description for `namespace` to document glob pattern support (`*`, `**`).
    *   Preserve payload immutability on `item.content` (do not prepend markdown banners into JSON results).
    *   Return `stale_excluded_count` in tool response metadata.

#### 7. `src/tools/fetch-tags-keywords.ts` (Modify)
*   **Type / Scope**: MCP Discovery Tool
*   **Proposed Changes**:
    *   Add `namespace: z.string().optional()` (supporting glob patterns) and `include_stale: z.boolean().default(false)` to `FetchByTagsAndKeywordsInputSchema`.

#### 8. `src/tools/propose-rule.ts` (Modify)
*   **Type / Scope**: MCP Architectural Governance Tool
*   **Proposed Changes**:
    *   Add `allow_secrets: z.boolean().default(false)` to `ProposeConstitutionRuleInputSchema`.
    *   If `config.governance.secret_scanning !== false`, execute `SecretScanner.assertNoSecrets({ title: args.title, content: args.content, rationale: args.rationale }, args.allow_secrets)` before file creation.

#### 9. `src/resources/index.ts` (Modify)
*   **Type / Scope**: Native MCP Resource Registration
*   **Proposed Changes**:
    *   Register `manthan://namespaces` with `mimeType: "application/json"`, calling `indexer.getNamespaceHierarchy()`.
    *   Update `manthan://active-context` resource handler to filter out hard-expired memories by default and prepend warning banners for soft-stale memories in the markdown text representation.

#### 10. `tests/governance-lifecycle.test.ts` (Create)
*   **Type / Scope**: Automated Test Suite
*   **Proposed Changes**:
    *   Test soft decay vs hard TTL expiry query exclusions and `include_stale` override.
    *   Test secret scanner pattern detection, masked error reporting, and `allow_secrets` bypass across `commit_memory` and `propose_constitution_rule`.
    *   Test bounded Levenshtein tag mapping, acronym preservation, and `warn` vs `strict` policies.
    *   Test single-segment and recursive POSIX glob namespace matching (`*`, `**`).
    *   Test programmatic SQLite table evolution from legacy v0.3.1 DDL without data loss.

#### 11. `tests/e2e-memory-flow.test.ts` (Modify)
*   **Type / Scope**: End-to-End Integration Suite
*   **Proposed Changes**:
    *   Update end-to-end memory flow to assert on lifecycle timestamps, namespace globs, and resource responses.

#### 12. `package.json`, `src/server.ts`, and `TODO.md` (Modify)
*   **Type / Scope**: Project Version and Roadmap
*   **Proposed Changes**:
    *   Bump package version to `0.4.0` in `package.json`.
    *   Update `"test"` script in `package.json` to include `tests/governance-lifecycle.test.ts`.
    *   Update server version fallback in `src/server.ts` line 40 to `'0.4.0'`.
    *   Mark Phase 2 items as complete in `TODO.md`.

---

### Verification Plan

*   **Compilation/Build**:
    `npm run build` — compiles TypeScript with zero errors.
*   **Automated Test Suite**:
    `npm test` — all test suites pass with zero failures.
*   **Backward Compatibility Test**:
    Execute tests against a programmatically created legacy v0.3.1 database to verify non-destructive `ALTER TABLE` column addition without errors.
*   **Secret Scanner Matrix Test**:
    Validate that all 5 secret categories trigger detection, return masked snippets, and pass when `allow_secrets: true` is supplied.
*   **Glob Specification Test**:
    Validate `backend/*` matches `backend/api` but not `backend/api/v1`, while `backend/**` matches both on POSIX and Windows hosts.
*   **Resource Inspection**:
    Verify `manthan://namespaces` outputs valid JSON adhering to the specified tree schema.

---
