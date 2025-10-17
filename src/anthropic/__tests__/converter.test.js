/**
 * Anthropic API 转换器测试
 * 测试 Anthropic API 到 Qwen API 的请求和响应转换
 */

const { anthropicToQwenConverter, qwenToAnthropicConverter } = require('../converter.js');

describe('Anthropic API Converters', () => {
  describe('anthropicToQwenConverter', () => {
    it('should convert Anthropic model names to Qwen model names', () => {
      const input = {
        model: 'claude-3-5-sonnet-latest',
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ],
        max_tokens: 1000
      };

      const result = anthropicToQwenConverter(input);

      expect(result.model).toBe('qwen3-coder-plus');
      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: input.messages[0].content }
          ]
        }
      ]);
      expect(result.max_tokens).toBe(1000);
    });

    it('should handle different Anthropic models', () => {
      const testCases = [
        { input: 'claude-3-5-sonnet-latest', expected: 'qwen3-coder-plus' },
        { input: 'claude-haiku-4-5-20251001', expected: 'qwen3-coder-flash' },
        { input: 'claude-3-5-sonnet-latest-vision', expected: 'vision-model' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = anthropicToQwenConverter({ model: input, messages: [{role: 'user', content: 'test'}], max_tokens: 100 });
        expect(result.model).toBe(expected);
      });
    });

    it('should handle system messages', () => {
      const input = {
        model: 'claude-3-5-sonnet-latest',
        system: 'You are a helpful assistant',
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ],
        max_tokens: 1000
      };

      const result = anthropicToQwenConverter(input);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant'
      });
    });

    it('should handle Anthropic content blocks', () => {
      const input = {
        model: 'claude-3-5-sonnet-latest',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What do you see in this image?' },
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'base64imagestring' } }
            ]
          }
        ],
        max_tokens: 1000
      };

      const result = anthropicToQwenConverter(input);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toHaveLength(2);
      expect(result.messages[0].content[0]).toEqual({ type: 'text', text: 'What do you see in this image?' });
      expect(result.messages[0].content[1]).toEqual({ 
        type: 'image_url', 
        image_url: { 
          url: 'base64imagestring' 
        } 
      });
    });

    it('should handle Anthropic parameters', () => {
      const input = {
        model: 'claude-3-5-sonnet-latest',
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ],
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 5,
        stop_sequences: ['STOP'],
        metadata: { user_id: 'test-user' }
      };

      const result = anthropicToQwenConverter(input);

      expect(result.max_tokens).toBe(1000);
      expect(result.temperature).toBe(0.7);
      expect(result.top_p).toBe(0.9);
      expect(result.top_k).toBe(5);
      expect(result.stop).toEqual(['STOP']);
      expect(result.metadata).toEqual({ user_id: 'test-user' });
    });

    it('should force vision model when image content is detected', () => {
      const input = {
        model: 'claude-3-5-sonnet-latest',
        messages: [
          {
            role: 'user',
            content: 'Check this image: https://example.com/image.jpg'
          }
        ],
        max_tokens: 1000
      };

      const result = anthropicToQwenConverter(input);

      expect(result.model).toBe('vision-model'); // Should be forced to vision model
    });
  });

  describe('qwenToAnthropicConverter', () => {
    it('should convert Qwen response to Anthropic format', () => {
      const input = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'qwen3-coder-plus',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello, how can I help you?'
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      };

      const result = qwenToAnthropicConverter(input);

      expect(result.id).toBe('chatcmpl-123');
      expect(result.type).toBe('message');
      expect(result.role).toBe('assistant');
      expect(result.model).toBe('qwen3-coder-plus'); // Uses the original model from Qwen response
      expect(result.content).toEqual([
        {
          type: 'text',
          text: 'Hello, how can I help you?'
        }
      ]);
      expect(result.stop_reason).toBe('end_turn'); // stop -> end_turn
      expect(result.usage).toEqual({
        input_tokens: 10,
        output_tokens: 20
      });
    });

    it('should handle length finish reason', () => {
      const input = {
        choices: [
          {
            message: { content: 'Some content' },
            finish_reason: 'length'
          }
        ]
      };

      const result = qwenToAnthropicConverter(input);

      expect(result.stop_reason).toBe('max_tokens'); // length -> max_tokens
    });

    it('should handle error responses', () => {
      const input = {
        error: {
          message: 'An error occurred'
        }
      };

      const result = qwenToAnthropicConverter(input);

      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('An error occurred');
    });

    it('should handle stream responses', () => {
      const input = {
        choices: [
          {
            delta: {
              content: 'Hello'
            }
          }
        ]
      };

      const result = qwenToAnthropicConverter(input, true); // isStream = true

      expect(result).toEqual({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: 'Hello'
        }
      });
    });

    it('should handle stream finish', () => {
      const input = {
        choices: [
          {
            finish_reason: 'stop'
          }
        ],
        usage: {
          completion_tokens: 50
        }
      };

      const result = qwenToAnthropicConverter(input, true); // isStream = true

      expect(result).toEqual({
        type: 'message_delta',
        delta: {
          stop_reason: 'end_turn',
          stop_sequence: null
        },
        usage: {
          output_tokens: 50
        }
      });
    });
  });
});