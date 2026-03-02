import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseWorkspaceManifest } from "./workspace.js";
const execFileAsync = promisify(execFile);
const LANGUAGE_BY_EXTENSION = {
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
const escapeRegex = (input) => input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export class PolyrepoWorkspace {
    manifest = null;
    manifestPath = null;
    repos = new Map();
    hasRg = null;
    async loadWorkspace(manifestPath) {
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
    listRepos() {
        this.assertLoaded();
        return [...this.repos.values()].map((repo) => ({
            name: repo.name,
            path: repo.path,
            fileCount: repo.fileCount,
            languages: repo.languageCounts
        }));
    }
    async getFile(repoName, relPath) {
        const repo = this.getRepo(repoName);
        const fullPath = path.resolve(repo.path, relPath);
        if (!fullPath.startsWith(path.resolve(repo.path))) {
            throw new Error("Path escapes repository root");
        }
        return fs.readFile(fullPath, "utf8");
    }
    async searchAcrossRepos(query, repos) {
        const targetRepos = this.selectRepos(repos);
        const canUseRg = await this.canUseRipgrep();
        const hits = [];
        for (const repo of targetRepos) {
            if (canUseRg) {
                const rgHits = await this.searchWithRg(repo, query);
                hits.push(...rgHits);
            }
            else {
                const grepHits = await this.searchWithGrep(repo, query, false);
                hits.push(...grepHits);
            }
        }
        return hits;
    }
    async findUsages(symbol, repos) {
        const targetRepos = this.selectRepos(repos);
        const canUseRg = await this.canUseRipgrep();
        const escaped = escapeRegex(symbol);
        const pattern = `\\b${escaped}\\b`;
        const hits = [];
        for (const repo of targetRepos) {
            if (canUseRg) {
                const rgHits = await this.searchWithRg(repo, pattern);
                hits.push(...rgHits);
            }
            else {
                const grepHits = await this.searchWithGrep(repo, pattern, true);
                hits.push(...grepHits);
            }
        }
        return hits;
    }
    async diffInterfaces(repoAName, repoBName, relPath) {
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
        const changedLines = [];
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
    getManifestPath() {
        return this.manifestPath;
    }
    assertLoaded() {
        if (!this.manifest || this.repos.size === 0) {
            throw new Error("Workspace not loaded. Call load_workspace first.");
        }
    }
    getRepo(name) {
        this.assertLoaded();
        const repo = this.repos.get(name);
        if (!repo) {
            throw new Error(`Unknown repo: ${name}`);
        }
        return repo;
    }
    selectRepos(repos) {
        this.assertLoaded();
        if (!repos || repos.length === 0) {
            return [...this.repos.values()];
        }
        return repos.map((name) => this.getRepo(name));
    }
    async indexRepo(repo) {
        const files = await this.walkFiles(repo.path);
        const languageCounts = files.reduce((acc, filePath) => {
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
    async walkFiles(dir) {
        const output = [];
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (IGNORED_DIRS.has(entry.name)) {
                    continue;
                }
                const childFiles = await this.walkFiles(full);
                output.push(...childFiles);
            }
            else if (entry.isFile()) {
                output.push(full);
            }
        }
        return output;
    }
    async canUseRipgrep() {
        if (this.hasRg !== null) {
            return this.hasRg;
        }
        try {
            await execFileAsync("rg", ["--version"]);
            this.hasRg = true;
        }
        catch {
            this.hasRg = false;
        }
        return this.hasRg;
    }
    async searchWithRg(repo, query) {
        try {
            const { stdout } = await execFileAsync("rg", ["-n", "--no-heading", "--color", "never", query, "."], {
                cwd: repo.path,
                maxBuffer: 10 * 1024 * 1024
            });
            return this.parseSearchOutput(repo.name, stdout);
        }
        catch (error) {
            const maybe = error;
            if (maybe.code === 1) {
                return [];
            }
            if (typeof maybe.stdout === "string" && maybe.stdout.length > 0) {
                return this.parseSearchOutput(repo.name, maybe.stdout);
            }
            throw error;
        }
    }
    async searchWithGrep(repo, query, isRegex) {
        const args = isRegex ? ["-RInE", query, "."] : ["-RIn", query, "."];
        try {
            const { stdout } = await execFileAsync("grep", args, {
                cwd: repo.path,
                maxBuffer: 10 * 1024 * 1024
            });
            return this.parseSearchOutput(repo.name, stdout);
        }
        catch (error) {
            const maybe = error;
            if (maybe.code === 1) {
                return [];
            }
            if (typeof maybe.stdout === "string" && maybe.stdout.length > 0) {
                return this.parseSearchOutput(repo.name, maybe.stdout);
            }
            throw error;
        }
    }
    parseSearchOutput(repoName, stdout) {
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
            };
        })
            .filter((hit) => hit !== null);
    }
    async readMaybe(filePath) {
        try {
            return await fs.readFile(filePath, "utf8");
        }
        catch {
            return null;
        }
    }
}
