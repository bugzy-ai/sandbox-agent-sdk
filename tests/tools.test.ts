/**
 * Tests for SDK tool system
 */

import { z } from 'zod';
import {
  tool,
  executeTool,
  textResult,
  jsonResult,
  errorResult,
  withToolErrorHandling,
} from '../src/tools/tool.js';
import {
  zodToJsonSchema,
  toolToJsonSchema,
  type ToolDefinition,
} from '../src/tools/types.js';
import { ToolError } from '../src/types/errors.js';

describe('tool() function', () => {
  it('should create a tool definition with name, description, and schema', () => {
    const calculator = tool(
      'calculator',
      'Perform arithmetic',
      { a: z.number(), b: z.number() },
      async ({ a, b }) => textResult(String(a + b))
    );

    expect(calculator.name).toBe('calculator');
    expect(calculator.description).toBe('Perform arithmetic');
    expect(calculator.schema).toBeDefined();
    expect(calculator.handler).toBeInstanceOf(Function);
  });

  it('should create a schema that validates input', () => {
    const greet = tool(
      'greet',
      'Say hello',
      { name: z.string() },
      async ({ name }) => textResult(`Hello, ${name}!`)
    );

    // Valid input
    const validResult = greet.schema.safeParse({ name: 'World' });
    expect(validResult.success).toBe(true);

    // Invalid input
    const invalidResult = greet.schema.safeParse({ name: 123 });
    expect(invalidResult.success).toBe(false);
  });
});

describe('executeTool()', () => {
  it('should execute tool with valid input', async () => {
    const calculator = tool(
      'calculator',
      'Add numbers',
      { a: z.number(), b: z.number() },
      async ({ a, b }) => textResult(String(a + b))
    );

    const result = await executeTool(calculator, { a: 2, b: 3 });

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'text', text: '5' });
  });

  it('should return validation error for invalid input', async () => {
    const calculator = tool(
      'calculator',
      'Add numbers',
      { a: z.number(), b: z.number() },
      async ({ a, b }) => textResult(String(a + b))
    );

    const result = await executeTool(calculator, { a: 'not a number', b: 3 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe('text');
    expect((result.content[0] as { text: string }).text).toContain('Validation error');
  });

  it('should return error for missing required fields', async () => {
    const calculator = tool(
      'calculator',
      'Add numbers',
      { a: z.number(), b: z.number() },
      async ({ a, b }) => textResult(String(a + b))
    );

    const result = await executeTool(calculator, { a: 2 });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Validation error');
  });

  it('should catch and wrap handler errors', async () => {
    const failingTool = tool(
      'failing',
      'Always fails',
      { input: z.string() },
      async () => {
        throw new Error('Something went wrong');
      }
    );

    const result = await executeTool(failingTool, { input: 'test' });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Tool execution error');
    expect((result.content[0] as { text: string }).text).toContain('Something went wrong');
  });

  it('should handle optional fields', async () => {
    const greet = tool(
      'greet',
      'Greet someone',
      { name: z.string(), title: z.string().optional() },
      async ({ name, title }) => textResult(title ? `Hello, ${title} ${name}!` : `Hello, ${name}!`)
    );

    const withTitle = await executeTool(greet, { name: 'Smith', title: 'Dr.' });
    expect((withTitle.content[0] as { text: string }).text).toBe('Hello, Dr. Smith!');

    const withoutTitle = await executeTool(greet, { name: 'Smith' });
    expect((withoutTitle.content[0] as { text: string }).text).toBe('Hello, Smith!');
  });
});

describe('Result helpers', () => {
  describe('textResult()', () => {
    it('should create text result', () => {
      const result = textResult('Hello');

      expect(result.content).toEqual([{ type: 'text', text: 'Hello' }]);
      expect(result.isError).toBeUndefined();
    });

    it('should create text error result', () => {
      const result = textResult('Error occurred', true);

      expect(result.content).toEqual([{ type: 'text', text: 'Error occurred' }]);
      expect(result.isError).toBe(true);
    });
  });

  describe('jsonResult()', () => {
    it('should create formatted JSON result', () => {
      const data = { foo: 'bar', num: 42 };
      const result = jsonResult(data);

      expect(result.content[0]?.type).toBe('text');
      expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(data);
    });

    it('should format with indentation', () => {
      const result = jsonResult({ a: 1 });
      const text = (result.content[0] as { text: string }).text;

      expect(text).toContain('\n'); // Has newlines for formatting
    });
  });

  describe('errorResult()', () => {
    it('should create error result', () => {
      const result = errorResult('Something failed');

      expect(result.content).toEqual([{ type: 'text', text: 'Something failed' }]);
      expect(result.isError).toBe(true);
    });
  });
});

