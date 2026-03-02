import type { InterfaceDiff, RepoStats, SearchHit } from "./types.js";
export declare class PolyrepoWorkspace {
    private manifest;
    private manifestPath;
    private repos;
    private hasRg;
    loadWorkspace(manifestPath: string): Promise<{
        workspaceName?: string;
        repoCount: number;
    }>;
    listRepos(): RepoStats[];
    getFile(repoName: string, relPath: string): Promise<string>;
    searchAcrossRepos(query: string, repos?: string[]): Promise<SearchHit[]>;
    findUsages(symbol: string, repos?: string[]): Promise<SearchHit[]>;
    diffInterfaces(repoAName: string, repoBName: string, relPath: string): Promise<InterfaceDiff>;
    getManifestPath(): string | null;
    private assertLoaded;
    private getRepo;
    private selectRepos;
    private indexRepo;
    private walkFiles;
    private canUseRipgrep;
    private searchWithRg;
    private searchWithGrep;
    private parseSearchOutput;
    private readMaybe;
}
