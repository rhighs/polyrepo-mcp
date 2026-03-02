import type { WorkspaceManifest } from "./types.js";
export declare const parseWorkspaceManifest: (manifestPath: string) => Promise<WorkspaceManifest>;
export declare const scaffoldWorkspaceManifest: (targetDir: string) => Promise<string>;
