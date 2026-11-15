// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { matchesGlob } from 'node:path/posix';
import {
  MemoryArtifact,
  ResolvedManthanConfig,
} from '../config/schema.js';

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

export interface NamespaceNode {
  name: string;
  path: string;
  active_count: number;
  stale_count: number;
  constitution_count: number;
  total_count: number;
  children: NamespaceNode[];
}

export class SqliteIndexer {
  private db: DatabaseSync | null = null;
  private dbPath: string;
  private config: ResolvedManthanConfig;

  constructor(config: ResolvedManthanConfig) {
    this.config = config;
    this.dbPath = config.resolved_paths.index_db_path;
  }

  /**
   * Initializes SQLite connection and sets up tables if needed.
   */
  getDatabase(): DatabaseSync {
    if (this.db) {
      return this.db;
    }

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const db = new DatabaseSync(this.dbPath);
    // Enable WAL mode for high concurrent read performance
    try {
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA synchronous = NORMAL;');
    } catch {
      // Ignore if PRAGMA is restricted
    }

    this.initSchema(db);
    this.db = db;
    return db;
  }

  private initSchema(db: DatabaseSync): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS index_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

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

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        id UNINDEXED,
        title,
        namespace,
        tags,
        content
      );
    `);

    // Defensive table migration for existing v0.3.x databases
    try {
      const cols = db.prepare('PRAGMA table_info(memories)').all() as { name: string }[];
      const colNames = new Set(cols.map((c) => c.name));
      if (!colNames.has('stale_after')) {
        try {
          db.exec('ALTER TABLE memories ADD COLUMN stale_after TEXT;');
        } catch {}
      }
      if (!colNames.has('valid_until')) {
        try {
          db.exec('ALTER TABLE memories ADD COLUMN valid_until TEXT;');
        } catch {}
      }
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_memories_lifecycle ON memories (layer, status, valid_until, stale_after);
        CREATE INDEX IF NOT EXISTS idx_memories_namespace ON memories (namespace);
      `);
    } catch {
      // Ignore migration errors if table doesn't exist yet
    }
  }

  /**
   * Closes database handle cleanly.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Drops all indexed data and recreates tables.
   */
  forceRebuild(): void {
    const db = this.getDatabase();
    db.exec(`
      DROP TABLE IF EXISTS memories_fts;
      DROP TABLE IF EXISTS memories;
      DROP TABLE IF EXISTS index_metadata;
    `);
    this.initSchema(db);
  }

  /**
   * Gets metadata value such as current indexed git_head_sha.
   */
  getMetadata(key: string): string | null {
    const db = this.getDatabase();
    const row = db.prepare('SELECT value FROM index_metadata WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row ? row.value : null;
  }

  /**
   * Sets metadata value.
   */
  setMetadata(key: string, value: string): void {
    const db = this.getDatabase();
    db.prepare('INSERT OR REPLACE INTO index_metadata (key, value) VALUES (?, ?)').run(key, value);
  }

  /**
   * Indexes a single memory artifact into both relational store and FTS5 index.
   */
  indexMemory(artifact: MemoryArtifact, gitCommitSha?: string | null): void {
    const db = this.getDatabase();
    const { frontmatter, content, file_path } = artifact;

    const tagsJson = JSON.stringify(frontmatter.tags || []);
    const tagsString = (frontmatter.tags || []).join(' ');

    // 1. Upsert into relational memories table
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO memories (
        id, title, layer, namespace, status, author_agent,
        trace_id, supersedes, tags, updated_at, stale_after, valid_until,
        file_path, git_commit_sha, content
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      frontmatter.id,
      frontmatter.title,
      frontmatter.layer,
      frontmatter.namespace,
      frontmatter.status,
      frontmatter.author_agent,
      frontmatter.trace_id ?? null,
      frontmatter.supersedes ?? null,
      tagsJson,
      frontmatter.updated_at,
      frontmatter.stale_after ?? null,
      frontmatter.valid_until ?? null,
      file_path,
      gitCommitSha ?? artifact.git_commit_sha ?? null,
      content
    );

    // 2. Synchronize FTS5 index (delete existing, then insert)
    db.prepare('DELETE FROM memories_fts WHERE id = ?').run(frontmatter.id);
    db.prepare(`
      INSERT INTO memories_fts (id, title, namespace, tags, content)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      frontmatter.id,
      frontmatter.title,
      frontmatter.namespace,
      tagsString,
      content
    );
  }

  /**
   * Sanitizes a natural language query for SQLite FTS5 syntax.
   */
  private buildFtsQuery(rawQuery: string): string {
    // Remove characters that have special FTS5 operators meaning: * " ' : ^ ( )
    const terms = rawQuery
      .replace(/[^\p{L}\p{N}_\-\s]/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    if (terms.length === 0) {
      return '';
    }

    // Match each term as prefix or exact
    return terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' OR ');
  }

  /**
   * Performs BM25-ranked recall across memories with optional filtering.
   */
  search(options: SearchOptions): RecallMemoryResponse {
    const db = this.getDatabase();
    const query = options.query?.trim() || '';
    const includeConstitution = options.include_constitution ?? true;
    const limit = options.limit ?? 5;
    const excludeSuperseded = options.exclude_superseded ?? true;
    const includeStale = options.include_stale ?? false;
    const nowIso = new Date().toISOString();

    const ftsQuery = query ? this.buildFtsQuery(query) : '';

    let sql = '';
    const params: any[] = [];

    if (ftsQuery) {
      const weights = this.config.retrieval?.bm25_weights;
      const wTitle = typeof weights?.title === 'number' ? weights.title : 5.0;
      const wNamespace = typeof weights?.namespace === 'number' ? weights.namespace : 2.0;
      const wTags = typeof weights?.tags === 'number' ? weights.tags : 3.0;
      const wContent = typeof weights?.content === 'number' ? weights.content : 1.0;

      // Query with BM25 FTS ranking using column weights (0.0 for unindexed id, followed by title, namespace, tags, content)
      sql = `
        SELECT
          m.id, m.title, m.layer, m.namespace, m.status, m.author_agent,
          m.trace_id, m.supersedes, m.tags, m.updated_at, m.stale_after, m.valid_until,
          m.file_path, m.git_commit_sha, m.content,
          bm25(memories_fts, 0.0, ${wTitle}, ${wNamespace}, ${wTags}, ${wContent}) as score
        FROM memories_fts f
        JOIN memories m ON f.id = m.id
        WHERE memories_fts MATCH ?
      `;
      params.push(ftsQuery);
    } else {
      // No text query: order by updated_at descending
      sql = `
        SELECT
          m.id, m.title, m.layer, m.namespace, m.status, m.author_agent,
          m.trace_id, m.supersedes, m.tags, m.updated_at, m.stale_after, m.valid_until,
          m.file_path, m.git_commit_sha, m.content,
          0 as score
        FROM memories m
        WHERE 1=1
      `;
    }

    // Filter out superseded or archived if requested
    if (excludeSuperseded) {
      sql += ` AND m.status NOT IN ('superseded', 'archived')`;
    }

    // Filter by constitution layer if excluded
    if (!includeConstitution) {
      sql += ` AND m.layer != 'constitution'`;
    }

    // Filter by namespace (supporting glob patterns and static prefix SQL pruning)
    let isGlobNamespace = false;
    if (options.namespace) {
      if (options.namespace.includes('*') || options.namespace.includes('?')) {
        isGlobNamespace = true;
        const wildcardIdx = options.namespace.search(/[*?]/);
        const staticPrefix = wildcardIdx > 0
          ? options.namespace.slice(0, wildcardIdx).replace(/\/+$/, '')
          : '';
        if (staticPrefix) {
          sql += ` AND (m.namespace = ? OR m.namespace LIKE ? || '/%')`;
          params.push(staticPrefix, staticPrefix);
        }
      } else {
        sql += ` AND (m.namespace = ? OR m.namespace LIKE ? || '/%')`;
        params.push(options.namespace, options.namespace);
      }
    }

    // Multi-tier sorting:
    // Tier 1: non-soft-stale first (0), soft-stale last (1)
    // Tier 2: BM25 score ascending (more negative = more relevant in SQLite FTS5)
    // Tier 3: updated_at descending
    sql += `
      ORDER BY (
        CASE WHEN (m.layer = 'working' AND m.stale_after IS NOT NULL AND m.stale_after <= ?) THEN 1 ELSE 0 END
      ) ASC, score ASC, m.updated_at DESC
    `;
    params.push(nowIso);

    // Fetch candidate rows
    const rows = db.prepare(sql).all(...params) as any[];

    // In-memory glob namespace filtering if namespace has wildcards
    let filteredRows = rows;
    if (isGlobNamespace && options.namespace) {
      const globPattern = options.namespace;
      filteredRows = filteredRows.filter((r) =>
        matchesGlob(r.namespace, globPattern)
      );
    }

    // In-memory tags filtering if tags provided
    if (options.tags && options.tags.length > 0) {
      const searchTags = options.tags.map((t) => t.toLowerCase());
      filteredRows = filteredRows.filter((r) => {
        try {
          const itemTags: string[] = JSON.parse(r.tags || '[]');
          const itemTagsLower = itemTags.map((t) => t.toLowerCase());
          return searchTags.some((tag) => itemTagsLower.includes(tag));
        } catch {
          return false;
        }
      });
    }

    let staleExcludedCount = 0;
    const mapped: MemorySearchResult[] = [];

    for (const r of filteredRows) {
      const isConstitutionRule = r.layer === 'constitution';
      const isExpired = !isConstitutionRule && Boolean(r.valid_until && r.valid_until <= nowIso);
      const isStale = !isConstitutionRule && (
        Boolean(r.stale_after && r.stale_after <= nowIso) || isExpired
      );

      // Exclude hard-expired working memories unless includeStale is true
      if (isExpired && !includeStale) {
        staleExcludedCount++;
        continue;
      }

      let parsedTags: string[] = [];
      try {
        parsedTags = JSON.parse(r.tags);
      } catch {
        parsedTags = [];
      }

      mapped.push({
        id: r.id,
        title: r.title,
        layer: r.layer as 'working' | 'constitution',
        namespace: r.namespace,
        status: r.status,
        author_agent: r.author_agent,
        trace_id: r.trace_id,
        supersedes: r.supersedes,
        tags: parsedTags,
        updated_at: r.updated_at,
        stale_after: r.stale_after ?? null,
        valid_until: r.valid_until ?? null,
        is_stale: isStale,
        is_expired: isExpired,
        file_path: r.file_path,
        git_commit_sha: r.git_commit_sha,
        content: r.content,
        relevance_score: r.score !== undefined ? Number(r.score) : undefined,
      });
    }

    // Segregate into constitution_rules and working_memories
    const constitutionRules = mapped
      .filter((m) => m.layer === 'constitution')
      .slice(0, limit);

    const workingMemories = mapped
      .filter((m) => m.layer === 'working')
      .slice(0, limit);

    return {
      constitution_rules: constitutionRules,
      working_memories: workingMemories,
      total_count: constitutionRules.length + workingMemories.length,
      stale_excluded_count: staleExcludedCount,
    };
  }

  /**
   * Builds and returns a structured namespace hierarchy tree with cumulative count rollups.
   */
  getNamespaceHierarchy(): NamespaceNode {
    const db = this.getDatabase();
    const rows = db.prepare(`
      SELECT namespace, layer, status, stale_after, valid_until
      FROM memories
    `).all() as Array<{
      namespace: string;
      layer: string;
      status: string;
      stale_after: string | null;
      valid_until: string | null;
    }>;

    const nowIso = new Date().toISOString();

    interface InternalNode {
      name: string;
      path: string;
      active_count: number;
      stale_count: number;
      constitution_count: number;
      total_count: number;
      childrenMap: Map<string, InternalNode>;
    }

    const root: InternalNode = {
      name: 'root',
      path: '',
      active_count: 0,
      stale_count: 0,
      constitution_count: 0,
      total_count: 0,
      childrenMap: new Map(),
    };

    for (const row of rows) {
      const isConstitution = row.layer === 'constitution';
      const isExpired = !isConstitution && Boolean(row.valid_until && row.valid_until <= nowIso);
      const isStale = !isConstitution && (
        Boolean(row.stale_after && row.stale_after <= nowIso) ||
        isExpired ||
        row.status === 'archived' ||
        row.status === 'deprecated'
      );
      const isActive = !isConstitution && !isStale && row.status === 'active';

      const segments = row.namespace.split('/').map((s) => s.trim()).filter(Boolean);
      let curr = root;
      let currPath = '';

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        currPath = currPath ? `${currPath}/${seg}` : seg;
        if (!curr.childrenMap.has(seg)) {
          curr.childrenMap.set(seg, {
            name: seg,
            path: currPath,
            active_count: 0,
            stale_count: 0,
            constitution_count: 0,
            total_count: 0,
            childrenMap: new Map(),
          });
        }
        curr = curr.childrenMap.get(seg)!;
      }

      // Increment leaf node counts
      curr.total_count += 1;
      if (isConstitution) {
        curr.constitution_count += 1;
      } else if (isStale) {
        curr.stale_count += 1;
      } else if (isActive) {
        curr.active_count += 1;
      }
    }

    // Convert InternalNode tree to NamespaceNode and recursively rollup counts
    function rollup(node: InternalNode): NamespaceNode {
      const children: NamespaceNode[] = [];
      const sortedKeys = Array.from(node.childrenMap.keys()).sort();

      for (const key of sortedKeys) {
        const childInternal = node.childrenMap.get(key)!;
        const childResult = rollup(childInternal);
        children.push(childResult);
        node.active_count += childResult.active_count;
        node.stale_count += childResult.stale_count;
        node.constitution_count += childResult.constitution_count;
        node.total_count += childResult.total_count;
      }

      return {
        name: node.name,
        path: node.path,
        active_count: node.active_count,
        stale_count: node.stale_count,
        constitution_count: node.constitution_count,
        total_count: node.total_count,
        children,
      };
    }

    return rollup(root);
  }

  /**
   * Retrieves summary counts for CLI status reporting.
   */
  getStatusCounts(): {
    total: number;
    working_active: number;
    working_superseded: number;
    constitution_active: number;
    constitution_draft: number;
  } {
    const db = this.getDatabase();
    const rows = db.prepare(`
      SELECT layer, status, COUNT(*) as cnt
      FROM memories
      GROUP BY layer, status
    `).all() as Array<{ layer: string; status: string; cnt: number }>;

    let total = 0;
    let working_active = 0;
    let working_superseded = 0;
    let constitution_active = 0;
    let constitution_draft = 0;

    for (const r of rows) {
      const count = Number(r.cnt);
      total += count;
      if (r.layer === 'working') {
        if (r.status === 'active') working_active += count;
        if (r.status === 'superseded') working_superseded += count;
      } else if (r.layer === 'constitution') {
        if (r.status === 'active') constitution_active += count;
        if (r.status === 'draft') constitution_draft += count;
      }
    }

    return {
      total,
      working_active,
      working_superseded,
      constitution_active,
      constitution_draft,
    };
  }
}
