import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PolyrepoWorkspace } from "../polyrepo-workspace.js";

const createdDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "polyrepo-mcp-test-"));
  createdDirs.push(dir);
  return dir;
};

const ensureFile = async (filePath: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
};

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("PolyrepoWorkspace", () => {
  let workspace: PolyrepoWorkspace;
  let tempRoot: string;
  let manifestPath: string;

  beforeEach(async () => {
    workspace = new PolyrepoWorkspace();
    tempRoot = await createTempDir();

    const repoA = path.join(tempRoot, "repo-a");
    const repoB = path.join(tempRoot, "repo-b");
    await fs.mkdir(repoA, { recursive: true });
    await fs.mkdir(repoB, { recursive: true });

    await ensureFile(
      path.join(repoA, "src", "util.ts"),
      [
        "export const greet = (name: string): string => `Hi ${name}`;",
        "export const add = (a: number, b: number): number => a + b;"
      ].join("\n")
    );
    await ensureFile(path.join(repoA, "README.md"), "# Repo A\n");

    await ensureFile(
      path.join(repoB, "src", "index.ts"),
      [
        "import { greet } from './util';",
        "export const run = (): string => greet('world');"
      ].join("\n")
    );
    await ensureFile(path.join(repoB, "src", "util.ts"), "export const greet = (name: string): string => name;\n");

    manifestPath = path.join(tempRoot, ".workspace.yaml");
    await fs.writeFile(
      manifestPath,
      [
        "name: test-workspace",
        "repos:",
        "  - name: repo-a",
        "    path: ./repo-a",
        "  - name: repo-b",
        "    path: ./repo-b"
      ].join("\n"),
      "utf8"
    );

    await workspace.loadWorkspace(manifestPath);
  });

  it("indexes repos and reports list_repos stats", () => {
    const repos = workspace.listRepos();
    expect(repos).toHaveLength(2);

    const repoA = repos.find((repo) => repo.name === "repo-a");
    expect(repoA).toBeDefined();
    expect(repoA?.fileCount).toBeGreaterThan(0);
    expect(repoA?.languages.TypeScript).toBeGreaterThanOrEqual(1);
  });

  it("searches across repos", async () => {
    const hits = await workspace.searchAcrossRepos("greet");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => hit.repo === "repo-a")).toBe(true);
    expect(hits.some((hit) => hit.repo === "repo-b")).toBe(true);
  });

  it("fetches a file from a named repo", async () => {
    const content = await workspace.getFile("repo-a", "src/util.ts");
    expect(content).toContain("export const greet");
    expect(content).toContain("export const add");
  });
});
