// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Prasad Ajinkya and Manthan Contributors

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface McpServerConfigEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpConfigFileStructure {
  mcpServers?: Record<string, McpServerConfigEntry>;
  [key: string]: any;
}

export interface LinkResult {
  client: string;
  configPath: string;
  status: 'created' | 'updated' | 'unchanged' | 'error';
  message: string;
}

/**
 * Resolves the OS-specific configuration path for Claude Desktop.
 */
export function getClaudeDesktopConfigPath(): string {
  const platform = process.platform;
  const home = os.homedir();

  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Claude', 'claude_desktop_config.json');
  } else if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else {
    // Linux and others
    const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    return path.join(configHome, 'Claude', 'claude_desktop_config.json');
  }
}

/**
 * Resolves the Cursor project-level MCP configuration path (.cursor/mcp.json).
 */
export function getCursorConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.cursor', 'mcp.json');
}

/**
 * Resolves the VS Code project-level MCP configuration path (.vscode/mcp.json).
 */
export function getVSCodeConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.vscode', 'mcp.json');
}

/**
 * Generates the standard MCP server launch entry for Manthan.
 */
export function generateMcpServerConfig(
  workspaceRoot: string,
  options: { useNpx?: boolean; customScriptPath?: string } = {}
): McpServerConfigEntry {
  const resolvedDir = path.resolve(workspaceRoot);

  if (options.customScriptPath) {
    return {
      command: 'node',
      args: [path.resolve(options.customScriptPath), 'serve', '--dir', resolvedDir],
    };
  }

  // By default, generate npx invocation for seamless zero-install execution
  if (options.useNpx ?? true) {
    return {
      command: 'npx',
      args: ['-y', '@manthan/mcp-server', 'serve', '--dir', resolvedDir],
    };
  }

  return {
    command: 'manthan',
    args: ['serve', '--dir', resolvedDir],
  };
}

/**
 * Safely writes or updates an MCP JSON configuration file, preserving existing servers.
 */
export function updateMcpConfigFile(
  configFilePath: string,
  serverName: string,
  serverEntry: McpServerConfigEntry
): { status: 'created' | 'updated' | 'unchanged'; backupPath?: string } {
  const dir = path.dirname(configFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let existingData: McpConfigFileStructure = {};
  let isCreated = true;
  let backupPath: string | undefined;

  if (fs.existsSync(configFilePath)) {
    isCreated = false;
    try {
      const raw = fs.readFileSync(configFilePath, 'utf-8').trim();
      if (raw) {
        existingData = JSON.parse(raw);
        // Create backup of existing file
        backupPath = `${configFilePath}.bak`;
        fs.writeFileSync(backupPath, raw, 'utf-8');
      }
    } catch {
      // If corrupted, create backup before overwriting
      backupPath = `${configFilePath}.bak-${Date.now()}`;
      fs.copyFileSync(configFilePath, backupPath);
      existingData = {};
    }
  }

  if (!existingData.mcpServers || typeof existingData.mcpServers !== 'object') {
    existingData.mcpServers = {};
  }

  existingData.mcpServers[serverName] = serverEntry;

  fs.writeFileSync(configFilePath, JSON.stringify(existingData, null, 2) + '\n', 'utf-8');

  return {
    status: isCreated ? 'created' : 'updated',
    backupPath,
  };
}

/**
 * Links Manthan to Claude Desktop.
 */
export function linkClaudeDesktop(
  workspaceRoot: string,
  options: { useNpx?: boolean; customScriptPath?: string } = {}
): LinkResult {
  const configPath = getClaudeDesktopConfigPath();
  const entry = generateMcpServerConfig(workspaceRoot, options);

  try {
    const res = updateMcpConfigFile(configPath, 'manthan', entry);
    return {
      client: 'Claude Desktop',
      configPath,
      status: res.status,
      message: `Configured Claude Desktop at ${configPath}${res.backupPath ? ` (backup: ${res.backupPath})` : ''}`,
    };
  } catch (err: any) {
    return {
      client: 'Claude Desktop',
      configPath,
      status: 'error',
      message: `Failed to configure Claude Desktop: ${err.message}`,
    };
  }
}

/**
 * Links Manthan to Cursor by creating/updating .cursor/mcp.json in the workspace.
 */
export function linkCursor(
  workspaceRoot: string,
  options: { useNpx?: boolean; customScriptPath?: string } = {}
): LinkResult {
  const configPath = getCursorConfigPath(workspaceRoot);
  const entry = generateMcpServerConfig(workspaceRoot, options);

  try {
    const res = updateMcpConfigFile(configPath, 'manthan', entry);
    return {
      client: 'Cursor',
      configPath,
      status: res.status,
      message: `Configured Cursor project MCP settings at ${configPath}`,
    };
  } catch (err: any) {
    return {
      client: 'Cursor',
      configPath,
      status: 'error',
      message: `Failed to configure Cursor: ${err.message}`,
    };
  }
}

/**
 * Links Manthan to VS Code by creating/updating .vscode/mcp.json in the workspace.
 */
export function linkVSCode(
  workspaceRoot: string,
  options: { useNpx?: boolean; customScriptPath?: string } = {}
): LinkResult {
  const configPath = getVSCodeConfigPath(workspaceRoot);
  const entry = generateMcpServerConfig(workspaceRoot, options);

  try {
    const res = updateMcpConfigFile(configPath, 'manthan', entry);
    return {
      client: 'VS Code',
      configPath,
      status: res.status,
      message: `Configured VS Code project MCP settings at ${configPath}`,
    };
  } catch (err: any) {
    return {
      client: 'VS Code',
      configPath,
      status: 'error',
      message: `Failed to configure VS Code: ${err.message}`,
    };
  }
}

/**
 * Links all supported clients.
 */
export function linkAllClients(
  workspaceRoot: string,
  options: { useNpx?: boolean; customScriptPath?: string } = {}
): LinkResult[] {
  return [
    linkCursor(workspaceRoot, options),
    linkVSCode(workspaceRoot, options),
    linkClaudeDesktop(workspaceRoot, options),
  ];
}
