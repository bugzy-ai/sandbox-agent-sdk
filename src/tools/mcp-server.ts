/**
 * MCP Server for SDK Tools
 *
 * Creates an in-process MCP server that exposes custom tools
 * to Claude through the Model Context Protocol.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ToolDefinition, toolToJsonSchema } from './types.js';
import { executeTool } from './tool.js';

export interface McpServerConfig {
  /**
   * Name of the MCP server.
   */
  name: string;

  /**
   * Version of the MCP server.
   * @default '1.0.0'
   */
  version?: string;

  /**
   * Tools to expose through this server.
   */
  tools: ToolDefinition[];
}

export interface McpServer {
  /**
   * The underlying MCP Server instance.
   */
  server: Server;

  /**
   * Start the server with stdio transport.
   */
  start(): Promise<void>;

  /**
   * Get the list of tools exposed by this server.
   */
  getTools(): ToolDefinition[];
}

/**
 * Create an MCP server that exposes custom tools to Claude.
 *
 * This server runs in the same process as your application, allowing
 * tools to access your database, APIs, and other services directly.
 *
 * @example
 * ```typescript
 * import { createSdkMcpServer, tool } from 'claude-agent-sdk-vercel-sandbox';
 * import { z } from 'zod';
 *
 * const queryDb = tool(
 *   'query_database',
 *   'Execute a SQL query',
 *   { query: z.string() },
 *   async ({ query }) => {
 *     const results = await db.query(query);
 *     return { content: [{ type: 'text', text: JSON.stringify(results) }] };
 *   }
 * );
 *
 * const server = createSdkMcpServer({
 *   name: 'my-tools',
 *   tools: [queryDb],
 * });
 *
 * // For standalone use:
 * await server.start();
 *
 * // Or use server.server directly with custom transports
 * ```
 */
export function createSdkMcpServer(config: McpServerConfig): McpServer {
  const { name, version = '1.0.0', tools } = config;

  // Create the MCP server
  const server = new Server(
    {
      name,
      version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Create a map for quick tool lookup
  const toolMap = new Map<string, ToolDefinition>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  // Handle tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map(toolToJsonSchema),
    };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args } = request.params;

    const tool = toolMap.get(toolName);
    if (!tool) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Unknown tool: ${toolName}`,
          },
        ],
        isError: true,
      };
    }

    const result = await executeTool(tool, args);

    return {
      content: result.content.map((c) => {
        if (c.type === 'text') {
          return { type: 'text' as const, text: c.text };
        }
        if (c.type === 'image') {
          return { type: 'image' as const, data: c.data, mimeType: c.mimeType };
        }
        if (c.type === 'resource') {
          return {
            type: 'resource' as const,
            resource: {
              uri: c.uri,
              mimeType: c.mimeType,
              text: c.text,
              blob: c.blob,
            },
          };
        }
        return { type: 'text' as const, text: JSON.stringify(c) };
      }),
      isError: result.isError,
    };
  });

  return {
    server,

    async start() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },

    getTools() {
      return [...tools];
    },
  };
}

/**
 * Create a simple tool server that can be run as a standalone process.
 * Useful for development and testing.
 *
 * @example
 * ```typescript
 * // tools-server.ts
 * import { runToolServer, tool } from 'claude-agent-sdk-vercel-sandbox';
 * import { z } from 'zod';
 *
 * runToolServer({
 *   name: 'my-tools',
 *   tools: [
 *     tool('echo', 'Echo back the input', { message: z.string() },
 *       async ({ message }) => ({ content: [{ type: 'text', text: message }] })
 *     ),
 *   ],
 * });
 * ```
 */
export async function runToolServer(config: McpServerConfig): Promise<void> {
  const mcpServer = createSdkMcpServer(config);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    process.exit(0);
  });

  await mcpServer.start();
}

/**
 * Type for MCP tool call requests (used when handling tool calls manually)
 */
export interface ToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Execute a tool call request against a set of tools.
 * Useful when you want to handle tool calls without starting a full MCP server.
 */
export async function handleToolCall(
  tools: ToolDefinition[],
  request: ToolCallRequest
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const tool = tools.find((t) => t.name === request.name);

  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${request.name}` }],
      isError: true,
    };
  }

  const result = await executeTool(tool, request.arguments);

  return {
    content: result.content.map((c) => ({
      type: c.type,
      text: c.type === 'text' ? c.text : JSON.stringify(c),
    })),
    isError: result.isError,
  };
}
