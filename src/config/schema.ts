import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';

// ==========================================
// 1. Manthan Configuration Schema (.manthan.yaml)
// ==========================================

export const StorageConfigSchema = z.object({
  root_dir: z.string().default('.manthan/memory'),
  working_dir: z.string().default('.manthan/memory/working'),
  constitution_dir: z.string().default('.manthan/memory/constitution'),
  index_db_path: z.string().default('.manthan/index.db'),
});

export const GitConfigSchema = z.object({
  auto_commit: z.boolean().default(true),
  branch_strategy: z.enum(['direct', 'session-branch']).default('direct'),
  commit_prefix: z.string().default('chore(manthan):'),
});

export const GovernanceConfigSchema = z.object({
  prioritize_constitution_on_recall: z.boolean().default(true),
  allow_direct_constitution_writes: z.boolean().default(false),
});

export const ManthanConfigSchema = z.object({
  version: z.string().default('1.0'),
  project: z.string().default('default-workspace'),
  storage: StorageConfigSchema.default({}),
  git: GitConfigSchema.default({}),
  governance: GovernanceConfigSchema.default({}),
});

export type ManthanConfig = z.infer<typeof ManthanConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type GitConfig = z.infer<typeof GitConfigSchema>;
export type GovernanceConfig = z.infer<typeof GovernanceConfigSchema>;

export interface ResolvedManthanConfig extends ManthanConfig {
  workspace_root: string;
  resolved_paths: {
    root_dir: string;
    working_dir: string;
    constitution_dir: string;
    index_db_path: string;
    config_file: string;
  };
}

// ==========================================
// 2. Memory Frontmatter Schema
// ==========================================

export const MemoryLayerEnum = z.enum(['working', 'constitution']);
export type MemoryLayer = z.infer<typeof MemoryLayerEnum>;

export const MemoryStatusEnum = z.enum([
  'active',
  'superseded',
  'draft',
  'archived',
  'accepted',
  'proposed',
  'deprecated',
  'wip',
]);
export type MemoryStatus = z.infer<typeof MemoryStatusEnum>;

export const MemoryFrontmatterSchema = z.object({
  id: z.string().min(1, 'Memory ID is required'),
  title: z.string().min(1, 'Title is required'),
  layer: MemoryLayerEnum.default('working'),
  namespace: z.string().min(1, 'Namespace is required'),
  status: MemoryStatusEnum.default('active'),
  author_agent: z.string().min(1, 'Author agent is required'),
  trace_id: z.string().nullable().optional(),
  supersedes: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  updated_at: z.string().min(1, 'Updated timestamp is required'),
});

export type MemoryFrontmatter = z.infer<typeof MemoryFrontmatterSchema>;

/**
 * Normalizes either standard Manthan frontmatter or Open Knowledge Format (OKF v0.2)
 * frontmatter into a validated MemoryFrontmatter object.
 */
export function normalizeMemoryFrontmatter(
  data: Record<string, any>,
  filePath: string
): MemoryFrontmatter {
  const baseName = path.basename(filePath, '.md');
  const id = data.id || baseName || generateMemoryId('mem');
  const title = data.title || baseName;
  const isConstitution =
    filePath.includes('constitution') ||
    data.layer === 'constitution' ||
    data.type === 'ADR';
  const layer = data.layer || (isConstitution ? 'constitution' : 'working');
  const namespace =
    data.namespace || data.type || (isConstitution ? 'architecture/adr' : 'general');
  const status = data.status || 'active';

  let author_agent = data.author_agent;
  if (!author_agent) {
    if (data.generated && typeof data.generated === 'object') {
      author_agent = data.generated.by;
    } else if (data.timestamp) {
      author_agent = 'legacy-author';
    } else {
      author_agent = 'system';
    }
  }

  let updated_at = data.updated_at;
  if (!updated_at) {
    if (data.generated && typeof data.generated === 'object') {
      updated_at = data.generated.at;
    } else if (data.timestamp) {
      updated_at = data.timestamp;
    } else {
      updated_at = new Date().toISOString();
    }
  }

  const tags = Array.isArray(data.tags)
    ? data.tags.map(String)
    : typeof data.tags === 'string'
      ? data.tags.split(',').map((t: string) => t.trim())
      : [];

  return MemoryFrontmatterSchema.parse({
    id: String(id),
    title: String(title),
    layer,
    namespace: String(namespace),
    status,
    author_agent: String(author_agent),
    trace_id: data.trace_id ?? null,
    supersedes: data.supersedes ?? null,
    tags,
    updated_at: String(updated_at),
  });
}

export interface MemoryArtifact {
  frontmatter: MemoryFrontmatter;
  content: string;
  file_path: string;
  git_commit_sha?: string;
}

// ==========================================
// 3. ID Generator Helper
// ==========================================

export function generateMemoryId(prefix: string = 'mem'): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}${randomPart}`;
}

// ==========================================
// 4. Configuration Loader
// ==========================================

export const DEFAULT_CONFIG: ManthanConfig = ManthanConfigSchema.parse({});

export function loadConfig(workspaceRoot: string = process.cwd()): ResolvedManthanConfig {
  const configFile = path.resolve(workspaceRoot, '.manthan.yaml');
  let rawParsed: Record<string, unknown> = {};

  if (fs.existsSync(configFile)) {
    try {
      const fileContents = fs.readFileSync(configFile, 'utf-8');
      rawParsed = (yaml.parse(fileContents) as Record<string, unknown>) || {};
    } catch (err) {
      console.warn(`[Manthan] Warning: Failed to parse .manthan.yaml at ${configFile}. Falling back to defaults.`, err);
    }
  }

  const parsedConfig = ManthanConfigSchema.parse(rawParsed);

  const resolvedPaths = {
    root_dir: path.resolve(workspaceRoot, parsedConfig.storage.root_dir),
    working_dir: path.resolve(workspaceRoot, parsedConfig.storage.working_dir),
    constitution_dir: path.resolve(workspaceRoot, parsedConfig.storage.constitution_dir),
    index_db_path: path.resolve(workspaceRoot, parsedConfig.storage.index_db_path),
    config_file: configFile,
  };

  return {
    ...parsedConfig,
    workspace_root: workspaceRoot,
    resolved_paths: resolvedPaths,
  };
}
