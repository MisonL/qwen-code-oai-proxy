const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const config = require('./config.js');
const { validateEnvironment } = require('./utils/envValidator.js');
const { QwenAPI } = require('./qwen/api.js');
const { QwenAuthManager } = require('./qwen/auth.js');
const { DebugLogger } = require('./utils/logger.js');
const { countTokens } = require('./utils/tokenCounter.js');
const { ErrorFormatter } = require('./utils/errorFormatter.js');
const { MetricsCollector } = require('./utils/metrics.js');
const { AnthropicProxy } = require('./anthropic/anthropicProxy.js');

// 启动时验证环境
validateEnvironment();

const app = express();
// 添加安全头
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      frameAncestors: ["'none'"], // 防止iframe嵌入
    },
  },
  hsts: {
    maxAge: 31536000, // 1年（以秒为单位）
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },
  permittedCrossDomainPolicies: {
    policy: 'none'
  }
}));

// 速率限制中间件
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP在时间窗口内最多100个请求
  message: {
    error: {
      type: 'rate_limit_error',
      message: '来自此IP的请求过多，请稍后再试。'
    }
  },
  standardHeaders: true, // 在 `RateLimit-*` 头中返回速率限制信息
  legacyHeaders: false, // 禁用 `X-RateLimit-*` 头
  skip: function(req, res) {
    // 对健康检查和指标端点跳过速率限制
    return req.url === '/health' || req.url === '/metrics';
  }
});

// 对除健康检查和指标外的所有请求应用速率限制
app.use(limiter);

// 增加大型请求的主体解析器限制
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 配置更严格的CORS
app.use(cors({
  origin: function (origin, callback) {
    // 允许没有来源的请求（如移动应用或curl请求）
    if (!origin) return callback(null, true);
    
    // 在生产环境中，您应该明确指定允许的来源
    // 现在，我们将比默认的通配符更加严格
    const allowedOrigins = [
      'http://localhost:3000',    // Common frontend port
      'http://localhost:3001',    // Another common frontend port
      'http://localhost:8080',    // Possible frontend port
      'http://localhost:8081',    // Possible frontend port
      'http://127.0.0.1:3000',    // IPv4 localhost
      'http://127.0.0.1:3001',    // IPv4 localhost
      'http://127.0.0.1:8080',    // IPv4 localhost
      'http://127.0.0.1:8081',    // IPv4 localhost
      'https://localhost:3000',   // HTTPS localhost
      'https://localhost:3001',   // HTTPS localhost
      'https://localhost:8080',   // HTTPS localhost
      'https://localhost:8081',   // HTTPS localhost
    ];
    
    // 对于生产环境，您需要检查来源是否在allowedOrigins中
    // 现在，我们将允许任何localhost来源用于开发
    if (process.env.NODE_ENV === 'production') {
      // 在生产环境中，限制为特定来源
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked: ${origin} is not allowed`);
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      // 在开发环境中，允许localhost来源
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked: ${origin} is not allowed`);
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin', 
    'X-Requested-With', 
    'Content-Type', 
    'Accept', 
    'Authorization', 
    'X-Qwen-Account',
    'anthropic-version'
  ],
  exposedHeaders: ['X-Total-Count', 'Link']  // Headers that browsers can access
}));

// 对API端点应用更严格的速率限制
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 50, // 每个IP在时间窗口内对API端点最多50个请求
  message: {
    error: {
      type: 'rate_limit_error',
      message: '来自此IP的API请求过多，请稍后再试。'
    }
  },
  skip: function(req, res) {
    // 对健康检查和指标端点跳过速率限制
    return req.url === '/health' || req.url === '/metrics';
  }
});

// 对API端点应用更严格的速率限制
app.use('/v1', apiLimiter);
app.use('/anthropic', apiLimiter);

// 初始化Qwen API客户端
const qwenAPI = new QwenAPI();
const authManager = new QwenAuthManager();
const debugLogger = new DebugLogger();
const metricsCollector = new MetricsCollector();

