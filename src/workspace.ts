import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import type { RepoConfig, WorkspaceManifest } from "./types.js";

const repoSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1)
});

const workspaceSchema = z.object({
  name: z.string().min(1).optional(),
  repos: z.array(repoSchema).min(1)
});

export const parseWorkspaceManifest = async (manifestPath: string): Promise<WorkspaceManifest> => {
  const raw = await fs.readFile(manifestPath, "utf8");
  const parsedUnknown = yaml.load(raw);
  const parsed = workspaceSchema.parse(parsedUnknown);
  const baseDir = path.dirname(path.resolve(manifestPath));

  const repos: RepoConfig[] = parsed.repos.map((repo) => ({
    name: repo.name,
    path: path.resolve(baseDir, repo.path)
  }));

  return {
    name: parsed.name,
    repos
  };
};

export const scaffoldWorkspaceManifest = async (targetDir: string): Promise<string> => {
  const repoName = path.basename(path.resolve(targetDir));
  const filePath = path.resolve(targetDir, ".workspace.yaml");
  const body = [
    `name: ${repoName}`,
    "repos:",
    "  - name: app",
    "    path: ../app",
    "  - name: api",
    "    path: ../api"
  ].join("\n");

  await fs.writeFile(filePath, `${body}\n`, "utf8");
  return filePath;
};
