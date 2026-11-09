# 📋 Manthan Project TODO & Roadmap

This document tracks upcoming releases, deployment checklists, and community development tasks for **Manthan** (`@manthan/mcp-server`).

---

## 🚀 Immediate Priority: Publish to npm (`npx @manthan/mcp-server`)

The primary distribution goal is enabling zero-clone execution across all MCP clients:
```bash
npx @manthan/mcp-server init
npx @manthan/mcp-server serve
```

### Publishing Checklist:
- [ ] **NPM Account & Scope Setup:**
  - Verify if the `@manthan` scope is available on [npmjs.com](https://www.npmjs.com).
  - If `@manthan` is claimed/unavailable, designate primary public package identifier (e.g., `@kidakaka/manthan-mcp` or `manthan-mcp`).
  - Configure `"publishConfig": { "access": "public" }` in `package.json`.
- [ ] **Network & Registry Verification:**
  - Ensure local or CI environment connects to the official registry (`https://registry.npmjs.org/`).
  - Verify auth token (`npm whoami` / `NPM_TOKEN`).
- [ ] **Package Contents & Bundling:**
  - Verify files included in tarball (`npm pack --dry-run`):
    - `dist/` (compiled TypeScript ESM modules).
    - `.manthan.yaml.example`
    - `README.md`, `LICENSE`, `CONTRIBUTING.md`.
  - Confirm executable shebang (`#!/usr/bin/env node`) in `dist/index.js`.
- [ ] **Automated GitHub Actions CI/CD (`.github/workflows/publish.yml`):**
  - Trigger automated test + build on push to `main` and release tags (`v*`).
  - Publish with npm provenance generation (`--provenance`).
- [ ] **Smoke Test via NPX:**
  - Test `npx @manthan/mcp-server init` in a fresh directory on Windows, macOS, and Linux.
  - Verify `npx @manthan/mcp-server serve` communicates properly over stdio with Claude Desktop, Cursor, and Antigravity.

---

## 🌟 Early Adopter & Community Roadmap

### Phase 1: Real-World Battle-Testing (Current)
- [x] **Frictionless Onboarding & Client Auto-Link:**
  - Auto-generate `.cursor/mcp.json` and `.vscode/mcp.json` during `manthan init` for zero-configuration project startup.
  - Implement `manthan link [claude|cursor|vscode|all]` for 1-click configuration without touching JSON files.
  - Display interactive onboarding card explaining that stdio MCP servers require no running terminal daemon.
- [ ] **Collect Feedback on Memory Friction:**
  - Monitor GitHub Discussions & Issues for edge cases in agent supersession and long-session state drift.
  - Document prompt patterns that guide LLMs to write high-density, searchable frontmatter tags.
- [ ] **Multi-Platform OS Verification:**
  - Test SQLite FTS5 file-locking behaviors across native Windows, WSL2, macOS (Apple Silicon), and Linux container environments.

### Phase 2: Search & Retrieval Enhancements
- [ ] **BM25 Tuning:**
  - Implement configurable column weighting (boost `title` and `tags` over raw `body`).
  - Add optional semantic / hybrid reranking plugins for workflows where lexical BM25 is paired with lightweight local embeddings.
- [ ] **Time-Decay & Staleness Filters:**
  - Add query filters in `recall_memory` honoring `stale_after` frontmatter fields to deprioritize deprecated working memory.

### Phase 3: Enterprise & Multi-Repo Federation
- [ ] **Shared Constitutional Memory:**
  - Support mounting an external or git-submodule repository for organization-wide architectural constitutions.
- [ ] **Observability Bridges:**
  - Add native telemetry exporters for Langfuse, OpenTelemetry, and session replay tooling.