/**
 * 主代理服务器
 * 
 * @class QwenOpenAIProxy
 */
class QwenOpenAIProxy {
  constructor(metricsCollector = null) {
    this.metricsCollector = metricsCollector;
    
    // 定义Joi模式用于输入验证
    this.chatCompletionSchema = Joi.object({
      model: Joi.string().max(100).required(), // 现在是必需的，并有最大长度
      messages: Joi.array().items(
        Joi.object({
          role: Joi.string().valid('system', 'user', 'assistant').required(),
          content: Joi.alternatives().try(
            Joi.string().max(1000000), // 内容最大1MB
            Joi.array().items(
              Joi.object({
                type: Joi.string().valid('text', 'image_url').required(),
                text: Joi.string().max(1000000).when('type', { is: 'text', then: Joi.required(), otherwise: Joi.optional() }),
                image_url: Joi.object({
                  url: Joi.string().uri().max(2000).pattern(/^https?:\/\//).when('type', { is: 'image_url', then: Joi.required(), otherwise: Joi.optional() })
                }).when('type', { is: 'image_url', then: Joi.required(), otherwise: Joi.optional() })
              })
            )
          ).required()
        })
      ).min(1).max(100).required(), // 最多100条消息
      temperature: Joi.number().min(0).max(2).precision(2).optional(), // 添加精度
      max_tokens: Joi.number().integer().min(1).max(32768).optional(),
      top_p: Joi.number().min(0).max(1).precision(2).optional(),
      top_k: Joi.number().integer().min(0).max(100).optional(), // 添加top_k验证
      stop: Joi.alternatives().try(
        Joi.string().max(100),
        Joi.array().items(Joi.string().max(100)).max(4)
      ).optional(),
      presence_penalty: Joi.number().min(-2).max(2).precision(2).optional(),
      frequency_penalty: Joi.number().min(-2).max(2).precision(2).optional(),
      logit_bias: Joi.object().pattern(Joi.string(), Joi.number().min(-100).max(100)).optional(),
      user: Joi.string().max(255).optional(), // 用于滥用检测
      tools: Joi.array().items(Joi.object()).max(10).optional(), // 最多10个工具
      tool_choice: Joi.alternatives().try(
        Joi.string().valid('none', 'auto', 'required'),
        Joi.object()
      ).optional(),
      stream: Joi.boolean().optional(),
      n: Joi.number().integer().min(1).max(10).optional(), // 完成数量
      account: Joi.string().max(100).optional()
    }).required();

    this.authPollSchema = Joi.object({
      device_code: Joi.string().length(36).required(), // 通常是UUID格式
      code_verifier: Joi.string().min(43).max(128).required() // PKCE代码验证器长度
    });
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
   * 处理聊天完成请求
   * @param {Object} req - Express 请求对象
   * @param {Object} res - Express 响应对象
   */
  async handleChatCompletion(req, res) {
    const startTime = Date.now();
    
    try {
      // 验证请求体
      const validatedBody = this.validateRequest(this.chatCompletionSchema, req.body);

      // 计算请求中的token数量
      const tokenCount = countTokens(validatedBody.messages);
      
      // 在终端显示token计数
      console.log('\x1b[36m%s\x1b[0m', `收到聊天完成请求，包含 ${tokenCount} 个token`);
      
      // 检查是否请求并启用了流式传输
      const isStreaming = validatedBody.stream === true && config.stream;
      
      if (isStreaming) {
        // 处理流式响应
        await this.handleStreamingChatCompletion(req, res, validatedBody);
      } else {
        // 处理常规响应
        // 如果客户端请求流式传输但已禁用，我们仍使用常规完成
        await this.handleRegularChatCompletion(req, res, validatedBody);
      }
      
      // 记录成功的请求指标
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // 转换为秒
        this.metricsCollector.incrementHttpRequest(req.method, req.route.path || req.path, 200);
        this.metricsCollector.recordHttpRequestDuration(req.method, req.route.path || req.path, duration);
      }
    } catch (error) {
      // 记录错误请求指标
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // 转换为秒
        const statusCode = error.message.includes('Validation error') ? 400 : 
                          (error.message.includes('Not authenticated') || error.message.includes('access token')) ? 401 : 500;
        this.metricsCollector.incrementHttpRequest(req.method, req.route.path || req.path, statusCode);
        this.metricsCollector.recordHttpRequestDuration(req.method, req.route.path || req.path, duration);
      }
      
      // 检查是否为验证错误
      if (error.message.includes('Validation error')) {
        console.error('\x1b[31m%s\x1b[0m', `验证错误: ${error.message}`);
        const validationError = ErrorFormatter.openAIValidationError(error.message);
        return res.status(validationError.status).json(validationError.body);
      }

      // 记录带错误的API调用
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, null, error);
      
      // 单独记录详细错误
      await debugLogger.logError('/v1/chat/completions', error, 'error');
      
      // 以红色打印错误消息
      if (debugFileName) {
        console.error('\x1b[31m%s\x1b[0m', `处理聊天完成请求时出错。调试日志保存到: ${debugFileName}`);
      } else {
        console.error('\x1b[31m%s\x1b[0m', '处理聊天完成请求时出错。');
      }
      
      // 处理认证错误
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        const authError = ErrorFormatter.openAIAuthError();
        return res.status(authError.status).json(authError.body);
      }
      
