---
id: rule_01_core_architecture
title: Deterministic Memory & Git Single Source of Truth
layer: constitution
namespace: architecture/core
status: active
author_agent: system
tags:
  - architecture
  - git
  - constitution
  - adr
updated_at: '2026-11-09T10:07:59.074Z'
---
# ADR-001: Deterministic Memory-as-Code

All agent memory mutations MUST be version-controlled in Git and backed by the local SQLite FTS5 index.
Constitutional guardrails cannot be directly overwritten by agents during standard task execution.
Agents may propose additions via `propose_constitution_rule` for human review.
