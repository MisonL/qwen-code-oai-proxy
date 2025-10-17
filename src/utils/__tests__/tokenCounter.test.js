/**
 * Token计数工具测试
 * 测试token计数功能是否正确
 */

const { countTokens } = require('../tokenCounter.js');

describe('TokenCounter', () => {
  describe('countTokens', () => {
    it('should count tokens in a simple string', () => {
      const input = 'Hello, world!';
      const tokenCount = countTokens(input);
      expect(tokenCount).toBeGreaterThan(0);
    });

    it('should count tokens in an array of messages', () => {
      const input = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];
      const tokenCount = countTokens(input);
      expect(tokenCount).toBeGreaterThan(0);
    });

    it('should count tokens in a single message object', () => {
      const input = { 
        role: 'user', 
        content: 'This is a test message' 
      };
      const tokenCount = countTokens(input);
      expect(tokenCount).toBeGreaterThan(0);
    });

    it('should handle edge cases', () => {
      expect(countTokens('')).toBe(0); // Empty string has 0 tokens
      expect(countTokens(null)).toBeGreaterThan(0); // null becomes "null" string
      expect(countTokens(undefined)).toBeGreaterThan(0); // undefined becomes "undefined" string
      expect(countTokens(123)).toBeGreaterThan(0);
      expect(countTokens({})).toBeGreaterThan(0);
      expect(countTokens([])).toBeGreaterThan(0);
    });
  });
});