      // 处理其他错误
      const apiError = ErrorFormatter.openAIApiError(error.message);
      res.status(apiError.status).json(apiError.body);
    }
  }
  
  /**
   * 处理常规聊天完成请求
   * @param {Object} req - Express 请求对象
   * @param {Object} res - Express 响应对象
   * @param {Object} validatedBody - 验证后的请求体
   */
  async handleRegularChatCompletion(req, res, validatedBody) {
    const startTime = Date.now();
    const accountId = req.headers['x-qwen-account'] || req.query.account || req.body.account;
    const model = validatedBody.model || config.defaultModel;
    
    try {
      // 通过我们的集成客户端调用Qwen API
      const response = await qwenAPI.chatCompletions({
        model: model,
        messages: validatedBody.messages,
        tools: validatedBody.tools,
        tool_choice: validatedBody.tool_choice,
        temperature: validatedBody.temperature,
        max_tokens: validatedBody.max_tokens,
        top_p: validatedBody.top_p,
        accountId
      });
      
      // 记录成功的API请求指标
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // 转换为秒
        this.metricsCollector.incrementApiRequest('openai', model, accountId);
        this.metricsCollector.recordApiRequestDuration('openai', model, accountId, duration);
      }
      
      // 记录API调用
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, response);
      
      // 如果响应中包含使用情况，则显示token使用情况
      let tokenInfo = '';
      if (response && response.usage) {
        const { prompt_tokens, completion_tokens, total_tokens } = response.usage;
        tokenInfo = ` (提示: ${prompt_tokens}, 完成: ${completion_tokens}, 总计: ${total_tokens} tokens)`;
        
        // 如果指标收集器可用，则记录token使用指标
        if (this.metricsCollector) {
          this.metricsCollector.recordTokenUsage('input', model, accountId, prompt_tokens);
          this.metricsCollector.recordTokenUsage('output', model, accountId, completion_tokens);
        }
      }
      
      // 以绿色打印成功消息和调试文件信息
      if (debugFileName) {
        console.log('\x1b[32m%s\x1b[0m', `聊天完成请求处理成功${tokenInfo}。调试日志保存到: ${debugFileName}`);
      } else {
        console.log('\x1b[32m%s\x1b[0m', `聊天完成请求处理成功${tokenInfo}。`);
      }
      
      res.json(response);
    } catch (error) {
      // 记录失败的API请求指标
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // 转换为秒
        this.metricsCollector.incrementApiRequest('openai', model, accountId);
        this.metricsCollector.recordApiRequestDuration('openai', model, accountId, duration);
      }
      
      // 记录带错误的API调用
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, null, error);
      
      // 单独记录详细错误
      await debugLogger.logError('/v1/chat/completions regular', error, 'error');
      
      // 以红色打印错误消息
      if (debugFileName) {
        console.error('\x1b[31m%s\x1b[0m', `常规聊天完成请求出错。调试日志保存到: ${debugFileName}`);
      } else {
        console.error('\x1b[31m%s\x1b[0m', '常规聊天完成请求出错。');
      }
      
      // 处理认证错误
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        const authError = ErrorFormatter.openAIAuthError();
        return res.status(authError.status).json(authError.body);
      }
      
      // 重新抛出，由主处理器处理
      throw error;
    }
  }
  
  /**
   * 处理流式聊天完成请求
   * @param {Object} req - Express 请求对象
   * @param {Object} res - Express 响应对象
   * @param {Object} validatedBody - 验证后的请求体
   */
  async handleStreamingChatCompletion(req, res, validatedBody) {
    const startTime = Date.now();
    const accountId = req.headers['x-qwen-account'] || req.query.account || req.body.account;
    const model = validatedBody.model || config.defaultModel;
    
    try {
      // 设置流式传输头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // 调用Qwen API流式方法
      const stream = await qwenAPI.streamChatCompletions({
        model: model,
        messages: validatedBody.messages,
        tools: validatedBody.tools,
        tool_choice: validatedBody.tool_choice,
        temperature: validatedBody.temperature,
        max_tokens: validatedBody.max_tokens,
        top_p: validatedBody.top_p,
        accountId
      });
      
      // 记录成功的API请求指标（在流式传输开始时）
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // 在开始时转换为秒
        this.metricsCollector.incrementApiRequest('openai_streaming', model, accountId);
        this.metricsCollector.recordApiRequestDuration('openai_streaming', model, accountId, duration);
      }
      
      // 记录API调用（没有响应数据，因为是流式传输）
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, { streaming: true });
      
      // 打印流式请求消息
      console.log('\x1b[32m%s\x1b[0m', `流式聊天完成请求已开始。调试日志保存到: ${debugFileName}`);
      
      // 将流传输到响应
      stream.pipe(res);
      
      // 处理流错误
      stream.on('error', (error) => {
        console.error('\x1b[31m%s\x1b[0m', `流式聊天完成出错: ${error.message}`);
        if (!res.headersSent) {
          const apiError = ErrorFormatter.openAIApiError(error.message, 'streaming_error');
          res.status(apiError.status).json(apiError.body);
        }
        res.end();
      });
      
      // 处理客户端断开连接
      req.on('close', () => {
        stream.destroy();
      });
      
    } catch (error) {
      // 记录失败的API请求指标
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // 转换为秒
        this.metricsCollector.incrementApiRequest('openai_streaming', model, accountId);
        this.metricsCollector.recordApiRequestDuration('openai_streaming', model, accountId, duration);
      }
      
      // 记录带错误的API调用
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, null, error);
      
      // 单独记录详细错误
      await debugLogger.logError('/v1/chat/completions streaming', error, 'error');
      
      // 以红色打印错误消息
      if (debugFileName) {
        console.error('\x1b[31m%s\x1b[0m', `流式聊天完成请求出错。调试日志保存到: ${debugFileName}`);
      } else {
        console.error('\x1b[31m%s\x1b[0m', '流式聊天完成请求出错。');
      }
      
      // 处理认证错误
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        const authError = ErrorFormatter.openAIAuthError();
        if (!res.headersSent) {
          res.status(authError.status).json(authError.body);
          res.end();
        }
        return;
      }
      
      // 处理流式传输上下文中的其他错误
      const apiError = ErrorFormatter.openAIApiError(error.message);
      if (!res.headersSent) {
        res.status(apiError.status).json(apiError.body);
        res.end();
      }
    }
  }
  
  /**
   * 处理模型列表请求
   * @param {Object} req - Express 请求对象
   * @param {Object} res - Express 响应对象
   */
  async handleModels(req, res) {
    try {
      // 在终端显示请求
      console.log('\x1b[36m%s\x1b[0m', '模型请求已收到');
      
      // 从Qwen获取模型
      const models = await qwenAPI.listModels();
      // 记录API调用
      const debugFileName = await debugLogger.logApiCall('/v1/models', req, models);
      
      // 以绿色打印成功消息和调试文件信息
      if (debugFileName) {
        console.log('\x1b[32m%s\x1b[0m', `模型请求处理成功。调试日志保存到: ${debugFileName}`);
      } else {
        console.log('\x1b[32m%s\x1b[0m', '模型请求处理成功。');
      }
      
      res.json(models);
    } catch (error) {
      // 记录带错误的API调用
      const debugFileName = await debugLogger.logApiCall('/v1/models', req, null, error);
      
      // 以红色打印错误消息
      if (debugFileName) {
        console.error('\x1b[31m%s\x1b[0m', `获取模型时出错。调试日志保存到: ${debugFileName}`);
      } else {
        console.error('\x1b[31m%s\x1b[0m', '获取模型时出错。');
      }
      
      // 处理认证错误
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        return res.status(401).json({
          error: {
            message: '未与Qwen认证。请先认证。',
            type: 'authentication_error'
          }
        });
      }
      
      res.status(500).json({
        error: {
          message: error.message,
          type: 'internal_server_error'
        }
      });
    }
  }
  
  
  
  /**
   * 处理认证初始化请求
   * @param {Object} req - Express 请求对象
   * @param {Object} res - Express 响应对象
   */
  async handleAuthInitiate(req, res) {
    try {
      // 启动设备流程
      const deviceFlow = await authManager.initiateDeviceFlow();
      
      const response = {
        verification_uri: deviceFlow.verification_uri,
        user_code: deviceFlow.user_code,
        device_code: deviceFlow.device_code,
        code_verifier: deviceFlow.code_verifier // This should be stored securely for polling
      };
      
      // 记录API调用
      const debugFileName = await debugLogger.logApiCall('/auth/initiate', req, response);
      
      // 以绿色打印成功消息和调试文件信息
      if (debugFileName) {
        console.log('\x1b[32m%s\x1b[0m', `认证初始化请求处理成功。调试日志保存到: ${debugFileName}`);
      } else {
        console.log('\x1b[32m%s\x1b[0m', '认证初始化请求处理成功。');
      }
      
      res.json(response);
    } catch (error) {
      // 记录带错误的API调用
      await debugLogger.logApiCall('/auth/initiate', req, null, error);
      
      // 以红色打印错误消息
      console.error('\x1b[31m%s\x1b[0m', `初始化认证时出错: ${error.message}`);
      
      res.status(500).json({
        error: {
          message: error.message,
          type: 'authentication_error'
        }
      });
    }
  }
  
  /**
   * 处理认证轮询请求
   * @param {Object} req - Express 请求对象
   * @param {Object} res - Express 响应对象
   */
  async handleAuthPoll(req, res) {
    try {
      // 验证请求体
      const validatedBody = this.validateRequest(this.authPollSchema, req.body);
      const { device_code, code_verifier } = validatedBody;
      
      // 轮询获取token
      const token = await authManager.pollForToken(device_code, code_verifier);
      
      const response = {
        access_token: token,
        message: '认证成功'
      };
      
      // 记录API调用
      const debugFileName = await debugLogger.logApiCall('/auth/poll', req, response);
      
      // 以绿色打印成功消息和调试文件信息
      if (debugFileName) {
        console.log('\x1b[32m%s\x1b[0m', `认证轮询请求处理成功。调试日志保存到: ${debugFileName}`);
      } else {
        console.log('\x1b[32m%s\x1b[0m', '认证轮询请求处理成功。');
      }
      
      res.json(response);
    } catch (error) {
      // 检查是否为验证错误
      if (error.message.includes('Validation error')) {
        console.error('\x1b[31m%s\x1b[0m', `验证错误: ${error.message}`);
        const validationError = ErrorFormatter.openAIValidationError(error.message);
        return res.status(validationError.status).json(validationError.body);
      }
      
      // 记录带错误的API调用
      await debugLogger.logApiCall('/auth/poll', req, null, error);
      
      // 单独记录详细错误
      await debugLogger.logError('/auth/poll', error, 'error');
      
      // 以红色打印错误消息
      console.error('\x1b[31m%s\x1b[0m', `轮询获取token时出错: ${error.message}`);
      
      const apiError = ErrorFormatter.openAIApiError(error.message, 'authentication_error');
      res.status(apiError.status).json(apiError.body);
    }
  }
}

