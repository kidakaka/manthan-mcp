# 🏛️ Manthan (`@manthan/mcp-server`)

> **Commercial-Grade, Git-Native, Deterministic Memory Engine for AI Agents via Model Context Protocol (MCP)**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.5%20%7C%2024%20LTS-brightgreen.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.32.2-purple.svg)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/License-Apache%202.0-yellow.svg)](LICENSE)

Unlike probabilistic vector-only memory layers that suffer from black-box semantic drift and silent hallucinations, **Manthan** treats agent memory as **version-controlled state ("Memory-as-Code")**.

- **Git is the Single Source of Truth:** Every state update, architectural decision, and session handoff is an atomic Git commit with full author-agent and observability trace metadata.
- **Embedded SQLite FTS5 Sidecar Index:** Uses Node's built-in `node:sqlite` (`DatabaseSync` with BM25 ranking) for **sub-5ms** deterministic lexical retrieval with zero native C++ compilation dependencies on Windows, Linux, and macOS.
- **Git Commit SHA Provenance:** Every memory recall operation returns cryptographic commit SHA provenance, providing reproducible time-travel and compliance auditing.

---

## 🏗️ Architecture & Multi-Scope Memory

Manthan is completely self-contained and operates out-of-the-box in any repository via a declarative `.manthan.yaml` manifest:

```
workspace/
├── .manthan.yaml               # Declarative engine configuration
└── .manthan/
    ├── index.db                # Ephemeral SQLite FTS5 BM25 search sidecar (gitignored)
    └── memory/
        ├── working/            # Active mutable memory (Read/Write)
        │   └── backend/
        │       └── mem_01j9x8.md
        └── constitution/       # Architectural guardrails & ADRs (Read-only)
            └── core/
                └── ADR-001.md
```

### 1. Active Memory Store (`working` Layer — Default)
- Stores live project state, episodic session decisions, task handoffs, and evolving specifications as structured Markdown files with strict YAML frontmatter.
- **Access Policy:** Read/Write via MCP tools. Every mutation validates against a strict Zod schema and generates an atomic Git commit with metadata (`author_agent`, `trace_id`, `supersedes`).

### 2. Constitutional Memory (`constitution` Layer — Guardrail Tier)
- Stores non-negotiable architectural rules, ADRs, and project conventions inside `.manthan/memory/constitution/`.
- **Access Policy:** Read-only during standard agent task execution so models cannot accidentally overwrite or drift core project laws. Always prioritized in `recall_memory` responses. Agents propose additions using `propose_constitution_rule` (staged as `draft` for human review).

---

## 📋 Standardized Memory Artifact Schema

Every memory artifact is stored as a standard `.md` file with strict YAML frontmatter:

```markdown
---
id: "mem_01j9x8k2m"
title: "API Idempotency Key Header Standard"
layer: "working" # "working" | "constitution"
namespace: "backend/payments" # Logical topic or directory slug
status: "active" # "active" | "superseded" | "draft" | "archived"
author_agent: "claude-code"
trace_id: "tr_98234792"
supersedes: null # Optional ID of previous memory artifact
tags: ["idempotency", "api", "payments"]
updated_at: "2026-11-09T10:00:00.000Z"
---

## Context & Decision
All payment mutation endpoints must accept and validate a unique `Idempotency-Key` header.
```

---

## 🛠️ MCP Tools Specification

Manthan exposes 5 deterministic tools to any MCP-compliant client:

