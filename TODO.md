# 📋 Manthan Project TODO & Roadmap

This document tracks upcoming releases, deployment checklists, and community development tasks for **Manthan** ([`@kidakaka/manthan-mcp`](https://www.npmjs.com/package/@kidakaka/manthan-mcp)).

---

## ✅ Released: NPM Distribution (`@kidakaka/manthan-mcp`)

- [x] **NPM Account & Scope Setup:**
  - Designated primary public package identifier: [`@kidakaka/manthan-mcp`](https://www.npmjs.com/package/@kidakaka/manthan-mcp).
  - Configured `"publishConfig": { "access": "public" }` in `package.json`.
- [x] **Network & Registry Verification:**
  - Connected to official npm registry with auth token.
- [x] **Package Contents & Bundling:**
  - Verified files included in tarball (`dist/`, `.manthan.yaml.example`, `README.md`, `LICENSE`, `CONTRIBUTING.md`).
  - Executable shebang (`#!/usr/bin/env node`) verified in `dist/index.js`.
- [x] **Automated GitHub Actions CI/CD (`.github/workflows/publish.yml`):**
  - Automated test + build triggered on push and release tags.
- [x] **Smoke Test via NPX:**
  - Tested `npx @kidakaka/manthan-mcp init` and `serve` over stdio with Claude Desktop, Cursor, and Antigravity.

---

## 🌟 Development Roadmap

### Phase 1: Protocol Completeness & Retrieval Precision (In Progress)
- [x] **Frictionless Onboarding & Client Auto-Link:**
  - Auto-generate `.cursor/mcp.json` and `.vscode/mcp.json` during `manthan init`.
  - Implement `manthan link [claude|cursor|vscode|all]`.
- [x] **Native MCP Resources Support (`manthan://...`):**
  - Expose `manthan://constitution` for zero-turn architectural guardrail injection.
  - Expose `manthan://active-context` for active working memories snapshot.
  - Expose `manthan://status` for real-time engine metrics and sync status.
- [x] **Configurable BM25 Column Weighting:**
  - Native SQLite FTS5 `bm25(memories_fts, 0.0, w_title, w_namespace, w_tags, w_content)` scoring.
  - Configurable weights via `retrieval.bm25_weights` in `.manthan.yaml` (default: title: 5.0, tags: 3.0, namespace: 2.0, content: 1.0).
- [ ] **Multi-Platform OS Verification:**
  - Continuous validation across native Windows, WSL2, macOS, and Linux containers.

### Phase 2: Memory Governance & Staleness Lifecycle
- [ ] **Time-Decay & Staleness Filters:**
  - Add query filters in `recall_memory` honoring `stale_after` frontmatter fields to deprioritize deprecated working memory.
- [ ] **Hierarchical Namespace Matching:**
  - Support namespace globs (e.g. `backend/*`).
- [ ] **Pre-commit Secret & PII Scrubbing:**
  - Automated regex scanner to prevent committing API keys and credentials into memory markdown.

### Phase 3: Git Branch Isolation & Multi-Agent Handoffs
- [ ] **Session-Branching & Git Worktree Isolation:**
  - Implement `branch_strategy: "session-branch"` to prevent memory commits from dirtying human working trees.
- [ ] **Structured Session Handoff Artifacts & Prompts:**
  - Pre-built MCP prompt templates (`manthan-handoff`, `manthan-constitution-review`).

### Phase 4: Enterprise & Multi-Repo Federation
- [ ] **Shared Constitutional Memory:**
  - Support mounting an external or git-submodule repository for organization-wide architectural constitutions.
- [ ] **Observability Bridges:**
  - Native telemetry exporters for Langfuse, OpenTelemetry, and session replay tooling.
