/**
 * Tool Function
 *
 * Provides a type-safe way to define tools with Zod schemas.
 */

import { z } from 'zod';
import {
  ToolDefinition,
  ToolHandler,
  ToolResult,
} from './types.js';
import { ToolError } from '../types/errors.js';

/**
 * Define a tool with type-safe input validation.
 *
 * @example
 * ```typescript
 * const calculator = tool(
 *   'calculator',
 *   'Perform basic arithmetic calculations',
 *   {
 *     operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
 *     a: z.number(),
 *     b: z.number(),
 *   },
 *   async ({ operation, a, b }) => {
 *     let result: number;
 *     switch (operation) {
 *       case 'add': result = a + b; break;
 *       case 'subtract': result = a - b; break;
 *       case 'multiply': result = a * b; break;
 *       case 'divide': result = a / b; break;
 *     }
 *     return { content: [{ type: 'text', text: String(result) }] };
 *   }
 * );
 * ```
 *
 * @param name - Unique identifier for the tool
 * @param description - Human-readable description shown to Claude
 * @param schemaShape - Object defining the tool's parameters using Zod types
 * @param handler - Async function that executes the tool
 * @returns A ToolDefinition that can be used with createSdkMcpServer
 */
export function tool<TShape extends z.ZodRawShape>(
  name: string,
  description: string,
  schemaShape: TShape,
  handler: ToolHandler<z.ZodObject<TShape>>
): ToolDefinition<z.ZodObject<TShape>> {
  const schema = z.object(schemaShape);

  return {
    name,
    description,
    schema,
    handler,
  };
}

/**
 * Execute a tool with input validation.
 * Automatically validates inputs against the schema and handles errors.
 */
export async function executeTool(
  tool: ToolDefinition,
  input: unknown
): Promise<ToolResult> {
  // Validate input
  const parseResult = tool.schema.safeParse(input);

  if (!parseResult.success) {
    const errors = parseResult.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');

    return {
      content: [{ type: 'text', text: `Validation error: ${errors}` }],
      isError: true,
    };
  }

  try {
    // Execute the handler
    const result = await tool.handler(parseResult.data);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text', text: `Tool execution error: ${message}` }],
      isError: true,
    };
  }
}

/**
 * Create a text-only tool result.
 * Convenience function for the most common tool result type.
 */
export function textResult(text: string, isError?: boolean): ToolResult {
  return {
    content: [{ type: 'text', text }],
    isError,
  };
}

/**
 * Create a JSON tool result.
 * Automatically serializes the data as formatted JSON.
 */
export function jsonResult(data: unknown, isError?: boolean): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

/**
 * Create an error tool result.
 */
export function errorResult(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

/**
 * Helper to wrap async operations with error handling for tools.
 */
export async function withToolErrorHandling<T>(
  toolName: string,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new ToolError(toolName, message, error);
  }
}
