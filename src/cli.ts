#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { runMcpServer } from "./mcp-server.js";
import { PolyrepoWorkspace } from "./polyrepo-workspace.js";
import { scaffoldWorkspaceManifest } from "./workspace.js";

const printHelp = (): void => {
  process.stdout.write(
    [
      "polyrepo-mcp",
      "",
      "Usage:",
      "  polyrepo-mcp serve",
      "  polyrepo-mcp init",
      "  polyrepo-mcp index <workspace>",
      ""
    ].join("\n")
  );
};

const runInit = async (): Promise<void> => {
  const target = path.resolve(process.cwd(), ".workspace.yaml");
  try {
    await fs.access(target);
    process.stdout.write(`.workspace.yaml already exists at ${target}\n`);
    process.exitCode = 1;
    return;
  } catch {
    const createdPath = await scaffoldWorkspaceManifest(process.cwd());
    process.stdout.write(`Created ${createdPath}\n`);
  }
};

const runIndex = async (workspacePathArg?: string): Promise<void> => {
  if (!workspacePathArg) {
    process.stderr.write("Missing workspace path. Example: polyrepo-mcp index .workspace.yaml\n");
    process.exitCode = 1;
    return;
  }

  const workspacePath = path.resolve(process.cwd(), workspacePathArg);
  const workspace = new PolyrepoWorkspace();
  const loadResult = await workspace.loadWorkspace(workspacePath);
  const repos = workspace.listRepos();

  process.stdout.write(`Workspace: ${loadResult.workspaceName ?? "(unnamed)"}\n`);
  process.stdout.write(`Repos indexed: ${loadResult.repoCount}\n`);
  for (const repo of repos) {
    process.stdout.write(`- ${repo.name}: ${repo.fileCount} files\n`);
  }
};

const main = async (): Promise<void> => {
  const [, , command, ...rest] = process.argv;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "serve") {
    await runMcpServer();
    return;
  }

  if (command === "init") {
    await runInit();
    return;
  }

  if (command === "index") {
    await runIndex(rest[0]);
    return;
  }

  process.stderr.write(`Unknown command: ${command}\n\n`);
  printHelp();
  process.exitCode = 1;
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`polyrepo-mcp error: ${message}\n`);
  process.exitCode = 1;
});