// 初始化代理
const proxy = new QwenOpenAIProxy(metricsCollector);
const anthropicProxy = new AnthropicProxy(debugLogger);

// OpenAI兼容路由
app.post('/v1/chat/completions', (req, res) => proxy.handleChatCompletion(req, res));
app.get('/v1/models', (req, res) => proxy.handleModels(req, res));

// Claude Code CLI兼容的Anthropic API路由
app.post('/anthropic/v1/messages', (req, res) => {
  // 检查是否为流式请求
  if (req.body.stream) {
    anthropicProxy.handleStreamingRequest(req, res);
  } else {
    anthropicProxy.handleMessages(req, res);
  }
});
app.get('/anthropic/v1/models', (req, res) => anthropicProxy.handleModels(req, res));

// 认证路由
app.post('/auth/initiate', (req, res) => proxy.handleAuthInitiate(req, res));
app.post('/auth/poll', (req, res) => proxy.handleAuthPoll(req, res));

// Prometheus的指标端点
// Prometheus指标端点
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', 'text/plain');
    const metrics = await metricsCollector.getMetrics();
    res.status(200).send(metrics);
  } catch (error) {
    console.error('Error collecting metrics:', error);
    res.status(500).send('Error collecting metrics');
  }
});

// 健康检查端点
// 健康检查端点
app.get('/health', async (req, res) => {
  try {
    await qwenAPI.authManager.loadAllAccounts();
    const accountIds = qwenAPI.authManager.getAccountIds();
    const healthyAccounts = qwenAPI.getHealthyAccounts(accountIds);
    const failedAccounts = healthyAccounts.length === 0 ? 
      new Set(accountIds) : new Set(accountIds.filter(id => !healthyAccounts.includes(id)));
    
    const accounts = [];
    let totalRequestsToday = 0;
    
    for (const accountId of accountIds) {
      const credentials = qwenAPI.authManager.getAccountCredentials(accountId);
      let status = 'unknown';
      let expiresIn = null;
      
      if (credentials) {
        const minutesLeft = (credentials.expiry_date - Date.now()) / 60000;
        if (failedAccounts.has(accountId)) {
          status = 'failed';
        } else if (minutesLeft < 0) {
          status = 'expired';
        } else if (minutesLeft < 30) {
          status = 'expiring_soon';
        } else {
          status = 'healthy';
        }
        expiresIn = Math.max(0, minutesLeft);
      }
      
      const requestCount = qwenAPI.getRequestCount(accountId);
      totalRequestsToday += requestCount;
      
      accounts.push({
        id: accountId,
        status,
        expiresIn: expiresIn ? `${expiresIn.toFixed(1)} minutes` : null,
        requestCount: requestCount,
        authErrorCount: qwenAPI.getAuthErrorCount(accountId)
      });
    }
    
    const healthyCount = accounts.filter(a => a.status === 'healthy').length;
    const failedCount = accounts.filter(a => a.status === 'failed').length;
    const expiringSoonCount = accounts.filter(a => a.status === 'expiring_soon').length;
    const expiredCount = accounts.filter(a => a.status === 'expired').length;
    
    // 获取token使用数据
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    
    const today = new Date().toISOString().split('T')[0];
    for (const [accountId, usageData] of qwenAPI.tokenUsage.entries()) {
      const todayUsage = usageData.find(entry => entry.date === today);
      if (todayUsage) {
        totalInputTokens += todayUsage.inputTokens;
        totalOutputTokens += todayUsage.outputTokens;
      }
    }
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      summary: {
        total: accounts.length,
        healthy: healthyCount,
        failed: failedCount,
        expiring_soon: expiringSoonCount,
        expired: expiredCount,
        total_requests_today: totalRequestsToday,
        lastReset: qwenAPI.lastFailedReset
      },
      token_usage: {
        input_tokens_today: totalInputTokens,
        output_tokens_today: totalOutputTokens,
        total_tokens_today: totalInputTokens + totalOutputTokens
      },
      accounts,
      server_info: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        node_version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      endpoints: {
        openai: `${req.protocol}://${req.get('host')}/v1`,
        anthropic: `${req.protocol}://${req.get('host')}/anthropic`,
        metrics: `${req.protocol}://${req.get('host')}/metrics`,
        health: `${req.protocol}://${req.get('host')}/health`
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
      server_info: {
        uptime: process.uptime(),
        node_version: process.version,
        platform: process.platform,
        arch: process.arch
      }
    });
  }
});

