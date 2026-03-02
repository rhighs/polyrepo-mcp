import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PolyrepoWorkspace } from "./polyrepo-workspace.js";

const formatJson = (value: unknown): string => JSON.stringify(value, null, 2);

export const createMcpServer = (workspace: PolyrepoWorkspace): McpServer => {
  const server = new McpServer({
    name: "polyrepo-mcp",
    version: "0.1.0"
  });

  server.tool(
    "load_workspace",
    "Read .workspace.yaml and index repositories",
    {
      path: z.string().min(1)
    },
    async ({ path }) => {
      const result = await workspace.loadWorkspace(path);
      return {
        content: [{ type: "text", text: formatJson({ ok: true, ...result }) }]
      };
    }
  );

  server.tool(
    "search_across_repos",
    "Search for text/regex across all or selected repos",
    {
      query: z.string().min(1),
      repos: z.array(z.string()).optional()
    },
    async ({ query, repos }) => {
      const result = await workspace.searchAcrossRepos(query, repos);
      return {
        content: [{ type: "text", text: formatJson(result) }]
      };
    }
  );

  server.tool(
    "find_usages",
    "Find symbol usages across repositories",
    {
      symbol: z.string().min(1),
      repos: z.array(z.string()).optional()
    },
    async ({ symbol, repos }) => {
      const result = await workspace.findUsages(symbol, repos);
      return {
        content: [{ type: "text", text: formatJson(result) }]
      };
    }
  );

  server.tool(
    "get_file",
    "Get a file by repo and relative path",
    {
      repo: z.string().min(1),
      path: z.string().min(1)
    },
    async ({ repo, path }) => {
      const content = await workspace.getFile(repo, path);
      return {
        content: [{ type: "text", text: content }]
      };
    }
  );

  server.tool("list_repos", "List indexed repos and stats", {}, async () => {
    const repos = workspace.listRepos();
    return {
      content: [{ type: "text", text: formatJson(repos) }]
    };
  });

  server.tool(
    "diff_interfaces",
    "Compare same file across two repos for interface drift",
    {
      repo_a: z.string().min(1),
      repo_b: z.string().min(1),
      path: z.string().min(1)
    },
    async ({ repo_a, repo_b, path }) => {
      const diff = await workspace.diffInterfaces(repo_a, repo_b, path);
      return {
        content: [{ type: "text", text: formatJson(diff) }]
      };
    }
  );

  return server;
};

export const runMcpServer = async (): Promise<void> => {
  const workspace = new PolyrepoWorkspace();
  const server = createMcpServer(workspace);
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
