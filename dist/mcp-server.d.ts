import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PolyrepoWorkspace } from "./polyrepo-workspace.js";
export declare const createMcpServer: (workspace: PolyrepoWorkspace) => McpServer;
export declare const runMcpServer: () => Promise<void>;
