// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import {
  MemoryArtifact,
  MemoryFrontmatter,
  MemoryFrontmatterSchema,
  normalizeMemoryFrontmatter,
  ResolvedManthanConfig,
} from '../config/schema.js';

const FRONTMATTER_REGEX = /^---[^\S\r\n]*\r?\n([\s\S]*?)\r?\n---[^\S\r\n]*(?:\r?\n|$)([\s\S]*)$/;

function parseFrontmatter(raw: string): { data: Record<string, any>; content: string } {
  const clean = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const match = clean.match(FRONTMATTER_REGEX);
  if (!match) {
    return { data: {}, content: clean };
  }
  const yamlStr = match[1].trim();
  const data = yamlStr ? (yaml.parse(yamlStr) || {}) : {};
  return { data, content: match[2] };
}

function stringifyFrontmatter(content: string, data: Record<string, any>): string {
  const yamlStr = yaml.stringify(data).trim();
  const trimmed = content.trim();
  return trimmed ? `---\n${yamlStr}\n---\n${trimmed}\n` : `---\n${yamlStr}\n---\n`;
}

export class MarkdownStore {
  private config: ResolvedManthanConfig;

  constructor(config: ResolvedManthanConfig) {
    this.config = config;
  }

  /**
   * Ensures necessary memory directory structure exists.
   */
  ensureDirectories(): void {
    const { working_dir, constitution_dir } = this.config.resolved_paths;
    if (!fs.existsSync(working_dir)) {
      fs.mkdirSync(working_dir, { recursive: true });
    }
    if (!fs.existsSync(constitution_dir)) {
      fs.mkdirSync(constitution_dir, { recursive: true });
    }
  }

  /**
   * Resolves the target file path for a memory based on layer, namespace, and ID.
   */
  resolveMemoryPath(layer: 'working' | 'constitution', namespace: string, id: string): string {
    const baseDir =
      layer === 'constitution'
        ? this.config.resolved_paths.constitution_dir
        : this.config.resolved_paths.working_dir;

    // Sanitize namespace for filesystem
    const sanitizedNamespace = namespace.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const dir = path.join(baseDir, sanitizedNamespace);
    return path.join(dir, `${id}.md`);
  }

  /**
   * Writes a memory artifact with YAML frontmatter to disk.
   */
  writeMemory(filePath: string, frontmatter: MemoryFrontmatter, content: string): MemoryArtifact {
    // Validate schema
    const validatedFrontmatter = MemoryFrontmatterSchema.parse(frontmatter);

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const fileContent = stringifyFrontmatter(content, validatedFrontmatter);
    fs.writeFileSync(filePath, fileContent, 'utf-8');

    return {
      frontmatter: validatedFrontmatter,
      content: content.trim(),
      file_path: filePath,
    };
  }

  /**
   * Reads and parses a memory artifact from disk.
   */
  readMemory(filePath: string): MemoryArtifact | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseFrontmatter(raw);
      const validatedFrontmatter = normalizeMemoryFrontmatter(parsed.data || {}, filePath);

      return {
        frontmatter: validatedFrontmatter,
        content: parsed.content.trim(),
        file_path: filePath,
      };
    } catch (err) {
      console.warn(`[Manthan] Warning: Failed to parse memory artifact at ${filePath}:`, err);
      return null;
    }
  }

  /**
   * Updates the frontmatter fields of an existing memory file.
   */
  updateFrontmatter(filePath: string, updates: Partial<MemoryFrontmatter>): MemoryArtifact {
    const existing = this.readMemory(filePath);
    if (!existing) {
      throw new Error(`Cannot update frontmatter: File not found at ${filePath}`);
    }

    const updatedFrontmatter = {
      ...existing.frontmatter,
      ...updates,
      updated_at: updates.updated_at || new Date().toISOString(),
    };

    return this.writeMemory(filePath, updatedFrontmatter as MemoryFrontmatter, existing.content);
  }

  /**
   * Recursively scans directories to retrieve all Markdown memory artifacts.
   */
  listAllMemories(): MemoryArtifact[] {
    const results: MemoryArtifact[] = [];
    const rootDir = this.config.resolved_paths.root_dir;

    if (!fs.existsSync(rootDir)) {
      return results;
    }

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const artifact = this.readMemory(fullPath);
          if (artifact) {
            results.push(artifact);
          }
        }
      }
    };

    walk(rootDir);
    return results;
  }

  /**
   * Finds a memory artifact by its ID by scanning memory files.
   */
  findMemoryById(id: string): MemoryArtifact | null {
    const all = this.listAllMemories();
    return all.find((m) => m.frontmatter.id === id) || null;
  }
}
