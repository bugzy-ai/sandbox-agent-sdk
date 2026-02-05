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
 * Compatible with both Zod v3 and v4
 */
export function zodToJsonSchema(schema: ToolSchema): {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
} {
  // Access shape - works in both v3 and v4
  const shape = schema.shape || (schema as unknown as { _zod?: { def?: { shape?: Record<string, z.ZodTypeAny> } } })._zod?.def?.shape || {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny;
    properties[key] = zodTypeToJsonSchema(zodType);

    // Check if required (not optional/nullable) - compatible with v3 and v4
    const typeName = getZodTypeName(zodType);
    const isOpt = typeName === 'ZodOptional' || typeName === 'optional' ||
                  typeName === 'ZodNullable' || typeName === 'nullable' ||
                  (typeof zodType.isOptional === 'function' && zodType.isOptional()) ||
                  (typeof zodType.isNullable === 'function' && zodType.isNullable());

    if (!isOpt) {
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
 * Get the Zod type name from a ZodType (compatible with Zod v3 and v4)
 */
function getZodTypeName(zodType: z.ZodTypeAny): string {
  // Zod v4 uses _zod.def.type, v3 uses _def.typeName
  const def = (zodType as unknown as { _zod?: { def?: { type?: string } }; _def?: { typeName?: string } });
  return def._zod?.def?.type || def._def?.typeName || 'unknown';
}

/**
 * Convert a Zod type to JSON Schema
 * Compatible with both Zod v3 and v4
 */
function zodTypeToJsonSchema(zodType: z.ZodTypeAny): Record<string, unknown> {
  const description = zodType.description;
  const baseSchema: Record<string, unknown> = {};

  if (description) {
    baseSchema['description'] = description;
  }

  const typeName = getZodTypeName(zodType);

  // Handle optional/nullable wrappers
  if (typeName === 'ZodOptional' || typeName === 'optional' ||
      typeName === 'ZodNullable' || typeName === 'nullable') {
    // Access inner type - works for both v3 and v4
    const inner = (zodType as unknown as { unwrap?: () => z.ZodTypeAny; _def?: { innerType?: z.ZodTypeAny } });
    const innerType = inner.unwrap?.() || inner._def?.innerType;
    if (innerType) {
      return zodTypeToJsonSchema(innerType);
    }
  }

  // Handle default wrappers
  if (typeName === 'ZodDefault' || typeName === 'default') {
    const def = (zodType as unknown as { _def?: { innerType?: z.ZodTypeAny; defaultValue?: () => unknown } });
    if (def._def?.innerType) {
      const inner = zodTypeToJsonSchema(def._def.innerType);
      return { ...inner, default: def._def.defaultValue?.() };
    }
  }

  // Handle primitive types
  if (typeName === 'ZodString' || typeName === 'string') {
    return { ...baseSchema, type: 'string' };
  }

  if (typeName === 'ZodNumber' || typeName === 'number' || typeName === 'int' || typeName === 'float') {
    return { ...baseSchema, type: 'number' };
  }

  if (typeName === 'ZodBoolean' || typeName === 'boolean') {
    return { ...baseSchema, type: 'boolean' };
  }

  if (typeName === 'ZodArray' || typeName === 'array') {
    const arr = zodType as unknown as { element?: z.ZodTypeAny; _def?: { type?: z.ZodTypeAny } };
    const elementType = arr.element || arr._def?.type;
    return {
      ...baseSchema,
      type: 'array',
      items: elementType ? zodTypeToJsonSchema(elementType) : {},
    };
  }

  if (typeName === 'ZodObject' || typeName === 'object') {
    return { ...baseSchema, ...zodToJsonSchema(zodType as ToolSchema) };
  }

  if (typeName === 'ZodEnum' || typeName === 'enum') {
    const enumType = zodType as unknown as { options?: string[]; _def?: { values?: string[] } };
    const options = enumType.options || enumType._def?.values || [];
    return {
      ...baseSchema,
      type: 'string',
      enum: options,
    };
  }

  if (typeName === 'ZodLiteral' || typeName === 'literal') {
    const lit = zodType as unknown as { value?: unknown; _def?: { value?: unknown } };
    const value = lit.value ?? lit._def?.value;
    return {
      ...baseSchema,
      const: value,
      type: typeof value,
    };
  }

  if (typeName === 'ZodUnion' || typeName === 'union') {
    const union = zodType as unknown as { options?: z.ZodTypeAny[]; _def?: { options?: z.ZodTypeAny[] } };
    const options = union.options || union._def?.options || [];
    return {
      ...baseSchema,
      oneOf: options.map(zodTypeToJsonSchema),
    };
  }

  if (typeName === 'ZodRecord' || typeName === 'record') {
    // Handle z.record() - map to object with additionalProperties
    const rec = zodType as unknown as { _def?: { valueType?: z.ZodTypeAny } };
    const valueType = rec._def?.valueType;
    return {
      ...baseSchema,
      type: 'object',
      additionalProperties: valueType ? zodTypeToJsonSchema(valueType) : true,
    };
  }

  if (typeName === 'ZodAny' || typeName === 'any' || typeName === 'ZodUnknown' || typeName === 'unknown') {
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
