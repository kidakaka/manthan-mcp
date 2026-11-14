# 🏛️ Manthan ([`@kidakaka/manthan-mcp`](https://www.npmjs.com/package/@kidakaka/manthan-mcp))

> **Commercial-Grade, Git-Native, Deterministic Memory Engine for AI Agents via Model Context Protocol (MCP)**

[![npm version](https://img.shields.io/npm/v/@kidakaka/manthan-mcp.svg?color=cb3837&logo=npm)](https://www.npmjs.com/package/@kidakaka/manthan-mcp)
[![npm downloads](https://img.shields.io/npm/dt/@kidakaka/manthan-mcp.svg?color=blue)](https://www.npmjs.com/package/@kidakaka/manthan-mcp)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.5%20%7C%2024%20LTS-brightgreen.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.32.2-purple.svg)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/License-Apache%202.0-yellow.svg)](LICENSE)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%99%A5-pink)](https://github.com/sponsors/kidakaka)

Unlike probabilistic vector-only memory layers that suffer from black-box semantic drift and silent hallucinations, **Manthan** treats agent memory as **version-controlled state ("Memory-as-Code")**.

- **Git is the Single Source of Truth:** Every state update, architectural decision, and session handoff is an atomic Git commit with full author-agent and observability trace metadata.
- **Embedded SQLite FTS5 Sidecar Index:** Uses Node's built-in `node:sqlite` (`DatabaseSync` with BM25 ranking) for **sub-5ms** deterministic lexical retrieval with zero native C++ compilation dependencies on Windows, Linux, and macOS.
- **Git Commit SHA Provenance:** Every memory recall operation returns cryptographic commit SHA provenance, providing reproducible time-travel and compliance auditing.

> [!IMPORTANT]
> ### 📢 Calling Early Adopters & Agent Builders!
> **We need real-world user feedback more than code contributions right now.**  
> If you are building with **Claude Code**, **Cursor**, **Windsurf**, or **Google Antigravity**, we want your feedback: Does deterministic Git-backed memory eliminate the state drift and hallucinations you experience with probabilistic vector stores?  
> 👉 **[Read our Early Adopter & Contributor Guide](CONTRIBUTING.md#-our-1-priority-early-adopters--real-world-feedback)** | 💬 **[Join GitHub Discussions](https://github.com/kidakaka/manthan-mcp/discussions)**

---

## 🌊 The Origin & Etymology of "Manthan" (मंथन)

> *"Out of the turbulent ocean of chaotic noise, deep contemplation churns the immortal nectar of truth."*

**Manthan** (मन्थन) is an ancient Sanskrit word originating from the root ***manth*** (मन्थ्), which translates to **"to churn, vigorously agitate, deeply contemplate, and extract the concentrated essence from vast substance."**

In Indian philosophy and classical Vedic epics (such as the *Mahabharata* and *Bhagavata Purana*), the term finds its definitive mythic expression in **Samudra Manthan** (समुद्र मन्थन — *The Churning of the Cosmic Ocean*). When the forces of light (*Devas*) and darkness (*Asuras*) churned the primordial ocean of chaos, they churned through the deadly, volatile poisons (*Halahala*) to extract the supreme divine treasures (*Ratnas*) and the ultimate prize: **Amrita** (अमृत) — the immortal nectar of eternal life, truth, and absolute clarity.

### Why Was This Name Chosen for This Engine?

In modern software engineering with autonomous AI agents, models operate inside a vast, turbulent, and noisy ocean of **ephemeral tokens, fleeting scratchpads, and probabilistic hallucinations**:

1. **Churning the Ocean of Ephemeral Context:**  
   During real-world development, AI agents generate tens of thousands of tokens of intermediate trial-and-error, debug outputs, and transient hypotheses. If left uncurated, this context degrades into token exhaustion, context drift, and silent hallucinations. **Manthan** acts as the cognitive churning rod — actively stirring through this raw stream, discarding the volatile noise, and distilling the essential truths of your codebase.

2. **From Fleeting Noise to Immortal State (*Amrita*):**  
   In Indian thought, *Amrita* is that which cannot die (*a-mrita* = deathless). When an agent commits an architectural decision or constitutional rule in Manthan, it is not lost when a context window closes or an LLM session restarts. It is forged into an **immutable, cryptographically signed Git commit** backed by sub-5ms BM25 retrieval — conferring permanence, reproducibility, and time-travel lineage upon the agent's memory.

3. **Contemplative Cognition (*Manan*):**  
   *Manthan* is intimately linked to the Sanskrit concept of ***Manan*** (मनन) — rigorous intellectual contemplation, inner reflection, and conscious discernment. Rather than treating memory as an opaque, black-box vector database that drifts unpredictably, Manthan treats memory as **version-controlled state ("Memory-as-Code")** that humans and agents can consciously audit, debate, and evolve.

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

Manthan exposes 6 deterministic tools to any MCP-compliant client:

| Tool | Purpose | Key Inputs | Key Outputs |
| :--- | :--- | :--- | :--- |
| `recall_memory` | Lexical BM25 search across state & guardrails | `query`, `namespace`, `tags`, `include_constitution`, `limit` | JSON bundle of `constitution_rules` & `working_memories` with Git commit SHAs |
| `commit_memory` | Atomic state write with Git commit & FTS indexing | `namespace`, `title`, `content`, `tags`, `author_agent`, `trace_id`, `supersedes_id` | Commit SHA, artifact path, and confirmation |
| `propose_constitution_rule` | Propose architectural law or ADR for review | `title`, `content`, `namespace`, `rationale`, `author_agent`, `source_memory_id` | Draft artifact path and human review guidance |
| `audit_memory_lineage` | Provenance audit and time-travel history | `memory_id` or `file_path`, `max_commits` | Chronological commit history, agent author, and diff summary |
| `sync_memory_index` | Sidecar index maintenance & cache refresh | `force_rebuild` | Indexed counts, duration, and synchronized Git HEAD SHA |
| `fetch_by_tags_and_keywords` | Tag-filtered BM25 retrieval with snippet extraction | `tags`, `tag_mode`, `keywords`, `doc_type`, `trust_tier`, `limit`, `snippets` | Compact excerpt list and OKF v0.2 matching documents |

---

## 📦 Native MCP Resources (`manthan://...`)

Manthan exposes live MCP Resources that clients (Claude, Cursor, Antigravity) can read directly into their context window without burning a tool turn:

| URI | Type | Purpose | Content |
| :--- | :--- | :--- | :--- |
| `manthan://constitution` | `text/markdown` | Zero-turn guardrail injection | Active architectural rules & ADRs |
| `manthan://active-context` | `text/markdown` | Active working context snapshot | Active episodic memories & handoffs |
| `manthan://status` | `application/json` | Telemetry & engine health | Memory counts, Git HEAD SHA & BM25 config |

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

retrieval:
  bm25_weights:
    title: 5.0      # Boost title matches 5x
    tags: 3.0       # Boost tag matches 3x
    namespace: 2.0  # Boost namespace matches 2x
    content: 1.0    # Base content body weight
```

---

## 🚀 Quickstart & Frictionless Setup

> 💡 **Zero Background Daemons Needed!**  
> Unlike traditional servers, you **never** need to keep a terminal open running `manthan serve`. Your LLM client (Cursor, Claude Desktop, VS Code) launches Manthan automatically in the background as an isolated sidecar process over stdio.

### 1. Initialize Manthan in your repository
```bash
npx @kidakaka/manthan-mcp init
```
This automatically:
- Creates `.manthan.yaml` with declarative settings.
- Creates directory structures for `working` and `constitution` memories.
- Adds `.manthan/index.db*` to `.gitignore`.
- Initializes Git (if not already initialized).
- Seeds initial constitutional rules (`ADR-001`) and working memories.
- Builds the local SQLite FTS5 search index.
- **Auto-configures Cursor & VS Code:** Generates `.cursor/mcp.json` and `.vscode/mcp.json` in your repository so you can start immediately with zero manual configuration!

### 2. Auto-Link to Claude Desktop (1-Click)
To automatically connect Claude Desktop without touching JSON files or hunting down OS appdata paths:

```bash
npx @kidakaka/manthan-mcp link claude
```

*(You can also run `npx @kidakaka/manthan-mcp link all` to configure all detected LLM clients at once).*

### 3. Inspect Status
```bash
npx @kidakaka/manthan-mcp status
```

---

## 🔌 Manual Client Integration (Optional)

If you prefer to configure your client manually, add the following to your client's settings:

### 1. Claude Desktop
Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "manthan": {
      "command": "npx",
      "args": ["-y", "@kidakaka/manthan-mcp", "serve"]
    }
  }
}
```

### 2. Cursor
In `.cursor/mcp.json` *(already generated automatically by `manthan init`)*:

```json
{
  "mcpServers": {
    "manthan": {
      "command": "npx",
      "args": ["-y", "@kidakaka/manthan-mcp", "serve"]
    }
  }
}
```

### 3. VS Code / Copilot / Cline
In `.vscode/mcp.json` *(already generated automatically by `manthan init`)*:

```json
{
  "mcpServers": {
    "manthan": {
      "command": "npx",
      "args": ["-y", "@kidakaka/manthan-mcp", "serve"]
    }
  }
}
```

### 4. Google Antigravity
Add to your Antigravity MCP configuration (`~/.gemini/antigravity/mcp/manthan.json` or `config.json`):

```json
{
  "name": "manthan",
  "command": "npx",
  "args": ["-y", "@kidakaka/manthan-mcp", "serve"]
}
```

---

## 💻 CLI Commands Reference

- `manthan init [--dir <path>] [-c <client>]`: Initialize memory storage, seed artifacts, and generate client configs.
- `manthan link [claude|cursor|vscode|all]`: Automatically link the MCP server into your LLM client configuration.
- `manthan serve [--dir <path>]`: Start the MCP server over stdio (called automatically by LLM clients).
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

## 🤝 Contributing & Early Feedback

**We value real-world feedback from early adopters above everything else.**

- **If you are an agent developer or user:** Test Manthan in your repository and tell us what works, what breaks, and how your agent behaves with deterministic state handoffs.
- **If you are a systems/TypeScript engineer:** Help us expand MCP client presets, optimize BM25 tokenizers, and build multi-repo memory federation.

Please check out our **[Contributing Guide](CONTRIBUTING.md)** and **[Project Roadmap & TODO](TODO.md)** for our complete publishing checklist, discussion links, and local development instructions.

---

## 💖 Sponsorship & Support

If Manthan helps eliminate hallucination and state drift in your AI agents, consider supporting ongoing open-source maintenance via [GitHub Sponsors](https://github.com/sponsors/kidakaka).

---

## 📄 License

Licensed under the [Apache License, Version 2.0](LICENSE) (the "License").  
You may not use this software except in compliance with the License.

Copyright © 2026 Prasad Ajinkya and Manthan Contributors.
