// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { SecretScanner } from '../src/security/secret-scanner.js';
import { levenshteinDistance, normalizeTags } from '../src/utils/levenshtein.js';

describe('Unit: SecretScanner Pre-Commit Detection & Masking', () => {
  test('1. Detects AWS Access Key ID and masks snippet', () => {
    const text = 'Config: AWS_KEY=AKIAIOSFODNN7EXAMPLE in line 1';
    const matches = SecretScanner.scanText(text);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].rule, 'AWS Access Key');
    assert.strictEqual(matches[0].line, 1);
    assert.ok(!matches[0].masked.includes('AKIAIOSFODNN7EXAMPLE'));
    assert.ok(matches[0].masked.includes('AKIA'));
    assert.ok(matches[0].masked.includes('****'));
  });

  test('2. Detects GitHub Personal Access Token', () => {
    const text = 'Line 1: clean\nLine 2: token = ghp_123456789012345678901234567890123456';
    const matches = SecretScanner.scanText(text);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].rule, 'GitHub Token');
    assert.strictEqual(matches[0].line, 2);
    assert.ok(!matches[0].masked.includes('ghp_123456789012345678901234567890123456'));
    assert.ok(matches[0].masked.includes('ghp_****'));
  });

  test('3. Detects Private Key block', () => {
    const text = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...';
    const matches = SecretScanner.scanText(text);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].rule, 'Private Key Block');
    assert.strictEqual(matches[0].line, 1);
  });

  test('4. Detects OpenAI and Anthropic API keys', () => {
    const text = 'openai: sk-proj-abcdefghijklmnopqrstuvwxyz1234\nanthropic: sk-ant-abcdefghijklmnopqrstuvwxyz1234';
    const matches = SecretScanner.scanText(text);
    assert.strictEqual(matches.length, 2);
    assert.strictEqual(matches[0].rule, 'AI API Key');
    assert.strictEqual(matches[1].rule, 'AI API Key');
    assert.strictEqual(matches[0].line, 1);
    assert.strictEqual(matches[1].line, 2);
  });

  test('5. Detects Bearer JWT tokens', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const matches = SecretScanner.scanText(text);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].rule, 'Bearer JWT');
  });

  test('6. Returns no matches for clean text', () => {
    const text = 'This is a clean markdown document describing architecture without credentials.';
    const matches = SecretScanner.scanText(text);
    assert.strictEqual(matches.length, 0);
  });

  test('7. assertNoSecrets throws structured error on unredacted secrets', () => {
    assert.throws(
      () => {
        SecretScanner.assertNoSecrets({
          title: 'Setup Guide',
          content: 'Use key AKIAIOSFODNN7EXAMPLE',
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('Pre-commit secret validation failed'));
        assert.ok(err.message.includes('AWS Access Key'));
        assert.ok(!err.message.includes('AKIAIOSFODNN7EXAMPLE'));
        return true;
      }
    );
  });

  test('8. assertNoSecrets passes when allowSecrets is true', () => {
    assert.doesNotThrow(() => {
      SecretScanner.assertNoSecrets(
        {
          title: 'Mock Fixture',
          content: 'Test fixture: AKIAIOSFODNN7EXAMPLE',
        },
        true
      );
    });
  });
});

describe('Unit: Levenshtein Distance & Tag Taxonomy Normalization', () => {
  test('1. levenshteinDistance calculates distance accurately', () => {
    assert.strictEqual(levenshteinDistance('', ''), 0);
    assert.strictEqual(levenshteinDistance('a', ''), 1);
    assert.strictEqual(levenshteinDistance('', 'a'), 1);
    assert.strictEqual(levenshteinDistance('same', 'same'), 0);
    assert.strictEqual(levenshteinDistance('kitten', 'sitting'), 3);
    assert.strictEqual(levenshteinDistance('database', 'databaes'), 2);
  });

  test('2. normalizeTags returns unmapped tags when allowed_tags is undefined or empty', () => {
    const result = normalizeTags(['frontend', 'backend']);
    assert.deepStrictEqual(result.tags, ['frontend', 'backend']);
    assert.deepStrictEqual(result.mappings, []);
    assert.deepStrictEqual(result.unmapped, []);
  });

  test('3. Exact match preserves casing of allowed tag', () => {
    const result = normalizeTags(['DATABASE', 'auth'], ['database', 'auth']);
    assert.deepStrictEqual(result.tags, ['database', 'auth']);
    assert.strictEqual(result.mappings.length, 0);
    assert.strictEqual(result.unmapped.length, 0);
  });

  test('4. Preserves short acronyms (len <= 3) without fuzzy mapping', () => {
    const result = normalizeTags(['db', 'ui', 'ai'], ['dev', 'uid', 'api']);
    assert.deepStrictEqual(result.tags, ['db', 'ui', 'ai']);
    assert.strictEqual(result.mappings.length, 0);
    assert.deepStrictEqual(result.unmapped, ['db', 'ui', 'ai']);
  });

  test('5. Maps len == 4 with edit distance <= 1', () => {
    const result = normalizeTags(['autz', 'auzz'], ['auth', 'billing']);
    // 'autz' has distance 1 to 'auth' -> mapped
    // 'auzz' has distance 2 to 'auth' -> not mapped (len == 4 threshold is 1)
    assert.ok(result.tags.includes('auth'));
    assert.ok(result.tags.includes('auzz'));
    assert.strictEqual(result.mappings.length, 1);
    assert.strictEqual(result.mappings[0].original, 'autz');
    assert.strictEqual(result.mappings[0].mapped, 'auth');
    assert.deepStrictEqual(result.unmapped, ['auzz']);
  });

  test('6. Maps len >= 5 with edit distance <= 2', () => {
    const result = normalizeTags(['databaes', 'dtbaes'], ['database']);
    // 'databaes' dist 2 -> mapped
    // 'dtbaes' dist 3 -> not mapped
    assert.ok(result.tags.includes('database'));
    assert.ok(result.tags.includes('dtbaes'));
    assert.strictEqual(result.mappings.length, 1);
    assert.strictEqual(result.mappings[0].original, 'databaes');
    assert.strictEqual(result.mappings[0].mapped, 'database');
    assert.deepStrictEqual(result.unmapped, ['dtbaes']);
  });

  test('7. Ties in distance result in no mapping (unmapped)', () => {
    // 'teste' has distance 1 to 'tests' and distance 1 to 'testa'
    const result = normalizeTags(['teste'], ['tests', 'testa']);
    assert.strictEqual(result.mappings.length, 0);
    assert.deepStrictEqual(result.tags, ['teste']);
    assert.deepStrictEqual(result.unmapped, ['teste']);
  });
});
