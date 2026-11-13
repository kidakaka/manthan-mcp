# 🤝 Contributing to Manthan (`@manthan/mcp-server`)

Thank you for your interest in **Manthan**!

Manthan is an open-source, commercial-grade, Git-native deterministic memory engine for AI agents exposed via the **Model Context Protocol (MCP)**. Unlike probabilistic vector-only layers that suffer from black-box drift, Manthan treats agent memory as **version-controlled state ("Memory-as-Code")**.

---

## 🌟 Our #1 Priority: Early Adopters & Real-World Feedback

> **"Code is easy to write; real-world agent memory friction is hard to discover."**
> 
> While we warmly welcome code contributions, **our most critical need today is feedback from Early Adopters** who are pushing AI agents to their limits on real codebases.

If you are using **Claude Code**, **Cursor**, **Windsurf**, **Google Antigravity**, or custom agent loops, you can shape the future of deterministic agent memory without writing a single line of TypeScript:

### How You Can Help as an Early Adopter:
1. **Plug Manthan into a Real Repository:**
   Run `manthan init` in an active codebase. Let your AI agent read and write state during your daily coding sessions.
2. **Battle-Test Deterministic Recall vs. Vector DBs:**
   Does sub-5ms BM25 lexical search with Git SHA provenance solve the context drift and silent hallucinations you experienced with probabilistic vector stores (Mem0, Zep, Pinecone)?
3. **Test State Supersession & Handoffs:**
   Does your agent cleanly update and supersede older decisions using `supersedes_id`? Where does it struggle?
4. **Evaluate Constitutional Guardrails:**
   Try proposing project laws via `propose_constitution_rule`. How does the human-in-the-loop review workflow feel for your team?
