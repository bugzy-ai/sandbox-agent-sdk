/**
 * Tool Type Definitions
 *
 * Types for defining custom tools that Claude can use.
 */

import { z } from 'zod';

/**
 * Content block types for tool results
 */
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export interface ResourceContent {
  type: 'resource';
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export type ToolResultContent = TextContent | ImageContent | ResourceContent;

/**
 * Result returned from a tool execution
 */
export interface ToolResult {
  /**
   * Content to return to Claude.
   */
  content: ToolResultContent[];

  /**
   * Whether the result represents an error.
   */
  isError?: boolean;
}

/**
 * Zod schema type for tool parameters
 */
export type ToolSchema = z.ZodObject<z.ZodRawShape>;

/**
 * Handler function type for tool execution
 */
export type ToolHandler<TSchema extends ToolSchema> = (
  args: z.infer<TSchema>
) => Promise<ToolResult> | ToolResult;

/**
 * Tool definition with schema and handler
 */
export interface ToolDefinition<TSchema extends ToolSchema = ToolSchema> {
  /**
   * Unique name for the tool.
   */
  name: string;

  /**
   * Description of what the tool does.
   * This is shown to Claude to help it decide when to use the tool.
   */
  description: string;

  /**
   * Zod schema defining the tool's input parameters.
   */
  schema: TSchema;

  /**
   * Handler function that executes the tool.
   */
  handler: ToolHandler<TSchema>;
}

/**
 * JSON Schema representation of a tool (for MCP protocol)
 */
export interface ToolJsonSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Convert a Zod schema to JSON Schema format
 */
export function zodToJsonSchema(schema: ToolSchema): {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
} {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny;
    properties[key] = zodTypeToJsonSchema(zodType);

    // Check if required (not optional/nullable)
    if (!zodType.isOptional() && !zodType.isNullable()) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

/**
 * Convert a Zod type to JSON Schema
 */
function zodTypeToJsonSchema(zodType: z.ZodTypeAny): Record<string, unknown> {
  const description = zodType.description;
  const baseSchema: Record<string, unknown> = {};

  if (description) {
    baseSchema['description'] = description;
  }

  // Handle optional/nullable wrappers
  if (zodType instanceof z.ZodOptional || zodType instanceof z.ZodNullable) {
    return zodTypeToJsonSchema(zodType.unwrap());
  }

  // Handle default wrappers
  if (zodType instanceof z.ZodDefault) {
    const inner = zodTypeToJsonSchema(zodType._def.innerType);
    return { ...inner, default: zodType._def.defaultValue() };
  }

  // Handle primitive types
  if (zodType instanceof z.ZodString) {
    return { ...baseSchema, type: 'string' };
  }

  if (zodType instanceof z.ZodNumber) {
    return { ...baseSchema, type: 'number' };
  }

  if (zodType instanceof z.ZodBoolean) {
    return { ...baseSchema, type: 'boolean' };
  }

  if (zodType instanceof z.ZodArray) {
    return {
      ...baseSchema,
      type: 'array',
      items: zodTypeToJsonSchema(zodType.element),
    };
  }

  if (zodType instanceof z.ZodObject) {
    return { ...baseSchema, ...zodToJsonSchema(zodType) };
  }

  if (zodType instanceof z.ZodEnum) {
    return {
      ...baseSchema,
      type: 'string',
      enum: zodType.options,
    };
  }

  if (zodType instanceof z.ZodLiteral) {
    const value = zodType.value;
    return {
      ...baseSchema,
      const: value,
      type: typeof value,
    };
  }

  if (zodType instanceof z.ZodUnion) {
    return {
      ...baseSchema,
      oneOf: zodType.options.map(zodTypeToJsonSchema),
    };
  }

  if (zodType instanceof z.ZodAny) {
    return baseSchema;
  }

  // Default fallback
  return baseSchema;
}

/**
 * Convert a ToolDefinition to JSON Schema format
 */
export function toolToJsonSchema(tool: ToolDefinition): ToolJsonSchema {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.schema),
  };
}
