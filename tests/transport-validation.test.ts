/**
 * Tests for transport layer message validation
 *
 * These tests verify that the message enrichment and validation
 * in the SandboxTransport works correctly.
 */

import { SandboxTransport } from '../src/transport/sandbox-transport.js';
import { ParseError } from '../src/types/errors.js';

// Create a test class that exposes the private enrichMessage method
class TestableTransport extends SandboxTransport {
  public testEnrichMessage(rawMessage: unknown) {
    // Access the private method via any cast (for testing only)
    return (this as any).enrichMessage(rawMessage);
  }
}

describe('SandboxTransport message validation', () => {
  let transport: TestableTransport;

  beforeEach(() => {
    transport = new TestableTransport();
  });

  describe('enrichMessage()', () => {
    it('should enrich valid assistant message', () => {
      const raw = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
        },
      };

      const enriched = transport.testEnrichMessage(raw);

      expect(enriched.type).toBe('assistant');
      expect(enriched.uuid).toBeDefined();
      expect(enriched.session_id).toBeDefined();
      expect(enriched.parent_tool_use_id).toBeNull();
    });

    it('should enrich valid system message', () => {
      const raw = {
        type: 'system',
        subtype: 'session_started',
      };

      const enriched = transport.testEnrichMessage(raw);

      expect(enriched.type).toBe('system');
      expect(enriched.uuid).toBeDefined();
    });

    it('should enrich valid result message', () => {
      const raw = {
        type: 'result',
        subtype: 'success',
        result: 'Task completed',
      };

      const enriched = transport.testEnrichMessage(raw);

      expect(enriched.type).toBe('result');
      expect(enriched.subtype).toBe('success');
    });

    it('should preserve existing uuid and session_id', () => {
      const raw = {
        type: 'assistant',
        uuid: 'existing-uuid',
        session_id: 'existing-session',
        parent_tool_use_id: 'tool-123',
        message: { role: 'assistant', content: [] },
      };

      const enriched = transport.testEnrichMessage(raw);

      expect(enriched.uuid).toBe('existing-uuid');
      expect(enriched.session_id).toBe('existing-session');
      expect(enriched.parent_tool_use_id).toBe('tool-123');
    });

    it('should throw ParseError for null input', () => {
      expect(() => transport.testEnrichMessage(null)).toThrow(ParseError);
    });

    it('should throw ParseError for non-object input', () => {
      expect(() => transport.testEnrichMessage('string')).toThrow(ParseError);
      expect(() => transport.testEnrichMessage(123)).toThrow(ParseError);
      expect(() => transport.testEnrichMessage(true)).toThrow(ParseError);
    });

    it('should throw ParseError for missing type field', () => {
      expect(() => transport.testEnrichMessage({ foo: 'bar' })).toThrow(ParseError);
    });

    it('should throw ParseError for invalid type field', () => {
      expect(() => transport.testEnrichMessage({ type: 123 })).toThrow(ParseError);
      expect(() => transport.testEnrichMessage({ type: null })).toThrow(ParseError);
    });

    it('should throw ParseError for unknown message type', () => {
      expect(() => transport.testEnrichMessage({ type: 'unknown_type' })).toThrow(ParseError);
    });

    it('should add default message object for assistant without message', () => {
      const raw = {
        type: 'assistant',
      };

      const enriched = transport.testEnrichMessage(raw);

      expect(enriched.message).toBeDefined();
      expect(enriched.message.role).toBe('assistant');
      expect(enriched.message.content).toEqual([]);
    });

    it('should add default message object for user without message', () => {
      const raw = {
        type: 'user',
      };

      const enriched = transport.testEnrichMessage(raw);

      expect(enriched.message).toBeDefined();
      expect(enriched.message.role).toBe('user');
    });

    it('should add default subtype for result without subtype', () => {
      const raw = {
        type: 'result',
      };

      const enriched = transport.testEnrichMessage(raw);

      expect(enriched.subtype).toBe('success');
    });

    it('should add default error object for error without error', () => {
      const raw = {
        type: 'error',
      };

      const enriched = transport.testEnrichMessage(raw);

      expect(enriched.error).toBeDefined();
      expect(enriched.error.code).toBe('UNKNOWN_ERROR');
      expect(enriched.error.message).toBeDefined();
    });

    it('should handle tool_use message', () => {
      const raw = {
        type: 'tool_use',
        tool_use_id: 'tool-123',
        name: 'calculator',
        input: { a: 1, b: 2 },
      };

      const enriched = transport.testEnrichMessage(raw);

      expect(enriched.type).toBe('tool_use');
      expect(enriched.tool_use_id).toBe('tool-123');
      expect(enriched.name).toBe('calculator');
    });

    it('should handle progress message', () => {
      const raw = {
        type: 'progress',
        message: 'Loading...',
        percent: 50,
      };

      const enriched = transport.testEnrichMessage(raw);

      expect(enriched.type).toBe('progress');
      expect(enriched.message).toBe('Loading...');
      expect(enriched.percent).toBe(50);
    });
  });

  describe('Valid message types', () => {
    const validTypes = ['system', 'user', 'assistant', 'result', 'tool_use', 'progress', 'error'];

    validTypes.forEach((type) => {
      it(`should accept message type: ${type}`, () => {
        const raw = { type };

        // Should not throw
        expect(() => transport.testEnrichMessage(raw)).not.toThrow();
      });
    });
  });
});
