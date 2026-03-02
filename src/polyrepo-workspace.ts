import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { IndexedRepo, InterfaceDiff, RepoConfig, RepoStats, SearchHit, WorkspaceManifest } from "./types.js";
import { parseWorkspaceManifest } from "./workspace.js";

const execFileAsync = promisify(execFile);

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".rb": "Ruby",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".swift": "Swift",
  ".json": "JSON",
  ".yml": "YAML",
  ".yaml": "YAML",
  ".md": "Markdown",
  ".css": "CSS",
  ".scss": "SCSS",
  ".html": "HTML"
};

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo"
]);

const escapeRegex = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class PolyrepoWorkspace {
  private manifest: WorkspaceManifest | null = null;
  private manifestPath: string | null = null;
  private repos = new Map<string, IndexedRepo>();
  private hasRg: boolean | null = null;

  public async loadWorkspace(manifestPath: string): Promise<{ workspaceName?: string; repoCount: number }> {
    const manifest = await parseWorkspaceManifest(manifestPath);
    this.manifest = manifest;
    this.manifestPath = path.resolve(manifestPath);
    this.repos.clear();

    for (const repo of manifest.repos) {
      const indexed = await this.indexRepo(repo);
      this.repos.set(repo.name, indexed);
    }

    return { workspaceName: manifest.name, repoCount: this.repos.size };
  }

  public listRepos(): RepoStats[] {
    this.assertLoaded();
    return [...this.repos.values()].map((repo) => ({
      name: repo.name,
      path: repo.path,
      fileCount: repo.fileCount,
      languages: repo.languageCounts
    }));
  }

  public async getFile(repoName: string, relPath: string): Promise<string> {
    const repo = this.getRepo(repoName);
    const fullPath = path.resolve(repo.path, relPath);
    if (!fullPath.startsWith(path.resolve(repo.path))) {
      throw new Error("Path escapes repository root");
    }
    return fs.readFile(fullPath, "utf8");
  }

  public async searchAcrossRepos(query: string, repos?: string[]): Promise<SearchHit[]> {
    const targetRepos = this.selectRepos(repos);
    const canUseRg = await this.canUseRipgrep();
    const hits: SearchHit[] = [];

    for (const repo of targetRepos) {
      if (canUseRg) {
        const rgHits = await this.searchWithRg(repo, query);
        hits.push(...rgHits);
      } else {
        const grepHits = await this.searchWithGrep(repo, query, false);
        hits.push(...grepHits);
      }
    }

    return hits;
  }

  public async findUsages(symbol: string, repos?: string[]): Promise<SearchHit[]> {
    const targetRepos = this.selectRepos(repos);
    const canUseRg = await this.canUseRipgrep();
    const escaped = escapeRegex(symbol);
    const pattern = `\\b${escaped}\\b`;
    const hits: SearchHit[] = [];

    for (const repo of targetRepos) {
      if (canUseRg) {
        const rgHits = await this.searchWithRg(repo, pattern);
        hits.push(...rgHits);
      } else {
        const grepHits = await this.searchWithGrep(repo, pattern, true);
        hits.push(...grepHits);
      }
    }

    return hits;
  }

  public async diffInterfaces(repoAName: string, repoBName: string, relPath: string): Promise<InterfaceDiff> {
    const repoA = this.getRepo(repoAName);
    const repoB = this.getRepo(repoBName);
    const fileA = await this.readMaybe(path.resolve(repoA.path, relPath));
    const fileB = await this.readMaybe(path.resolve(repoB.path, relPath));

    if (fileA === null || fileB === null) {
      throw new Error(`Could not read ${relPath} in one or both repos`);
    }

    const aLines = fileA.split("\n");
    const bLines = fileB.split("\n");
    const max = Math.max(aLines.length, bLines.length);
    const changedLines: Array<{ line: number; a: string; b: string }> = [];

    for (const index of Array.from({ length: max }, (_, i) => i)) {
      const a = aLines[index] ?? "";
      const b = bLines[index] ?? "";
      if (a !== b) {
        changedLines.push({ line: index + 1, a, b });
      }
    }

    const aExports = new Set(aLines.filter((line) => line.trim().startsWith("export ")).map((line) => line.trim()));
    const bExports = new Set(bLines.filter((line) => line.trim().startsWith("export ")).map((line) => line.trim()));

    const potentialBreakages = [...aExports].filter((exp) => !bExports.has(exp)).map((exp) => `Removed or changed export: ${exp}`);

    return {
      repoA: repoAName,
      repoB: repoBName,
      path: relPath,
      changedLines,
      potentialBreakages
    };
  }

  public getManifestPath(): string | null {
    return this.manifestPath;
  }

  private assertLoaded(): void {
    if (!this.manifest || this.repos.size === 0) {
      throw new Error("Workspace not loaded. Call load_workspace first.");
    }
  }

  private getRepo(name: string): IndexedRepo {
    this.assertLoaded();
    const repo = this.repos.get(name);
    if (!repo) {
      throw new Error(`Unknown repo: ${name}`);
    }
    return repo;
  }

  private selectRepos(repos?: string[]): IndexedRepo[] {
    this.assertLoaded();
    if (!repos || repos.length === 0) {
      return [...this.repos.values()];
    }
    return repos.map((name) => this.getRepo(name));
  }

  private async indexRepo(repo: RepoConfig): Promise<IndexedRepo> {
    const files = await this.walkFiles(repo.path);
    const languageCounts = files.reduce<Record<string, number>>((acc, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const language = LANGUAGE_BY_EXTENSION[ext] ?? "Other";
      acc[language] = (acc[language] ?? 0) + 1;
      return acc;
    }, {});

    return {
      ...repo,
      fileCount: files.length,
      languageCounts
    };
  }

  private async walkFiles(dir: string): Promise<string[]> {
    const output: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        const childFiles = await this.walkFiles(full);
        output.push(...childFiles);
      } else if (entry.isFile()) {
        output.push(full);
      }
    }

    return output;
  }

  private async canUseRipgrep(): Promise<boolean> {
    if (this.hasRg !== null) {
      return this.hasRg;
    }
    try {
      await execFileAsync("rg", ["--version"]);
      this.hasRg = true;
    } catch {
      this.hasRg = false;
    }
    return this.hasRg;
  }

  private async searchWithRg(repo: IndexedRepo, query: string): Promise<SearchHit[]> {
    try {
      const { stdout } = await execFileAsync("rg", ["-n", "--no-heading", "--color", "never", query, "."], {
        cwd: repo.path,
        maxBuffer: 10 * 1024 * 1024
      });
      return this.parseSearchOutput(repo.name, stdout);
    } catch (error: unknown) {
      const maybe = error as { stdout?: string; code?: number };
      if (maybe.code === 1) {
        return [];
      }
      if (typeof maybe.stdout === "string" && maybe.stdout.length > 0) {
        return this.parseSearchOutput(repo.name, maybe.stdout);
      }
      throw error;
    }
  }

  private async searchWithGrep(repo: IndexedRepo, query: string, isRegex: boolean): Promise<SearchHit[]> {
    const args = isRegex ? ["-RInE", query, "."] : ["-RIn", query, "."];
    try {
      const { stdout } = await execFileAsync("grep", args, {
        cwd: repo.path,
        maxBuffer: 10 * 1024 * 1024
      });
      return this.parseSearchOutput(repo.name, stdout);
    } catch (error: unknown) {
      const maybe = error as { stdout?: string; code?: number };
      if (maybe.code === 1) {
        return [];
      }
      if (typeof maybe.stdout === "string" && maybe.stdout.length > 0) {
        return this.parseSearchOutput(repo.name, maybe.stdout);
      }
      throw error;
    }
  }

  private parseSearchOutput(repoName: string, stdout: string): SearchHit[] {
    return stdout
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const match = line.match(/^(.*?):(\d+):(.*)$/);
        if (!match) {
          return null;
        }
        const [, file, lineNumber, snippet] = match;
        return {
          repo: repoName,
          file,
          line: Number(lineNumber),
          snippet
        } satisfies SearchHit;
      })
      .filter((hit): hit is SearchHit => hit !== null);
  }

  private async readMaybe(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch {
      return null;
    }
  }
}
