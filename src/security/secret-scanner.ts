// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export interface SecretMatch {
  rule: string;
  line: number;
  masked: string;
}

interface SecretPattern {
  name: string;
  regex: RegExp;
  mask: (matched: string) => string;
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: 'AWS Access Key',
    regex: /\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/,
    mask: (raw: string) => `${raw.slice(0, 4)}****...[REDACTED]`,
  },
  {
    name: 'GitHub Token',
    regex: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b/,
    mask: (raw: string) => `${raw.slice(0, 4)}****...[REDACTED]`,
  },
  {
    name: 'Private Key Block',
    regex: /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/,
    mask: () => '-----BEGIN [REDACTED] PRIVATE KEY-----',
  },
  {
    name: 'AI API Key',
    regex: /\b(sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,})\b/,
    mask: (raw: string) => {
      const matchPrefix = raw.match(/^(sk-(?:proj-|ant-)?)/);
      const prefix = matchPrefix ? matchPrefix[1] : raw.slice(0, 3);
      return `${prefix}****...[REDACTED]`;
    },
  },
  {
    name: 'Bearer JWT',
    regex: /\bBearer\s+(ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*)\b/i,
    mask: () => 'Bearer ey****...[REDACTED]',
  },
];

export class SecretScanner {
  /**
   * Scans text line-by-line for secret patterns with linear O(N) regexes.
   * Returns diagnostic matches with masked snippets.
   */
  static scanText(text: string): SecretMatch[] {
    if (!text || typeof text !== 'string') return [];

    const matches: SecretMatch[] = [];
    const lines = text.split(/\r?\n/);

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const lineNumber = lineIdx + 1;

      for (const pattern of SECRET_PATTERNS) {
        const m = line.match(pattern.regex);
        if (m) {
          matches.push({
            rule: pattern.name,
            line: lineNumber,
            masked: pattern.mask(m[0]),
          });
        }
      }
    }

    return matches;
  }

  /**
   * Asserts that none of the provided fields contain unredacted secrets.
   * Throws an McpError if secrets are found and allowSecrets is false.
   */
  static assertNoSecrets(
    fields: Record<string, string | undefined>,
    allowSecrets: boolean = false
  ): void {
    if (allowSecrets) return;

    const violations: { field: string; match: SecretMatch }[] = [];

    for (const [field, value] of Object.entries(fields)) {
      if (!value) continue;
      const matches = this.scanText(value);
      for (const match of matches) {
        violations.push({ field, match });
      }
    }

    if (violations.length > 0) {
      const summary = violations
        .map(
          (v) =>
            `[Field: ${v.field}, Rule: ${v.match.rule}, Line: ${v.match.line}, Snippet: ${v.match.masked}]`
        )
        .join('; ');

      throw new McpError(
        ErrorCode.InvalidParams,
        `Pre-commit secret validation failed: unredacted secrets detected in input fields. Violations: ${summary}. Set allow_secrets: true if this is an intentional test fixture or mock.`
      );
    }
  }
}
