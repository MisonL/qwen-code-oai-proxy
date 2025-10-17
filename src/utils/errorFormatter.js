/**
 * 统一的错误响应格式工具
 */

class ErrorFormatter {
  /**
   * 标准化 OpenAI 格式的错误响应
   * @param {string} message - 错误消息
   * @param {string} type - 错误类型
   * @param {number} code - HTTP 状态码
   * @returns {object} 标准化的错误响应对象
   */
  static openAIApiError(message, type = 'api_error', code = 500) {
    return {
      status: code,
      body: {
        error: {
          message: message,
          type: type,
          code: code
        }
      }
    };
  }

  /**
   * 标准化 Anthropic 格式的错误响应
   * @param {string} message - 错误消息
   * @param {string} type - 错误类型
   * @param {number} code - HTTP 状态码
   * @returns {object} 标准化的错误响应对象
   */
  static anthropicApiError(message, type = 'api_error', code = 500) {
    return {
      status: code,
      body: {
        error: {
          type: type,
          message: message
        }
      }
    };
  }

  /**
   * 标准化验证错误响应 (OpenAI 格式)
   * @param {string} message - 错误消息
   * @returns {object} 标准化的错误响应对象
   */
  static openAIValidationError(message) {
    return this.openAIApiError(message, 'validation_error', 400);
  }

  /**
   * 标准化验证错误响应 (Anthropic 格式)
   * @param {string} message - 错误消息
   * @returns {object} 标准化的错误响应对象
   */
  static anthropicValidationError(message) {
    return this.anthropicApiError(message, 'validation_error', 400);
  }

  /**
   * 标准化认证错误响应 (OpenAI 格式)
   * @param {string} message - 错误消息
   * @returns {object} 标准化的错误响应对象
   */
  static openAIAuthError(message = 'Not authenticated with Qwen. Please authenticate first.') {
    return this.openAIApiError(message, 'authentication_error', 401);
  }

  /**
   * 标准化认证错误响应 (Anthropic 格式)
   * @param {string} message - 错误消息
   * @returns {object} 标准化的错误响应对象
   */
  static anthropicAuthError(message = 'Not authenticated with Qwen. Please authenticate first.') {
    return this.anthropicApiError(message, 'authentication_error', 401);
  }

  /**
   * 标准化速率限制错误响应 (OpenAI 格式)
   * @param {string} message - 错误消息
   * @returns {object} 标准化的错误响应对象
   */
  static openAIRateLimitError(message = 'Rate limit exceeded') {
    return this.openAIApiError(message, 'rate_limit_exceeded', 429);
  }

  /**
   * 标准化速率限制错误响应 (Anthropic 格式)
   * @param {string} message - 错误消息
   * @returns {object} 标准化的错误响应对象
   */
  static anthropicRateLimitError(message = 'Rate limit exceeded') {
    return this.anthropicApiError(message, 'rate_limit_error', 429);
  }
}

module.exports = { ErrorFormatter };