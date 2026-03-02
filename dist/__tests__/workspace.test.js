import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseWorkspaceManifest } from "../workspace.js";
const createdDirs = [];
const createTempDir = async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "polyrepo-mcp-test-"));
    createdDirs.push(dir);
    return dir;
};
afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});
describe("parseWorkspaceManifest", () => {
    it("parses yaml and resolves repo paths", async () => {
        const root = await createTempDir();
        const manifestPath = path.join(root, ".workspace.yaml");
        await fs.writeFile(manifestPath, [
            "name: test-space",
            "repos:",
            "  - name: web",
            "    path: ./web",
            "  - name: api",
            "    path: ../api"
        ].join("\n"), "utf8");
        const manifest = await parseWorkspaceManifest(manifestPath);
        expect(manifest.name).toBe("test-space");
        expect(manifest.repos).toEqual([
            { name: "web", path: path.resolve(root, "./web") },
            { name: "api", path: path.resolve(root, "../api") }
        ]);
    });
});
