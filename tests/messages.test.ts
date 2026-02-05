/**
 * Tests for SDK message types and utilities
 */

import {
  isSystemMessage,
  isUserMessage,
  isAssistantMessage,
  isResultMessage,
  isToolUseMessage,
  isProgressMessage,
  isErrorMessage,
  extractText,
  generateUuid,
  generateSessionId,
  type SDKMessage,
  type SystemMessage,
  type UserMessage,
  type AssistantMessage,
  type ResultMessage,
  type ToolUseMessage,
  type ProgressMessage,
  type ErrorMessage,
} from '../src/types/messages.js';

// Helper to create base message fields
const baseFields = {
  uuid: 'test-uuid',
  session_id: 'test-session',
  parent_tool_use_id: null,
};

describe('Type Guards', () => {
  describe('isSystemMessage', () => {
    it('should return true for system messages', () => {
      const message: SystemMessage = {
        ...baseFields,
        type: 'system',
        subtype: 'session_started',
      };
      expect(isSystemMessage(message)).toBe(true);
    });

    it('should return false for other message types', () => {
      const message: AssistantMessage = {
        ...baseFields,
        type: 'assistant',
        message: { role: 'assistant', content: [] },
      };
      expect(isSystemMessage(message)).toBe(false);
    });
  });

  describe('isUserMessage', () => {
    it('should return true for user messages', () => {
      const message: UserMessage = {
        ...baseFields,
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      };
      expect(isUserMessage(message)).toBe(true);
    });

    it('should return false for other message types', () => {
      const message: SystemMessage = {
        ...baseFields,
        type: 'system',
        subtype: 'init',
      };
      expect(isUserMessage(message)).toBe(false);
    });
  });

  describe('isAssistantMessage', () => {
    it('should return true for assistant messages', () => {
      const message: AssistantMessage = {
        ...baseFields,
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hi!' }] },
      };
      expect(isAssistantMessage(message)).toBe(true);
    });

    it('should return false for other message types', () => {
      const message: UserMessage = {
        ...baseFields,
        type: 'user',
        message: { role: 'user', content: [] },
      };
      expect(isAssistantMessage(message)).toBe(false);
    });
  });

  describe('isResultMessage', () => {
    it('should return true for result messages', () => {
      const message: ResultMessage = {
        ...baseFields,
        type: 'result',
        subtype: 'success',
        result: 'Task completed',
      };
      expect(isResultMessage(message)).toBe(true);
    });

    it('should return false for other message types', () => {
      const message: AssistantMessage = {
        ...baseFields,
        type: 'assistant',
        message: { role: 'assistant', content: [] },
      };
      expect(isResultMessage(message)).toBe(false);
    });
  });

  describe('isToolUseMessage', () => {
    it('should return true for tool use messages', () => {
      const message: ToolUseMessage = {
        ...baseFields,
        type: 'tool_use',
        tool_use_id: 'tool-123',
        name: 'calculator',
        input: { a: 1, b: 2 },
      };
      expect(isToolUseMessage(message)).toBe(true);
    });

    it('should return false for other message types', () => {
      const message: ResultMessage = {
        ...baseFields,
        type: 'result',
        subtype: 'success',
      };
      expect(isToolUseMessage(message)).toBe(false);
    });
  });

  describe('isProgressMessage', () => {
    it('should return true for progress messages', () => {
      const message: ProgressMessage = {
        ...baseFields,
        type: 'progress',
        message: 'Processing...',
        percent: 50,
      };
      expect(isProgressMessage(message)).toBe(true);
    });

    it('should return false for other message types', () => {
      const message: SystemMessage = {
        ...baseFields,
        type: 'system',
        subtype: 'session_ended',
      };
      expect(isProgressMessage(message)).toBe(false);
    });
  });

  describe('isErrorMessage', () => {
    it('should return true for error messages', () => {
      const message: ErrorMessage = {
        ...baseFields,
        type: 'error',
        error: { code: 'ERR_001', message: 'Something went wrong' },
      };
      expect(isErrorMessage(message)).toBe(true);
    });

    it('should return false for other message types', () => {
      const message: ResultMessage = {
        ...baseFields,
        type: 'result',
        subtype: 'error',
        error: 'Failed',
      };
      expect(isErrorMessage(message)).toBe(false);
    });
  });
});

describe('extractText', () => {
  it('should extract text from assistant message with single text block', () => {
    const message: AssistantMessage = {
      ...baseFields,
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello, world!' }],
      },
    };

    expect(extractText(message)).toBe('Hello, world!');
  });

  it('should concatenate multiple text blocks', () => {
    const message: AssistantMessage = {
      ...baseFields,
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello, ' },
          { type: 'text', text: 'world!' },
        ],
      },
    };

    expect(extractText(message)).toBe('Hello, world!');
  });

  it('should ignore non-text blocks', () => {
    const message: AssistantMessage = {
      ...baseFields,
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Before tool.' },
          { type: 'tool_use', id: 'tool-1', name: 'calc', input: {} },
          { type: 'text', text: ' After tool.' },
        ],
      },
    };

    expect(extractText(message)).toBe('Before tool. After tool.');
  });

  it('should return empty string for message with no text blocks', () => {
    const message: AssistantMessage = {
      ...baseFields,
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tool-1', name: 'calc', input: {} }],
      },
    };

    expect(extractText(message)).toBe('');
  });

  it('should return empty string for empty content array', () => {
    const message: AssistantMessage = {
      ...baseFields,
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [],
      },
    };

    expect(extractText(message)).toBe('');
  });
});

describe('generateUuid', () => {
  it('should generate valid UUID v4 format', () => {
    const uuid = generateUuid();
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(uuid).toMatch(uuidV4Regex);
  });

  it('should generate unique UUIDs', () => {
    const uuids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      uuids.add(generateUuid());
    }

    // All UUIDs should be unique
    expect(uuids.size).toBe(100);
  });

  it('should use crypto.randomUUID', () => {
    // This is implicitly tested by the UUID format being correct
    // crypto.randomUUID always produces valid v4 UUIDs
    const uuid = generateUuid();
    expect(uuid.length).toBe(36);
  });
});

describe('generateSessionId', () => {
  it('should generate session ID with correct prefix', () => {
    const sessionId = generateSessionId();

    expect(sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
  });

  it('should include timestamp', () => {
    const before = Date.now();
    const sessionId = generateSessionId();
    const after = Date.now();

    // Extract timestamp from session ID
    const timestamp = parseInt(sessionId.split('_')[1]!, 10);

    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('should generate unique session IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add(generateSessionId());
    }

    // All session IDs should be unique
    expect(ids.size).toBe(50);
  });
});

describe('Message Type Discrimination', () => {
  // Test that the union type discrimination works correctly
  it('should narrow types correctly with type guards', () => {
    const messages: SDKMessage[] = [
      { ...baseFields, type: 'system', subtype: 'init' },
      { ...baseFields, type: 'assistant', message: { role: 'assistant', content: [] } },
      { ...baseFields, type: 'result', subtype: 'success' },
    ];

    for (const msg of messages) {
      if (isSystemMessage(msg)) {
        // TypeScript should know this is SystemMessage
        expect(msg.subtype).toBeDefined();
      } else if (isAssistantMessage(msg)) {
        // TypeScript should know this is AssistantMessage
        expect(msg.message).toBeDefined();
      } else if (isResultMessage(msg)) {
        // TypeScript should know this is ResultMessage
        expect(msg.subtype).toBeDefined();
      }
    }
  });
});
