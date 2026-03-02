# polyrepo-mcp

Production-ready MCP server + workspace manifest tool for searching and inspecting many repos as one workspace.

## Why

When your code lives across multiple repositories, agents and developers lose context quickly. `polyrepo-mcp` gives one workspace-level index and MCP tools to search, inspect, and compare code across repos.

## Features

- Workspace manifest via `.workspace.yaml`
- MCP stdio server using `@modelcontextprotocol/sdk`
- Cross-repo search (`rg` first, `grep` fallback)
- Symbol usage lookup
- File fetch from named repo
- Repo stats (file counts + language breakdown)
- Interface diff for same path across repos
- CLI commands for `serve`, `init`, and `index`

## Installation

```bash
pnpm install
pnpm run build
```

Global/linked usage:

```bash
pnpm link --global
polyrepo-mcp --help
```

## `.workspace.yaml` reference

Create this file at your workspace root:

```yaml
name: acme-platform
repos:
  - name: web
    path: ../acme-web
  - name: api
    path: ../acme-api
  - name: shared
    path: ../acme-shared
```

Schema:

- `name` (optional, string): human-friendly workspace name
- `repos` (required, array): list of repos
  - `name` (required, string): repo identifier used in tool calls
  - `path` (required, string): absolute or relative path (resolved from manifest directory)

## CLI usage

```bash
polyrepo-mcp init
polyrepo-mcp index .workspace.yaml
polyrepo-mcp serve
```

Commands:

- `polyrepo-mcp serve`: starts MCP server over stdio
- `polyrepo-mcp init`: scaffolds `.workspace.yaml` in current directory
- `polyrepo-mcp index <workspace>`: loads/indexes workspace and prints stats

## MCP tools

- `load_workspace(path)`
- `search_across_repos(query, repos?)`
- `find_usages(symbol, repos?)`
- `get_file(repo, path)`
- `list_repos()`
- `diff_interfaces(repo_a, repo_b, path)`

## MCP client setup

### OpenCode (`opencode.json`)

```json
{
  "mcpServers": {
    "polyrepo-mcp": {
      "command": "polyrepo-mcp",
      "args": ["serve"]
    }
  }
}
```

### Claude Desktop

```json
{
  "mcpServers": {
    "polyrepo-mcp": {
      "command": "polyrepo-mcp",
      "args": ["serve"]
    }
  }
}
```

### Cursor

Add an MCP server entry pointing to:

- Command: `polyrepo-mcp`
- Args: `serve`

## Development

```bash
pnpm install
pnpm run test
pnpm run build
```

## Notes

- Uses `rg` if available; falls back to `grep -RIn`.
- Paths in `.workspace.yaml` are resolved relative to the manifest file.