describe('withToolErrorHandling()', () => {
  it('should return result on success', async () => {
    const result = await withToolErrorHandling('myTool', async () => 42);

    expect(result).toBe(42);
  });

  it('should wrap error in ToolError', async () => {
    await expect(
      withToolErrorHandling('myTool', async () => {
        throw new Error('Original error');
      })
    ).rejects.toThrow(ToolError);
  });

  it('should include tool name in error', async () => {
    try {
      await withToolErrorHandling('calculator', async () => {
        throw new Error('Division by zero');
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).toolName).toBe('calculator');
      expect((error as ToolError).message).toContain('calculator');
    }
  });
});

describe('zodToJsonSchema()', () => {
  it('should convert simple object schema', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties).toEqual({
      name: { type: 'string' },
      age: { type: 'number' },
    });
    expect(jsonSchema.required).toContain('name');
    expect(jsonSchema.required).toContain('age');
  });

  it('should handle optional fields', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema.required).toContain('required');
    expect(jsonSchema.required).not.toContain('optional');
  });

  it('should handle nullable fields', () => {
    const schema = z.object({
      required: z.string(),
      nullable: z.string().nullable(),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema.required).toContain('required');
    expect(jsonSchema.required).not.toContain('nullable');
  });

  it('should handle boolean type', () => {
    const schema = z.object({
      flag: z.boolean(),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema.properties?.['flag']).toEqual({ type: 'boolean' });
  });

  it('should handle array type', () => {
    const schema = z.object({
      items: z.array(z.string()),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema.properties?.['items']).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('should handle nested objects', () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        email: z.string(),
      }),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema.properties?.['user']).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
      },
      required: ['name', 'email'],
    });
  });

  it('should handle enum type', () => {
    const schema = z.object({
      status: z.enum(['active', 'inactive', 'pending']),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema.properties?.['status']).toEqual({
      type: 'string',
      enum: ['active', 'inactive', 'pending'],
    });
  });

  it('should handle literal type', () => {
    const schema = z.object({
      type: z.literal('user'),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema.properties?.['type']).toEqual({
      const: 'user',
      type: 'string',
    });
  });

  it('should handle union type', () => {
    const schema = z.object({
      value: z.union([z.string(), z.number()]),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema.properties?.['value']).toEqual({
      oneOf: [{ type: 'string' }, { type: 'number' }],
    });
  });

  it('should handle default values', () => {
    const schema = z.object({
      count: z.number().default(10),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema.properties?.['count']).toEqual({
      type: 'number',
      default: 10,
    });
  });

  it('should include descriptions', () => {
    const schema = z.object({
      name: z.string().describe('The user name'),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema.properties?.['name']).toEqual({
      type: 'string',
      description: 'The user name',
    });
  });

  it('should handle z.any()', () => {
    const schema = z.object({
      data: z.any(),
    });

    const jsonSchema = zodToJsonSchema(schema);

    // z.any() should produce empty schema (accepts anything)
    expect(jsonSchema.properties?.['data']).toEqual({});
  });
});

describe('toolToJsonSchema()', () => {
  it('should convert tool definition to JSON schema', () => {
    const calculator: ToolDefinition = tool(
      'calculator',
      'Perform arithmetic calculations',
      {
        operation: z.enum(['add', 'subtract']),
        a: z.number().describe('First operand'),
        b: z.number().describe('Second operand'),
      },
      async () => textResult('42')
    );

    const jsonSchema = toolToJsonSchema(calculator);

    expect(jsonSchema.name).toBe('calculator');
    expect(jsonSchema.description).toBe('Perform arithmetic calculations');
    expect(jsonSchema.inputSchema.type).toBe('object');
    expect(jsonSchema.inputSchema.properties?.['operation']).toEqual({
      type: 'string',
      enum: ['add', 'subtract'],
    });
    expect(jsonSchema.inputSchema.properties?.['a']).toEqual({
      type: 'number',
      description: 'First operand',
    });
  });
});