5. **Tell Us What Breaks or Feels Awkward:**
   - Open a **[GitHub Issue](https://github.com/kidakaka/manthan-mcp/issues)** with reproduction steps, error logs, or OS edge cases.
   - Start a **[GitHub Discussion](https://github.com/kidakaka/manthan-mcp/discussions)** to share your prompt patterns, namespace conventions, and workflow tips.

---

## 💻 For Developers & Systems Engineers

If you want to get your hands dirty in the codebase, here is where we need engineering contributions:

### High-Impact Focus Areas:
- **npm & NPX Distribution:** Zero-clone execution support via `npx @manthan/mcp-server` (see detailed checklist in [`TODO.md`](TODO.md)).
- **MCP Client Config Presets & Extensions:** One-click configurations and sidecars for Claude Desktop, Cursor, Windsurf, OpenCode, and VS Code.
- **Search & Ranking Tuning:** Refining BM25 tokenizers, snippet window extraction, and multi-namespace ranking algorithms in [`src/storage/sqlite-indexer.ts`](src/storage/sqlite-indexer.ts).
- **Federated Multi-Repo Memory:** Supporting shared or submodule-mounted constitutional memory repositories across microservice fleets.
- **Observability Bridges:** Telemetry exporters connecting agent mutations to OpenTelemetry, Langfuse, or Manthan session traces.
- **Performance Benchmarks:** Stress-testing lexical search and Git indexing at 10,000+ memory documents.

---

## 📜 Table of Contents
1. [Code of Conduct](#-code-of-conduct)
2. [Development Environment Setup](#-development-environment-setup)
3. [Architecture Overview](#-architecture-overview)
4. [Coding Standards](#-coding-standards)
5. [Testing Guidelines](#-testing-guidelines)
6. [Submitting Pull Requests](#-submitting-pull-requests)
7. [Licensing & Legal](#-licensing--legal)

---

## 🕊️ Code of Conduct
We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please treat all contributors and maintainers with respect, empathy, and professional courtesy.

---

## 💻 Development Environment Setup

### Prerequisites
- **Node.js:** `>= 22.5.0` or `24 LTS` (required for built-in `node:sqlite` DatabaseSync with FTS5).
- **Git:** `>= 2.40.0`
- **npm:** `>= 10.0.0`

### 1. Fork & Clone
```bash
git clone https://github.com/kidakaka/manthan-mcp.git
cd manthan-mcp
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Build TypeScript
```bash
npm run build
```
This compiles the TypeScript source from `src/` to `dist/`.

### 4. Run Integration Tests
```bash
npm test
```

### 5. Link CLI for Local Testing
To test the CLI locally during development:
```bash
npm run manthan -- --help
```

---

## 🏛️ Architecture Overview

The repository is modular and decoupled into distinct layers:

```text
manthan-mcp/
├── src/
│   ├── index.ts                # Commander CLI (init, serve, status, reindex)
│   ├── server.ts               # McpServer initialization & StdioServerTransport
│   ├── config/
│   │   └── schema.ts           # Zod validation for .manthan.yaml & Frontmatter (OKF v0.2)
│   ├── storage/
│   │   ├── git-engine.ts       # simple-git wrapper for atomic commits & audit lineage
│   │   ├── markdown-store.ts   # File I/O + YAML frontmatter parsing/serialization
│   │   └── sqlite-indexer.ts   # node:sqlite FTS5 BM25 search sidecar
│   └── tools/
│       ├── recall-memory.ts    # Recall active memory & constitution guardrails
│       ├── commit-memory.ts    # Atomic state write, superseding, & Git commit
│       ├── propose-rule.ts     # Guardrail promotion with status: draft
│       ├── audit-lineage.ts    # Chronological Git history & diff audit trail
│       ├── sync-index.ts       # Sidecar maintenance & reindexing
│       └── fetch-tags-keywords.ts # Multi-tag & BM25 keyword fetch harness
└── tests/
    └── e2e-memory-flow.test.ts # Automated end-to-end integration test suite
```

### Key Design Principles:
1. **Zero Native C++ Compilation:** We deliberately use Node's built-in `node:sqlite` (`DatabaseSync`) rather than `better-sqlite3` to ensure zero compilation barriers across Windows, macOS, and Linux.
2. **Git is the Source of Truth:** The SQLite FTS5 index is strictly an ephemeral sidecar cache. Any data in `.manthan/index.db` can be completely rebuilt from `.manthan/memory/` at any time via `manthan reindex`.
3. **Stdio Protocol Purity:** **NEVER** use `console.log` in MCP server code or tools. `stdout` is exclusively reserved for JSON-RPC transport frames. All logging and diagnostics must use `console.error`.

---

## 📐 Coding Standards

- **TypeScript Strict Mode:** All code must be strictly typed. Avoid `any` where a concrete type or interface can be written.
- **NodeNext Modules:** Use ESM import syntax with explicit `.js` extensions for relative imports:
  ```typescript
  import { SqliteIndexer } from '../storage/sqlite-indexer.js';
  ```
- **License Headers:** Every new TypeScript source file must include the SPDX Apache-2.0 header:
  ```typescript
  // SPDX-License-Identifier: Apache-2.0
  // Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors
  ```
- **Conventional Commits:** Commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
  - `feat(tool): add semantic filtering to recall_memory`
  - `fix(git): handle detached head gracefully in getHeadSha`
  - `docs(readme): add Cursor MCP configuration example`
  - `test(indexer): add BM25 ranking edge-case test`

---

## 🧪 Testing Guidelines

- We use Node's native test runner with `tsx` (`node --import tsx --test`).
- Any new feature, storage modification, or MCP tool **must include automated tests** in `tests/`.
- Tests should operate in isolated temporary directories using `fs.mkdtempSync` and cleanly close database handles in teardown hooks.
- To run tests before submitting:
  ```bash
  npm run build
  npm test
  ```

---

## 🚀 Submitting Pull Requests

1. **Create a Feature Branch:**
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Write Clean, Tested Code:**
   Ensure `npm run build` and `npm test` pass with zero warnings or errors.
3. **Commit Your Changes:**
   Use descriptive conventional commit messages.
4. **Push to Your Fork:**
   ```bash
   git push origin feat/your-feature-name
   ```
5. **Open a Pull Request:**
   - Clearly explain **what** changed and **why**.
   - Include test results or a reproduction snippet.
   - Reference any relevant GitHub issues.

---

## 📄 Licensing & Legal

Manthan is licensed under the **[Apache License, Version 2.0](LICENSE)**.

By contributing to this repository, you agree that your contributions will be licensed under the Apache License, Version 2.0, with an express grant of patent and copyright rights as defined in Section 2 and Section 3 of the Apache 2.0 license.
