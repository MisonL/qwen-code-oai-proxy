/**
 * Anthropic API 代理
 * 将 Anthropic API 请求转换为 Qwen API 请求
 */

const { QwenAPI } = require('../qwen/api.js');
const Joi = require('joi');
const { ErrorFormatter } = require('../utils/errorFormatter.js');
const { Cache } = require('../utils/cache.js');
const { anthropicToQwenConverter, qwenToAnthropicConverter } = require('./converter.js');
const { anthropicModels } = require('./models.js');

// 为静态数据创建缓存实例
const staticDataCache = new Cache();

class AnthropicProxy {
  constructor(debugLogger = null) {
    this.qwenAPI = new QwenAPI();
    this.debugLogger = debugLogger; // 允许注入调试日志记录器
    
    // 为Anthropic消息请求定义Joi模式
    this.anthropicMessagesSchema = Joi.object({
      model: Joi.string().max(100).required(),
      messages: Joi.array().items(
        Joi.object({
          role: Joi.string().valid('user', 'assistant').required(),
          content: Joi.alternatives().try(
            Joi.string().max(1000000),
            Joi.array().items(
              Joi.object({
                type: Joi.string().valid('text', 'image').required(),
                text: Joi.string().max(1000000).when('type', { is: 'text', then: Joi.required(), otherwise: Joi.optional() }),
                source: Joi.object({
                  type: Joi.string().valid('base64').required(),
                  media_type: Joi.string().max(100).required(),
                  data: Joi.string().max(1000000).when('type', { is: 'base64', then: Joi.required(), otherwise: Joi.optional() })
                }).when('type', { is: 'image', then: Joi.required(), otherwise: Joi.optional() }),
                url: Joi.string().uri().max(2000).pattern(/^https?:\/\//).when('type', { is: 'image_url', then: Joi.required(), otherwise: Joi.optional() })
              })
            )
          ).required()
        })
      ).min(1).max(100).required(),
      max_tokens: Joi.number().integer().min(1).max(4096).required(),
      temperature: Joi.number().min(0).max(1).precision(2).optional(),
      top_p: Joi.number().min(0).max(1).precision(2).optional(),
      top_k: Joi.number().integer().min(0).max(500).optional(),
      stop_sequences: Joi.array().items(Joi.string().max(200)).max(4).optional(),
      system: Joi.alternatives().try(
        Joi.string().max(100000),
        Joi.array().max(10).items(
          Joi.object({
            type: Joi.string().valid('text').required(),
            text: Joi.string().max(100000).required()
          })
        )
      ).optional(),
      metadata: Joi.object({
        user_id: Joi.string().max(1000).optional()
      }).optional(),
      stream: Joi.boolean().optional()
    }).required();
  }

  // 根据模式验证请求
  validateRequest(schema, data) {
    const { error, value } = schema.validate(data, { abortEarly: false });
    if (error) {
      const errorDetails = error.details.map(detail => detail.message).join(', ');
      throw new Error(`验证错误: ${errorDetails}`);
    }
    return value;
  }

  /**
   * 处理 Anthropic Messages API 请求
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async handleMessages(req, res) {
    const startTime = Date.now();
    const accountId = req.headers['x-qwen-account'] || req.query.account || (req.body && req.body.account);
    const model = req.body && req.body.model ? req.body.model : 'unknown';
    
    try {
      // 验证请求体
      const validatedBody = this.validateRequest(this.anthropicMessagesSchema, req.body);
      
      console.log('Received Anthropic API request:', validatedBody);
      
      // 将 Anthropic 请求转换为 Qwen 兼容格式
      const qwenRequest = anthropicToQwenConverter(validatedBody);
      
      // 直接调用 Qwen API
      const response = await this.qwenAPI.chatCompletions({
        model: qwenRequest.model || 'qwen3-coder-plus',
        messages: qwenRequest.messages,
        tools: qwenRequest.tools,
        tool_choice: qwenRequest.tool_choice,
        temperature: qwenRequest.temperature,
        max_tokens: qwenRequest.max_tokens,
        top_p: qwenRequest.top_p,
        top_k: qwenRequest.top_k,
        stop: qwenRequest.stop,
        metadata: qwenRequest.metadata,
        accountId
      });
      
      // 将 Qwen 响应转换为 Anthropic 格式
      const anthropicResponse = qwenToAnthropicConverter(response);
      
      // 记录成功的 API 请求指标
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // Convert to seconds
        this.metricsCollector.incrementApiRequest('anthropic', model, accountId);
        this.metricsCollector.recordApiRequestDuration('anthropic', model, accountId, duration);
        
        // 如果可用，记录 token 使用指标
        if (response && response.usage) {
          const { prompt_tokens = 0, completion_tokens = 0 } = response.usage;
          this.metricsCollector.recordTokenUsage('input', model, accountId, prompt_tokens);
          this.metricsCollector.recordTokenUsage('output', model, accountId, completion_tokens);
        }
      }
      
      res.json(anthropicResponse);
    } catch (error) {
      // 记录失败的 API 请求指标
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // Convert to seconds
        this.metricsCollector.incrementApiRequest('anthropic', model, accountId);
        this.metricsCollector.recordApiRequestDuration('anthropic', model, accountId, duration);
      }
      
      // 检查是否为验证错误
      if (error.message.includes('Validation error')) {
        console.error('\x1b[31m%s\x1b[0m', `Validation error: ${error.message}`);
        const validationError = ErrorFormatter.anthropicValidationError(error.message);
        return res.status(validationError.status).json(validationError.body);
      }
      
      // 处理认证错误
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        // 记录详细错误
        if (this.debugLogger) {
          await this.debugLogger.logError('/anthropic/v1/messages auth', error, 'error');
        }
        
        const authError = ErrorFormatter.anthropicAuthError();
        return res.status(authError.status).json(authError.body);
      }
      
      // 记录详细错误
      if (this.debugLogger) {
        await this.debugLogger.logError('/anthropic/v1/messages', error, 'error');
      }
      
      console.error('Error in Anthropic proxy:', error);
      const apiError = ErrorFormatter.anthropicApiError(error.message || 'Internal server error');
      res.status(apiError.status).json(apiError.body);
    }
  }

  /**
   * 处理流式请求
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async handleStreamingRequest(req, res) {
    const startTime = Date.now();
    const accountId = req.headers['x-qwen-account'] || req.query.account || (req.body && req.body.account);
    const model = req.body && req.body.model ? req.body.model : 'unknown';
    
    try {
      // 验证请求体
      const validatedBody = this.validateRequest(this.anthropicMessagesSchema, { ...req.body, stream: true });
      
      // 设置 SSE 响应头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // 将 Anthropic 请求转换为 Qwen 兼容格式
      const qwenRequest = anthropicToQwenConverter(validatedBody);
      
      // 调用 Qwen API 流式方法
      const stream = await this.qwenAPI.streamChatCompletions({
        model: qwenRequest.model || 'qwen3-coder-plus',
        messages: qwenRequest.messages,
        tools: qwenRequest.tools,
        tool_choice: qwenRequest.tool_choice,
        temperature: qwenRequest.temperature,
        max_tokens: qwenRequest.max_tokens,
        top_p: qwenRequest.top_p,
        top_k: qwenRequest.top_k,
        stop: qwenRequest.stop,
        metadata: qwenRequest.metadata,
        accountId
      });

      // 记录成功的 API 请求指标（在流式传输开始时）
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // 在开始时转换为秒
        this.metricsCollector.incrementApiRequest('anthropic_streaming', model, accountId);
        this.metricsCollector.recordApiRequestDuration('anthropic_streaming', model, accountId, duration);
      }

      // 为流式响应创建处理函数
      const dataHandler = (data) => {
        // 将 Qwen 流数据转换为 Anthropic 格式
        try {
          if (data.startsWith('data: ')) {
            const jsonStr = data.substring(6); // 移除 'data: ' 前缀
            if (jsonStr === '[DONE]') {
              // 发送 Anthropic 格式的完成信号
              res.write(`event: message_stop\n`);
              res.write(`data: {}\n\n`);
              return;
            }
            
            const parsed = JSON.parse(jsonStr);
            
            // 将 Qwen 格式的流数据转换为 Anthropic 格式
            const anthropicChunk = qwenToAnthropicConverter(parsed, true); // true 表示流式
            
            if (anthropicChunk) {
              res.write(`data: ${JSON.stringify(anthropicChunk)}\n\n`);
            }
          } else {
            res.write(data);
          }
        } catch (e) {
          console.error('Error processing stream data:', e);
        }
      };

      // 处理来自 Qwen API 的流数据
      stream.on('data', (chunk) => {
        if (typeof chunk === 'string') {
          dataHandler(chunk);
        }
      });

      stream.on('end', () => {
        res.end();
      });

      stream.on('error', (error) => {
        console.error('Stream error:', error);
        const apiError = ErrorFormatter.anthropicApiError(error.message || 'Internal server error');
        res.write(`data: ${JSON.stringify(apiError.body)}\n\n`);
        res.end();
      });
    } catch (error) {
      // 记录失败的 API 请求指标
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // Convert to seconds
        this.metricsCollector.incrementApiRequest('anthropic_streaming', model, accountId);
        this.metricsCollector.recordApiRequestDuration('anthropic_streaming', model, accountId, duration);
      }
      
      // 检查是否为验证错误
      if (error.message.includes('Validation error')) {
        console.error('\x1b[31m%s\x1b[0m', `Validation error in streaming request: ${error.message}`);
        const validationError = ErrorFormatter.anthropicValidationError(error.message);
        res.write(`data: ${JSON.stringify(validationError.body)}\n\n`);
        res.end();
        return;
      }
      
      // 处理认证错误 for streaming
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        // 记录详细错误
        if (this.debugLogger) {
          await this.debugLogger.logError('/anthropic/v1/messages streaming auth', error, 'error');
        }
        
        const authError = ErrorFormatter.anthropicAuthError();
        res.write(`data: ${JSON.stringify(authError.body)}\n\n`);
        res.end();
        return;
      }
      
      // 记录详细错误
      if (this.debugLogger) {
        await this.debugLogger.logError('/anthropic/v1/messages streaming', error, 'error');
      }
      
      console.error('Error in Anthropic streaming proxy:', error);
      const apiError = ErrorFormatter.anthropicApiError(error.message || 'Internal server error');
      res.write(`data: ${JSON.stringify(apiError.body)}\n\n`);
      res.end();
    }
  }

  /**
   * 处理模型列表请求
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleModels(req, res) {
    try {
      const cacheKey = 'anthropic_models';
      
      // 检查模型是否已缓存
      const cachedModels = staticDataCache.get(cacheKey);
      if (cachedModels) {
        console.log('返回缓存的 Anthropic 模型列表');
        res.json(cachedModels);
        return;
      }
      
      console.log('返回 Anthropic 模型列表');
      
      // 创建模型响应
      const modelsResponse = {
        object: 'list',
        data: anthropicModels.map(model => ({
          id: model.id,
          object: 'model',
          created: model.created,
          owned_by: model.owned_by
        }))
      };
      
      // 缓存模型1小时
      staticDataCache.set(cacheKey, modelsResponse, 60 * 60 * 1000); // 1小时
      
      res.json(modelsResponse);
    } catch (error) {
      console.error('Anthropic 模型端点中的错误:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          message: error.message || '内部服务器错误'
        }
      });
    }
  }
}

module.exports = { AnthropicProxy };