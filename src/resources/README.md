# Resources Provider (`src/resources`)

## Overview
The `src/resources` package implements native Model Context Protocol (MCP) Resource endpoints for Manthan. It registers direct resource URIs (`manthan://constitution`, `manthan://active-context`, and `manthan://status`) on the MCP server instance, providing zero-turn context injection for client agents without burning tool turns.

## Interface
- `[index.ts:registerManthanResources]`: `registerManthanResources(server: McpServer, config: ResolvedManthanConfig, store: MarkdownStore, indexer: SqliteIndexer, git: GitEngine): void` registers `manthan://constitution`, `manthan://active-context`, and `manthan://status` resources.

## Invariants
- `None`

## Side Effects
- `[index.ts:registerManthanResources]`: Mutates the `McpServer` instance by binding resource handlers for `manthan://constitution`, `manthan://active-context`, and `manthan://status` via `registerResource` or `resource`. Resource reads access disk state via `MarkdownStore`, telemetry via `SqliteIndexer`, and git SHA via `GitEngine`.

## Verification
- Run: `npm test`
