export type RepoConfig = {
    name: string;
    path: string;
};
export type WorkspaceManifest = {
    name?: string;
    repos: RepoConfig[];
};
export type IndexedRepo = RepoConfig & {
    fileCount: number;
    languageCounts: Record<string, number>;
};
export type SearchHit = {
    repo: string;
    file: string;
    line: number;
    snippet: string;
};
export type RepoStats = {
    name: string;
    path: string;
    fileCount: number;
    languages: Record<string, number>;
};
export type InterfaceDiff = {
    repoA: string;
    repoB: string;
    path: string;
    changedLines: Array<{
        line: number;
        a: string;
        b: string;
    }>;
    potentialBreakages: string[];
};
