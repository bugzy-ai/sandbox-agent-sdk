/**
 * Supabase Query Tool Example
 *
 * This example demonstrates how to create a custom tool
 * that allows Claude to query your Supabase database.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { tool, textResult, jsonResult, errorResult } from 'claude-agent-sdk-vercel-sandbox';
import { z } from 'zod';

// Initialize Supabase client
const supabase: SupabaseClient = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_ANON_KEY']!
);

/**
 * Filter operator schema
 */
const FilterSchema = z.object({
  column: z.string().describe('Column name to filter on'),
  operator: z
    .enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'like', 'ilike', 'is', 'in'])
    .describe('Comparison operator'),
  value: z.any().describe('Value to compare against'),
});

/**
 * Tool: Query Database
 *
 * Allows Claude to query the Supabase database.
 */
export const queryDatabase = tool(
  'query_database',
  `Query the Supabase database. Use this to fetch data from tables.
Available tables: users, posts, comments, categories.
Example: To get all posts by a user, use table="posts" with filter column="user_id", operator="eq", value=<user_id>`,
  {
    table: z.string().describe('Table name to query (users, posts, comments, categories)'),
    select: z
      .string()
      .optional()
      .describe('Columns to select. Use "*" for all columns, or comma-separated column names'),
    filters: z
      .array(FilterSchema)
      .optional()
      .describe('Array of filter conditions to apply'),
    orderBy: z
      .object({
        column: z.string(),
        ascending: z.boolean().default(true),
      })
      .optional()
      .describe('Order results by a column'),
    limit: z.number().optional().describe('Maximum number of rows to return'),
  },
  async (args) => {
    try {
      // Start building the query
      let query = supabase.from(args.table).select(args.select || '*');

      // Apply filters
      for (const filter of args.filters || []) {
        const { column, operator, value } = filter;

        switch (operator) {
          case 'eq':
            query = query.eq(column, value);
            break;
          case 'neq':
            query = query.neq(column, value);
            break;
          case 'gt':
            query = query.gt(column, value);
            break;
          case 'lt':
            query = query.lt(column, value);
            break;
          case 'gte':
            query = query.gte(column, value);
            break;
          case 'lte':
            query = query.lte(column, value);
            break;
          case 'like':
            query = query.like(column, value);
            break;
          case 'ilike':
            query = query.ilike(column, value);
            break;
          case 'is':
            query = query.is(column, value);
            break;
          case 'in':
            query = query.in(column, value);
            break;
        }
      }

      // Apply ordering
      if (args.orderBy) {
        query = query.order(args.orderBy.column, {
          ascending: args.orderBy.ascending,
        });
      }

      // Apply limit
      if (args.limit) {
        query = query.limit(args.limit);
      }

      // Execute the query
      const { data, error } = await query;

      if (error) {
        return errorResult(`Database error: ${error.message}`);
      }

      if (!data || data.length === 0) {
        return textResult('No results found.');
      }

      return jsonResult(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return errorResult(`Query failed: ${message}`);
    }
  }
);

/**
 * Tool: Insert Record
 *
 * Allows Claude to insert new records into the database.
 */
export const insertRecord = tool(
  'insert_record',
  'Insert a new record into a database table.',
  {
    table: z.string().describe('Table name to insert into'),
    data: z
      .record(z.any())
      .describe('Object containing column-value pairs for the new record'),
  },
  async (args) => {
    try {
      const { data, error } = await supabase
        .from(args.table)
        .insert(args.data)
        .select();

      if (error) {
        return errorResult(`Insert failed: ${error.message}`);
      }

      return jsonResult({ success: true, inserted: data });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return errorResult(`Insert failed: ${message}`);
    }
  }
);

/**
 * Tool: Update Record
 *
 * Allows Claude to update existing records.
 */
export const updateRecord = tool(
  'update_record',
  'Update existing records in a database table.',
  {
    table: z.string().describe('Table name to update'),
    data: z
      .record(z.any())
      .describe('Object containing column-value pairs to update'),
    filters: z
      .array(FilterSchema)
      .min(1)
      .describe('Filters to identify records to update (required for safety)'),
  },
  async (args) => {
    try {
      let query = supabase.from(args.table).update(args.data);

      // Apply filters (required)
      for (const filter of args.filters) {
        const { column, operator, value } = filter;
        if (operator === 'eq') {
          query = query.eq(column, value);
        }
        // Add other operators as needed
      }

      const { data, error } = await query.select();

      if (error) {
        return errorResult(`Update failed: ${error.message}`);
      }

      return jsonResult({
        success: true,
        updatedCount: data?.length || 0,
        updated: data,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return errorResult(`Update failed: ${message}`);
    }
  }
);

/**
 * Tool: Get Schema
 *
 * Allows Claude to understand the database structure.
 */
export const getTableSchema = tool(
  'get_table_schema',
  'Get the schema/structure of a database table to understand what columns are available.',
  {
    table: z.string().describe('Table name to get schema for'),
  },
  async (args) => {
    // This is a simplified version - in production you might query
    // information_schema or have predefined schemas
    const schemas: Record<string, object> = {
      users: {
        id: 'uuid (primary key)',
        email: 'text (unique)',
        name: 'text',
        created_at: 'timestamp',
        updated_at: 'timestamp',
      },
      posts: {
        id: 'uuid (primary key)',
        user_id: 'uuid (foreign key -> users.id)',
        title: 'text',
        content: 'text',
        category_id: 'uuid (foreign key -> categories.id)',
        published: 'boolean',
        created_at: 'timestamp',
        updated_at: 'timestamp',
      },
      comments: {
        id: 'uuid (primary key)',
        post_id: 'uuid (foreign key -> posts.id)',
        user_id: 'uuid (foreign key -> users.id)',
        content: 'text',
        created_at: 'timestamp',
      },
      categories: {
        id: 'uuid (primary key)',
        name: 'text (unique)',
        description: 'text',
      },
    };

    const schema = schemas[args.table];
    if (!schema) {
      return errorResult(`Unknown table: ${args.table}. Available tables: ${Object.keys(schemas).join(', ')}`);
    }

    return jsonResult({
      table: args.table,
      columns: schema,
    });
  }
);

// Export all tools as an array for easy use with createSdkMcpServer
export const supabaseTools = [
  queryDatabase,
  insertRecord,
  updateRecord,
  getTableSchema,
];