| Tool | Purpose | Key Inputs | Key Outputs |
| :--- | :--- | :--- | :--- |
| `recall_memory` | Lexical BM25 search across state & guardrails | `query`, `namespace`, `tags`, `include_constitution`, `limit` | JSON bundle of `constitution_rules` & `working_memories` with Git commit SHAs |
| `commit_memory` | Atomic state write with Git commit & FTS indexing | `namespace`, `title`, `content`, `tags`, `author_agent`, `trace_id`, `supersedes_id` | Commit SHA, artifact path, and confirmation |
| `propose_constitution_rule` | Propose architectural law or ADR for review | `title`, `content`, `namespace`, `rationale`, `author_agent`, `source_memory_id` | Draft artifact path and human review guidance |
| `audit_memory_lineage` | Provenance audit and time-travel history | `memory_id` or `file_path`, `max_commits` | Chronological commit history, agent author, and diff summary |
| `sync_memory_index` | Sidecar index maintenance & cache refresh | `force_rebuild` | Indexed counts, duration, and synchronized Git HEAD SHA |

---

## ⚙️ Declarative Configuration (`.manthan.yaml`)

```yaml
version: "1.0"
project: "my-project"

storage:
  root_dir: ".manthan/memory"
  working_dir: ".manthan/memory/working"
  constitution_dir: ".manthan/memory/constitution"
  index_db_path: ".manthan/index.db"

git:
  auto_commit: true
  branch_strategy: "direct" # "direct" | "session-branch"
  commit_prefix: "chore(manthan):"

governance:
  prioritize_constitution_on_recall: true
  allow_direct_constitution_writes: false
```

---

## 🚀 Quickstart

### 1. Initialize Manthan in your repository
```bash
npx @manthan/mcp-server init
```
This automatically:
- Creates `.manthan.yaml` with default settings.
- Creates directory structures for `working` and `constitution` memories.
- Adds `.manthan/index.db*` to `.gitignore`.
- Initializes Git (if not already initialized).
- Seeds initial constitutional rules (`ADR-001`) and working memories.
- Builds the local SQLite FTS5 search index.

### 2. Inspect status
```bash
npx @manthan/mcp-server status
```

---

## 🔌 Client Integration

### 1. Claude Desktop & Claude Code
Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "manthan": {
      "command": "npx",
      "args": ["-y", "@manthan/mcp-server", "serve"]
    }
  }
}
```

Or for local development:
```json
{
  "mcpServers": {
    "manthan": {
      "command": "node",
      "args": ["C:/code/manthan-mcp/dist/index.js", "serve"]
    }
  }
}
```

### 2. Cursor
In `.cursor/mcp.json` (or Cursor Settings > Features > MCP):

```json
{
  "mcpServers": {
    "manthan": {
      "command": "npx",
      "args": ["-y", "@manthan/mcp-server", "serve"]
    }
  }
}
```

### 3. Google Antigravity
Add to your Antigravity MCP configuration (`~/.gemini/antigravity/mcp/manthan.json` or `config.json`):

```json
{
  "name": "manthan",
  "command": "npx",
  "args": ["-y", "@manthan/mcp-server", "serve"]
}
```

---

## 💻 CLI Commands Reference

- `manthan init [--dir <path>]`: Initialize memory storage and seed artifacts.
- `manthan serve [--dir <path>]`: Start the MCP server over stdio.
- `manthan status [--dir <path>]`: View memory counts, Git HEAD, and index health.
- `manthan reindex [--dir <path>]`: Force a complete rebuild of the SQLite FTS5 index.

---

## 🧪 Testing

Run the automated end-to-end integration test suite:

```bash
npm test
```

The test verifies:
1. Workspace initialization and Git repository detection.
2. Atomic `commit_memory` execution and Git SHA stamping.
3. Sub-5ms BM25 lexical recall with `recall_memory`.
4. State supersession (marking v1 as `superseded`, creating v2 as `active`, excluding superseded items from recall).
5. Constitutional rule proposal and staging with `status: draft`.
6. Audit lineage retrieval via Git commit logs.
7. Full FTS5 sidecar index rebuilding and HEAD SHA synchronization.

---

## 📄 License

Licensed under the [Apache License, Version 2.0](LICENSE) (the "License").  
You may not use this software except in compliance with the License.

Copyright © 2026 Prasad Ajinkya and Manthan Contributors.