const PORT = config.port;
const HOST = config.host;

// 处理优雅关闭以保存待处理数据
process.on('SIGINT', async () => {
  console.log('\n\x1b[33m%s\x1b[0m', 'Received SIGINT, shutting down gracefully...');
  try {
    // 在退出前强制保存任何待处理的请求计数
    await qwenAPI.saveRequestCounts();
    console.log('\x1b[32m%s\x1b[0m', 'Request counts saved successfully');
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', 'Failed to save request counts on shutdown:', error.message);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\x1b[33m%s\x1b[0m', 'Received SIGTERM, shutting down gracefully...');
  try {
    // 在退出前强制保存任何待处理的请求计数
    await qwenAPI.saveRequestCounts();
    console.log('\x1b[32m%s\x1b[0m', 'Request counts saved successfully');
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', 'Failed to save request counts on shutdown:', error.message);
  }
  process.exit(0);
});

app.listen(PORT, HOST, async () => {
  console.log(`Qwen OpenAI Proxy listening on http://${HOST}:${PORT}`);
  console.log(`OpenAI-compatible endpoint: http://${HOST}:${PORT}/v1`);
  console.log(`Anthropic-compatible endpoint: http://${HOST}:${PORT}/anthropic`);
  console.log(`Authentication endpoint: http://${HOST}:${PORT}/auth/initiate`);
  
  // 显示可用账户
  try {
    await qwenAPI.authManager.loadAllAccounts();
    const accountIds = qwenAPI.authManager.getAccountIds();
    
    // 如果已配置，显示默认账户
    const defaultAccount = config.defaultAccount;
    if (defaultAccount) {
      console.log(`\n\x1b[36mDefault account configured: ${defaultAccount}\x1b[0m`);
    }
    
    if (accountIds.length > 0) {
      console.log('\n\x1b[36mAvailable accounts:\x1b[0m');
      for (const accountId of accountIds) {
        const credentials = qwenAPI.authManager.getAccountCredentials(accountId);
        const isValid = credentials && qwenAPI.authManager.isTokenValid(credentials);
        const isDefault = accountId === defaultAccount ? ' (default)' : '';
        console.log(`  ${accountId}${isDefault}: ${isValid ? '✅ Valid' : '❌ Invalid/Expired'}`);
      }
      console.log('\n\x1b[33mNote: Try using the proxy to make sure accounts are not invalid\x1b[0m');
    } else {
      // 检查默认账户是否存在
      const defaultCredentials = await qwenAPI.authManager.loadCredentials();
      if (defaultCredentials) {
        const isValid = qwenAPI.authManager.isTokenValid(defaultCredentials);
        console.log(`\n\x1b[36mDefault account: ${isValid ? '✅ Valid' : '❌ Invalid/Expired'}\x1b[0m`);
        console.log('\n\x1b[33mNote: Try using the proxy to make sure the account is not invalid\x1b[0m');
      } else {
        console.log('\n\x1b[36mNo accounts configured. Please authenticate first.\x1b[0m');
      }
    }
  } catch (error) {
    console.log('\n\x1b[33mWarning: Could not load account information\x1b[0m');
  }
});