# 📋 Manthan Project TODO & Roadmap

This document tracks upcoming releases, deployment checklists, and community development tasks for **Manthan** ([`@kidakaka/manthan-mcp`](https://www.npmjs.com/package/@kidakaka/manthan-mcp)).

---

## 🏁 Release History & Milestones

### ✅ v0.1.x: Initial MVP & NPM Distribution (Released)
- [x] **NPM Account & Package Setup:**
  - Designated primary public package identifier: [`@kidakaka/manthan-mcp`](https://www.npmjs.com/package/@kidakaka/manthan-mcp).
  - Configured `"publishConfig": { "access": "public" }` in `package.json`.
- [x] **Core Deterministic Engine:**
  - Git-backed Markdown storage with strict YAML frontmatter (`working/` and `constitution/`).
  - Embedded SQLite FTS5 search sidecar using Node's built-in `node:sqlite` (`DatabaseSync`).
  - Initial 5 core tools: `recall_memory`, `commit_memory`, `propose_constitution_rule`, `audit_memory_lineage`, `sync_memory_index`.
- [x] **Frictionless Onboarding CLI:**
  - Implemented `manthan init`, `manthan serve`, `manthan link [claude|cursor|vscode|all]`, `manthan sync`, and `manthan status`.
  - Auto-generated `.cursor/mcp.json` and `.vscode/mcp.json`.
- [x] **CI/CD Automation (`.github/workflows/publish.yml`):**
  - Automated test, build, and npm publish with OIDC provenance.

---

### ✅ v0.2.0: Protocol Completeness & Retrieval Precision (Released)
- [x] **Native MCP Resources Support (`manthan://...`):**
  - `manthan://constitution`: Live resource returning all active architectural laws and ADRs for zero-turn prompt injection.
  - `manthan://active-context`: Snapshot of active episodic working memories and task handoffs.
  - `manthan://status`: Real-time telemetry, memory artifact counts, Git HEAD SHA, and index sync state.
- [x] **Configurable BM25 Column Weighting:**
  - SQLite FTS5 `bm25(memories_fts, 0.0, w_title, w_namespace, w_tags, w_content)` scoring.
  - Configurable weights via `retrieval.bm25_weights` in `.manthan.yaml` (default: `title: 5.0, tags: 3.0, namespace: 2.0, content: 1.0`).
- [x] **Open Knowledge Format (OKF v0.2) Ingestion:**
  - Added 6th tool `fetch_by_tags_and_keywords` supporting actor frontmatter (`generated: { by, at }`).
- [x] **Full Package Identity Synchronization:**
  - Aligned server name, onboarding card, and docs under `@kidakaka/manthan-mcp`.

---

### ✅ v0.3.x: EGM Blueprints, Contracts & Security Hardening (Current: v0.3.1)
- [x] **EGM Architecture Blueprints & Subsystem Contracts (v0.3.0):**
  - Created architectural blueprints and contracts across all modules (`src/README.md`, `src/config/README.md`, `src/resources/README.md`, `src/storage/README.md`, `src/tools/README.md`).
  - Verified with zero-drift telemetry report (`2026-11-15_DRIFT_REPORT.md`).
- [x] **Security & Vulnerability Remediation (v0.3.1):**
  - Resolved upstream dependency vulnerabilities via Snyk audit and locked dependencies in `package-lock.json`.

---

## 🌟 Future Development Roadmap

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │ v0.4.0 (Target: Next)  │ Memory Governance, Staleness & Glob Namespaces│
 ├────────────────────────┼───────────────────────────────────────────────┤
 │ v0.5.0                 │ Git Session-Branching & Native MCP Prompts    │
 ├────────────────────────┼───────────────────────────────────────────────┤
 │ v0.6.0                 │ Enterprise Federation & Multi-Repo Memory     │
 ├────────────────────────┼───────────────────────────────────────────────┤
 │ v0.7.0+                │ OpenTelemetry, Observability & Drift Visuals   │
 └────────────────────────────────────────────────────────────────────────┘
```

---

### ⏳ Phase 2: Memory Governance & Staleness Lifecycle (Target: v0.4.0)

- [ ] **Time-Decay & Staleness Filters:**
  - Add `stale_after` and `valid_until` ISO timestamps to `MemoryFrontmatterSchema`.
  - Add `include_stale: boolean` (default: `false`) in `recall_memory` and `fetch_by_tags_and_keywords`.
  - Automatically down-rank or exclude expired working memories while preserving constitutional rules.
- [ ] **Hierarchical Namespace Matching & Globs:**
  - Support wildcard/glob namespace queries (e.g., `backend/*` matching `backend/payments`, `backend/auth`, `backend/db`).
  - Add namespace hierarchy navigation tool or resource (`manthan://namespaces`).
- [ ] **Pre-commit Secret & PII Scrubbing:**
  - Add pre-commit validation hook in `commit_memory` using regex patterns for API keys, bearer tokens, JWTs, private keys, and passwords.
  - Fail with actionable guidance if credentials or secrets are detected before writing to disk or Git.
- [ ] **Controlled Tag Taxonomies:**
  - Support a declarative `governance.allowed_tags` list in `.manthan.yaml`.
  - Provide fuzzy tag completion and auto-tag suggestions during memory commits.
- [ ] **Multi-Platform OS Verification:**
  - Continuous matrix validation across native Windows, WSL2, macOS (Apple Silicon / Intel), and Linux containers.

---

### ⏳ Phase 3: Git Branch Isolation & Multi-Agent Handoffs (Target: v0.5.0)

- [ ] **Session-Branching Strategy (`branch_strategy: "session-branch"`):**
  - Implement Git worktree or isolated branch storage (`manthan/session-<id>`) so automated agent memory commits never dirty human developers' active working trees during active rebases or unstaged edits.
  - Support background memory synchronization back to `main` via squash or pull request.
- [ ] **Structured Session Handoff Artifacts:**
  - Standardized handoff schema (`handoff_summary`, `remaining_tasks`, `unresolved_questions`, `key_files_modified`).
  - Allow Agent A to write a handoff memory artifact that Agent B automatically retrieves on session initialization.
- [ ] **Pre-built Native MCP Prompts (`prompts/list` & `prompts/get`):**
  - `manthan-handoff`: Structured prompt guiding the agent to summarize intermediate state before context compaction or turn limits.
  - `manthan-constitution-review`: Structured prompt guiding human or senior agent to audit and accept/reject draft constitutional rules.
  - `manthan-session-summary`: Structured prompt to generate a high-density changelog of all memory mutations in the current session.

---

### ⏳ Phase 4: Enterprise Federation & Multi-Repo Memory (Target: v0.6.0)

- [ ] **Shared / Remote Constitutional Memory:**
  - Support mounting an external Git submodule or central Git repository (e.g., `git@github.com:org/engineering-constitution.git`) for organization-wide ADRs and standards.
  - Allow local repositories to reference central architectural rules without duplicating them.
- [ ] **Constitutional Inheritance & Precedence:**
  - Define 3-tier constitutional inheritance: `Organization -> Team / Fleet -> Repository`.
  - Conflict resolution rules ensuring repository-level decisions cannot silently violate org-level security guardrails.
- [ ] **Cryptographic Signature Verification:**
  - Support commit signature verification (`git verify-commit` / GPG / SSH signing) on constitutional rules to guarantee human-in-the-loop authorization.
- [ ] **Granular Multi-Tenant Access Scopes:**
  - Role-based capabilities (e.g., read-only agent keys vs. read-write memory permissions).

---

### ⏳ Phase 5: Observability Bridges & Advanced Analytics (Target: v0.7.0+)

- [ ] **Native OpenTelemetry (OTel) Tracing:**
  - Export trace spans for every `recall_memory`, `commit_memory`, and `sync_memory_index` call.
  - Instrument query latency, BM25 scores, and cache hits.
- [ ] **Observability Platform Bridges:**
  - Native exporters for Langfuse, AgentOps, OpenLit, and Arize AX.
- [ ] **Memory Drift & Conflict Visualizer:**
  - Detect conflicting decisions across divergent branches or agents.
  - Generate visual ASCII or Mermaid supersession graphs from Git history (`audit_memory_lineage --visualize`).
