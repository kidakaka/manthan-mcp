// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  generateMcpServerConfig,
  updateMcpConfigFile,
  linkCursor,
  linkVSCode,
} from '../src/config/client-linker.js';

describe('Client Linker: Frictionless MCP Client Integration', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manthan-linker-test-'));
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('1. generateMcpServerConfig produces valid npx configuration by default', () => {
    const config = generateMcpServerConfig(tempDir);
    assert.strictEqual(config.command, 'npx');
    assert.deepStrictEqual(config.args, [
      '-y',
      '@manthan/mcp-server',
      'serve',
      '--dir',
      path.resolve(tempDir),
    ]);
  });

  test('2. generateMcpServerConfig produces local node script configuration when specified', () => {
    const customScript = path.join(tempDir, 'dist', 'index.js');
    const config = generateMcpServerConfig(tempDir, { customScriptPath: customScript });
    assert.strictEqual(config.command, 'node');
    assert.deepStrictEqual(config.args, [
      path.resolve(customScript),
      'serve',
      '--dir',
      path.resolve(tempDir),
    ]);
  });

  test('3. updateMcpConfigFile creates new configuration file and directory', () => {
    const targetFile = path.join(tempDir, 'subfolder', 'mcp.json');
    const entry = generateMcpServerConfig(tempDir);

    const result = updateMcpConfigFile(targetFile, 'manthan', entry);
    assert.strictEqual(result.status, 'created');
    assert.strictEqual(fs.existsSync(targetFile), true);

    const content = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
    assert.ok(content.mcpServers);
    assert.ok(content.mcpServers.manthan);
    assert.strictEqual(content.mcpServers.manthan.command, 'npx');
  });

  test('4. updateMcpConfigFile preserves existing servers and creates backup', () => {
    const targetFile = path.join(tempDir, 'subfolder', 'mcp.json');
    const existingContent = {
      mcpServers: {
        other_server: {
          command: 'node',
          args: ['server.js'],
        },
      },
    };
    fs.writeFileSync(targetFile, JSON.stringify(existingContent, null, 2), 'utf-8');

    const newEntry = generateMcpServerConfig(tempDir);
    const result = updateMcpConfigFile(targetFile, 'manthan', newEntry);

    assert.strictEqual(result.status, 'updated');
    assert.ok(result.backupPath);
    assert.strictEqual(fs.existsSync(result.backupPath), true);

    const updated = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
    assert.ok(updated.mcpServers.other_server, 'Pre-existing server must be preserved');
    assert.ok(updated.mcpServers.manthan, 'Manthan server must be added');
  });

  test('5. linkCursor generates .cursor/mcp.json inside workspace root', () => {
    const result = linkCursor(tempDir);
    assert.strictEqual(result.status, 'created');
    const cursorFile = path.join(tempDir, '.cursor', 'mcp.json');
    assert.strictEqual(fs.existsSync(cursorFile), true);

    const parsed = JSON.parse(fs.readFileSync(cursorFile, 'utf-8'));
    assert.ok(parsed.mcpServers.manthan);
  });

  test('6. linkVSCode generates .vscode/mcp.json inside workspace root', () => {
    const result = linkVSCode(tempDir);
    assert.strictEqual(result.status, 'created');
    const vscodeFile = path.join(tempDir, '.vscode', 'mcp.json');
    assert.strictEqual(fs.existsSync(vscodeFile), true);

    const parsed = JSON.parse(fs.readFileSync(vscodeFile, 'utf-8'));
    assert.ok(parsed.mcpServers.manthan);
  });
});
