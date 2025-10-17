/**
 * 错误格式化工具测试
 * 测试错误响应格式化功能是否正常
 */

const { ErrorFormatter } = require('../errorFormatter.js');

describe('ErrorFormatter', () => {
  describe('openAIValidationError', () => {
    it('should format validation error response', () => {
      const errorMessage = 'Model is required';
      const result = ErrorFormatter.openAIValidationError(errorMessage);
      
      expect(result).toEqual({
        status: 400,
        body: {
          error: {
            type: 'validation_error',
            message: errorMessage,
            code: 400
          }
        }
      });
    });
  });

  describe('anthropicValidationError', () => {
    it('should format Anthropic validation error response', () => {
      const errorMessage = 'Max tokens is required';
      const result = ErrorFormatter.anthropicValidationError(errorMessage);
      
      expect(result).toEqual({
        status: 400,
        body: {
          error: {
            type: 'validation_error',
            message: errorMessage
          }
        }
      });
    });
  });

  describe('openAIAuthError', () => {
    it('should format OpenAI authentication error response', () => {
      const result = ErrorFormatter.openAIAuthError();
      
      expect(result).toEqual({
        status: 401,
        body: {
          error: {
            type: 'authentication_error',
            message: 'Not authenticated with Qwen. Please authenticate first.',
            code: 401
          }
        }
      });
    });
  });

  describe('anthropicAuthError', () => {
    it('should format Anthropic authentication error response', () => {
      const result = ErrorFormatter.anthropicAuthError();
      
      expect(result).toEqual({
        status: 401,
        body: {
          error: {
            type: 'authentication_error',
            message: 'Not authenticated with Qwen. Please authenticate first.'
          }
        }
      });
    });
  });

  describe('openAIApiError', () => {
    it('should format OpenAI API error response', () => {
      const message = 'Rate limit exceeded';
      const type = 'rate_limit_error';
      const result = ErrorFormatter.openAIApiError(message, type);
      
      expect(result).toEqual({
        status: 500,
        body: {
          error: {
            type: type,
            message: message,
            code: 500
          }
        }
      });
    });

    it('should use default error type and code when not provided', () => {
      const message = 'API error';
      const result = ErrorFormatter.openAIApiError(message);
      
      expect(result).toEqual({
        status: 500,
        body: {
          error: {
            type: 'api_error',
            message: message,
            code: 500
          }
        }
      });
    });
  });

  describe('anthropicApiError', () => {
    it('should format Anthropic API error response', () => {
      const message = 'Rate limit exceeded';
      const type = 'rate_limit_error';
      const result = ErrorFormatter.anthropicApiError(message, type);
      
      expect(result).toEqual({
        status: 500,
        body: {
          error: {
            type: type,
            message: message
          }
        }
      });
    });
  });
});