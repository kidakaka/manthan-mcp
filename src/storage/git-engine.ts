import { simpleGit, SimpleGit, LogResult, DefaultLogFields } from 'simple-git';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface CommitAuditEntry {
  sha: string;
  date: string;
  message: string;
  author_name: string;
  author_email: string;
  author_agent?: string;
  trace_id?: string;
  diff_summary?: string;
}

export interface CommitOptions {
  files: string[];
  namespace: string;
  title: string;
  author_agent: string;
  trace_id?: string | null;
  commit_prefix?: string;
}

export class GitEngine {
  private git: SimpleGit;
  private workspaceRoot: string;

  constructor(workspaceRoot: string = process.cwd()) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.git = simpleGit({ baseDir: this.workspaceRoot });
  }

  /**
   * Checks if the workspace is inside a valid git repository.
   */
  async isGitRepo(): Promise<boolean> {
    try {
      return await this.git.checkIsRepo();
    } catch {
      return false;
    }
  }

  /**
   * Initializes a Git repository if one does not already exist.
   */
  async initRepo(): Promise<void> {
    const isRepo = await this.isGitRepo();
    if (!isRepo) {
      await this.git.init();
      // Configure initial fallback user if not configured locally
      try {
        const userName = await this.git.raw(['config', 'user.name']);
        if (!userName.trim()) {
          await this.git.addConfig('user.name', 'Manthan Agent');
          await this.git.addConfig('user.email', 'manthan@agent.internal');
        }
      } catch {
        await this.git.addConfig('user.name', 'Manthan Agent');
        await this.git.addConfig('user.email', 'manthan@agent.internal');
      }
    }
  }

  /**
   * Returns current HEAD commit SHA, or null if no commits yet.
   */
  async getHeadSha(): Promise<string | null> {
    try {
      const sha = await this.git.revparse(['HEAD']);
      return sha.trim();
    } catch {
      return null;
    }
  }

  /**
   * Returns the latest commit SHA for a specific file.
   */
  async getFileCommitSha(filePath: string): Promise<string | null> {
    try {
      const relPath = path.isAbsolute(filePath)
        ? path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/')
        : filePath.replace(/\\/g, '/');

      const log = await this.git.log({ file: relPath, maxCount: 1 });
      if (log.latest) {
        return log.latest.hash;
      }
      return await this.getHeadSha();
    } catch {
      return null;
    }
  }

  /**
   * Formats the standardized Manthan commit message.
   */
  formatCommitMessage(options: {
    namespace: string;
    title: string;
    author_agent: string;
    trace_id?: string | null;
    commit_prefix?: string;
  }): string {
    const prefix = options.commit_prefix || 'chore(manthan):';
    const tracePart = options.trace_id ? ` trace:${options.trace_id}` : '';
    return `${prefix} [${options.namespace}] ${options.title} [agent:${options.author_agent}${tracePart}]`;
  }

  /**
   * Parses agent metadata out of a commit message.
   */
  parseAgentMetadata(message: string): { author_agent?: string; trace_id?: string } {
    const agentMatch = message.match(/\[agent:([^ \]]+)/i);
    const traceMatch = message.match(/trace:([^ \]]+)\]/i);
    return {
      author_agent: agentMatch ? agentMatch[1] : undefined,
      trace_id: traceMatch ? traceMatch[1] : undefined,
    };
  }

  /**
   * Stages specified files and commits them atomically.
   */
  async commitMemoryChanges(options: CommitOptions): Promise<string> {
    await this.initRepo();

    const relativeFiles = options.files.map((file) => {
      return path.isAbsolute(file)
        ? path.relative(this.workspaceRoot, file).replace(/\\/g, '/')
        : file.replace(/\\/g, '/');
    });

    await this.git.add(relativeFiles);

    const message = this.formatCommitMessage({
      namespace: options.namespace,
      title: options.title,
      author_agent: options.author_agent,
      trace_id: options.trace_id,
      commit_prefix: options.commit_prefix,
    });

    const commitResult = await this.git.commit(message, relativeFiles, {
      '--author': `"${options.author_agent} <agent@manthan.internal>"`,
    });

    const sha = commitResult.commit || (await this.getHeadSha()) || 'unknown_sha';
    return sha;
  }

  /**
   * Retrieves the commit audit history / lineage for a specific file or path.
   */
  async getFileAuditLineage(filePath: string, maxCommits: number = 10): Promise<CommitAuditEntry[]> {
    const isRepo = await this.isGitRepo();
    if (!isRepo) {
      return [];
    }

    const relPath = path.isAbsolute(filePath)
      ? path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/')
      : filePath.replace(/\\/g, '/');

    try {
      const logs: LogResult<DefaultLogFields> = await this.git.log({
        file: relPath,
        maxCount: maxCommits,
        '--stat': null,
      } as any);

      const entries: CommitAuditEntry[] = [];
      for (const item of logs.all) {
        const metadata = this.parseAgentMetadata(item.message);
        let diffSummary = '';

        try {
          // Attempt to retrieve a brief diff summary for this commit and file
          const showOutput = await this.git.show([
            '--stat',
            '--oneline',
            item.hash,
            '--',
            relPath,
          ]);
          diffSummary = showOutput.trim();
        } catch {
          diffSummary = item.message;
        }

        entries.push({
          sha: item.hash,
          date: item.date,
          message: item.message,
          author_name: item.author_name,
          author_email: item.author_email,
          author_agent: metadata.author_agent,
          trace_id: metadata.trace_id,
          diff_summary: diffSummary,
        });
      }

      return entries;
    } catch (err) {
      console.warn(`[Manthan] Error fetching git audit history for ${relPath}:`, err);
      return [];
    }
  }

  /**
   * Creates a dedicated proposal branch (e.g., manthan/rule-<id>) and checks it out.
   */
  async createAndCheckoutBranch(branchName: string): Promise<void> {
    await this.initRepo();
    try {
      await this.git.checkoutLocalBranch(branchName);
    } catch {
      await this.git.checkout(branchName);
    }
  }
}
