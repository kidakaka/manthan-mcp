// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

export interface TagMapping {
  original: string;
  mapped: string;
  distance: number;
}

export interface TagNormalizationResult {
  tags: string[];
  mappings: TagMapping[];
  unmapped: string[];
}

/**
 * Calculates the Levenshtein distance between two strings using dynamic programming.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const m = a.length;
  const n = b.length;
  const prevRow = new Array(n + 1);
  const currRow = new Array(n + 1);

  for (let j = 0; j <= n; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    const aChar = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const bChar = b.charCodeAt(j - 1);
      const cost = aChar === bChar ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1,      // insertion
        prevRow[j] + 1,          // deletion
        prevRow[j - 1] + cost    // substitution
      );
    }
    for (let j = 0; j <= n; j++) {
      prevRow[j] = currRow[j];
    }
  }

  return currRow[n];
}

/**
 * Normalizes an array of tags against an allowed taxonomy with bounded edit-distance fuzzy mapping.
 *
 * Rules:
 * - If allowedTags is not specified or empty, tags are returned unchanged.
 * - Exact matches (case-insensitive) map to the allowed tag's canonical casing.
 * - Length <= 3: no fuzzy mapping (preserves acronyms like 'ui', 'db', 'ai').
 * - Length == 4: maximum edit distance = 1.
 * - Length >= 5: maximum edit distance = 2.
 * - Distance ties between multiple candidates result in no mapping.
 */
export function normalizeTags(
  tags: string[],
  allowedTags?: string[]
): TagNormalizationResult {
  const cleanedInputTags = tags.map((t) => t.trim()).filter((t) => t.length > 0);

  if (!allowedTags || allowedTags.length === 0) {
    return {
      tags: Array.from(new Set(cleanedInputTags)),
      mappings: [],
      unmapped: [],
    };
  }

  // Canonical casing lookup: lowercase -> canonical
  const canonicalMap = new Map<string, string>();
  for (const allowed of allowedTags) {
    const trimmed = allowed.trim();
    if (trimmed) {
      canonicalMap.set(trimmed.toLowerCase(), trimmed);
    }
  }

  const finalTags: string[] = [];
  const mappings: TagMapping[] = [];
  const unmapped: string[] = [];

  for (const rawTag of cleanedInputTags) {
    const lower = rawTag.toLowerCase();

    // Check exact match
    if (canonicalMap.has(lower)) {
      finalTags.push(canonicalMap.get(lower)!);
      continue;
    }

    // Check length threshold for fuzzy matching
    if (lower.length <= 3) {
      finalTags.push(rawTag);
      unmapped.push(rawTag);
      continue;
    }

    const maxDistance = lower.length === 4 ? 1 : 2;

    // Evaluate distance against all allowed tags
    const candidates: { tag: string; dist: number }[] = [];
    for (const [allowedLower, canonical] of canonicalMap.entries()) {
      const dist = levenshteinDistance(lower, allowedLower);
      if (dist <= maxDistance) {
        candidates.push({ tag: canonical, dist });
      }
    }

    // Sort by distance ascending
    candidates.sort((a, b) => a.dist - b.dist);

    if (candidates.length === 0) {
      finalTags.push(rawTag);
      unmapped.push(rawTag);
    } else if (candidates.length > 1 && candidates[0].dist === candidates[1].dist) {
      // Tie for minimum distance: do not map to avoid ambiguity
      finalTags.push(rawTag);
      unmapped.push(rawTag);
    } else {
      // Clear winner
      const best = candidates[0];
      finalTags.push(best.tag);
      mappings.push({
        original: rawTag,
        mapped: best.tag,
        distance: best.dist,
      });
    }
  }

  return {
    tags: Array.from(new Set(finalTags)),
    mappings,
    unmapped,
  };
}
