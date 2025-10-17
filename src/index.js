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

// Validate environment at startup
validateEnvironment();

const app = express();
// Add security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      frameAncestors: ["'none'"], // Prevents iframing
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year in seconds
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

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: {
      type: 'rate_limit_error',
      message: 'Too many requests from this IP, please try again later.'
    }
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: function(req, res) {
    // Skip rate limiting for health check and metrics endpoints
    return req.url === '/health' || req.url === '/metrics';
  }
});

// Apply rate limiting to all requests except health and metrics
app.use(limiter);

// Increase body parser limits for large requests
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Configure more restrictive CORS
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In production, you should specify your allowed origins explicitly
    // For now, we'll be more restrictive than the default wildcard
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
    
    // For production, you'd want to check if origin is in allowedOrigins
    // For now, we'll allow any localhost origin for development
    if (process.env.NODE_ENV === 'production') {
      // In production, restrict to specific origins
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked: ${origin} is not allowed`);
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      // In development, allow localhost origins
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

// Additional rate limiting for API endpoints with stricter limits
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per windowMs to API endpoints
  message: {
    error: {
      type: 'rate_limit_error',
      message: 'Too many API requests from this IP, please try again later.'
    }
  },
  skip: function(req, res) {
    // Skip rate limiting for health check and metrics endpoints
    return req.url === '/health' || req.url === '/metrics';
  }
});

// Apply stricter rate limiting to API endpoints
app.use('/v1', apiLimiter);
app.use('/anthropic', apiLimiter);

// Initialize Qwen API client
const qwenAPI = new QwenAPI();
const authManager = new QwenAuthManager();
const debugLogger = new DebugLogger();
const metricsCollector = new MetricsCollector();

// Main proxy server
class QwenOpenAIProxy {
  constructor(metricsCollector = null) {
    this.metricsCollector = metricsCollector;
    
    // Define Joi schemas for input validation
    this.chatCompletionSchema = Joi.object({
      model: Joi.string().max(100).required(), // Now required and with max length
      messages: Joi.array().items(
        Joi.object({
          role: Joi.string().valid('system', 'user', 'assistant').required(),
          content: Joi.alternatives().try(
            Joi.string().max(1000000), // Max 1MB for content
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
      ).min(1).max(100).required(), // Max 100 messages
      temperature: Joi.number().min(0).max(2).precision(2).optional(), // Added precision
      max_tokens: Joi.number().integer().min(1).max(32768).optional(),
      top_p: Joi.number().min(0).max(1).precision(2).optional(),
      top_k: Joi.number().integer().min(0).max(100).optional(), // Added top_k validation
      stop: Joi.alternatives().try(
        Joi.string().max(100),
        Joi.array().items(Joi.string().max(100)).max(4)
      ).optional(),
      presence_penalty: Joi.number().min(-2).max(2).precision(2).optional(),
      frequency_penalty: Joi.number().min(-2).max(2).precision(2).optional(),
      logit_bias: Joi.object().pattern(Joi.string(), Joi.number().min(-100).max(100)).optional(),
      user: Joi.string().max(255).optional(), // For abuse detection
      tools: Joi.array().items(Joi.object()).max(10).optional(), // Max 10 tools
      tool_choice: Joi.alternatives().try(
        Joi.string().valid('none', 'auto', 'required'),
        Joi.object()
      ).optional(),
      stream: Joi.boolean().optional(),
      n: Joi.number().integer().min(1).max(10).optional(), // Number of completions
      account: Joi.string().max(100).optional()
    }).required();

    this.authPollSchema = Joi.object({
      device_code: Joi.string().length(36).required(), // Typically UUID format
      code_verifier: Joi.string().min(43).max(128).required() // PKCE code verifier length
    });
  }

  // Validate request against schema
  validateRequest(schema, data) {
    const { error, value } = schema.validate(data, { abortEarly: false });
    if (error) {
      const errorDetails = error.details.map(detail => detail.message).join(', ');
      throw new Error(`Validation error: ${errorDetails}`);
    }
    return value;
  }
  async handleChatCompletion(req, res) {
    const startTime = Date.now();
    
    try {
      // Validate the request body
      const validatedBody = this.validateRequest(this.chatCompletionSchema, req.body);

      // Count tokens in the request
      const tokenCount = countTokens(validatedBody.messages);
      
      // Display token count in terminal
      console.log('\x1b[36m%s\x1b[0m', `Chat completion request received with ${tokenCount} tokens`);
      
      // Check if streaming is requested and enabled
      const isStreaming = validatedBody.stream === true && config.stream;
      
      if (isStreaming) {
        // Handle streaming response
        await this.handleStreamingChatCompletion(req, res, validatedBody);
      } else {
        // Handle regular response
        // If client requested streaming but it's disabled, we still use regular completion
        await this.handleRegularChatCompletion(req, res, validatedBody);
      }
      
      // Record successful request metrics
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // Convert to seconds
        this.metricsCollector.incrementHttpRequest(req.method, req.route.path || req.path, 200);
        this.metricsCollector.recordHttpRequestDuration(req.method, req.route.path || req.path, duration);
      }
    } catch (error) {
      // Record error request metrics
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // Convert to seconds
        const statusCode = error.message.includes('Validation error') ? 400 : 
                          (error.message.includes('Not authenticated') || error.message.includes('access token')) ? 401 : 500;
        this.metricsCollector.incrementHttpRequest(req.method, req.route.path || req.path, statusCode);
        this.metricsCollector.recordHttpRequestDuration(req.method, req.route.path || req.path, duration);
      }
      
      // Check if it's a validation error
      if (error.message.includes('Validation error')) {
        console.error('\x1b[31m%s\x1b[0m', `Validation error: ${error.message}`);
        const validationError = ErrorFormatter.openAIValidationError(error.message);
        return res.status(validationError.status).json(validationError.body);
      }

      // Log the API call with error
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, null, error);
      
      // Also log detailed error separately
      await debugLogger.logError('/v1/chat/completions', error, 'error');
      
      // Print error message in red
      if (debugFileName) {
        console.error('\x1b[31m%s\x1b[0m', `Error processing chat completion request. Debug log saved to: ${debugFileName}`);
      } else {
        console.error('\x1b[31m%s\x1b[0m', 'Error processing chat completion request.');
      }
      
      // Handle authentication errors
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        const authError = ErrorFormatter.openAIAuthError();
        return res.status(authError.status).json(authError.body);
      }
      
      // Handle other errors
      const apiError = ErrorFormatter.openAIApiError(error.message);
      res.status(apiError.status).json(apiError.body);
    }
  }
  
  async handleRegularChatCompletion(req, res, validatedBody) {
    const startTime = Date.now();
    const accountId = req.headers['x-qwen-account'] || req.query.account || req.body.account;
    const model = validatedBody.model || config.defaultModel;
    
    try {
      // Call Qwen API through our integrated client
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
      
      // Record successful API request metrics
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // Convert to seconds
        this.metricsCollector.incrementApiRequest('openai', model, accountId);
        this.metricsCollector.recordApiRequestDuration('openai', model, accountId, duration);
      }
      
      // Log the API call
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, response);
      
      // Display token usage if available in response
      let tokenInfo = '';
      if (response && response.usage) {
        const { prompt_tokens, completion_tokens, total_tokens } = response.usage;
        tokenInfo = ` (Prompt: ${prompt_tokens}, Completion: ${completion_tokens}, Total: ${total_tokens} tokens)`;
        
        // Record token usage metrics if metrics collector is available
        if (this.metricsCollector) {
          this.metricsCollector.recordTokenUsage('input', model, accountId, prompt_tokens);
          this.metricsCollector.recordTokenUsage('output', model, accountId, completion_tokens);
        }
      }
      
      // Print success message with debug file info in green
      if (debugFileName) {
        console.log('\x1b[32m%s\x1b[0m', `Chat completion request processed successfully${tokenInfo}. Debug log saved to: ${debugFileName}`);
      } else {
        console.log('\x1b[32m%s\x1b[0m', `Chat completion request processed successfully${tokenInfo}.`);
      }
      
      res.json(response);
    } catch (error) {
      // Record failed API request metrics
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // Convert to seconds
        this.metricsCollector.incrementApiRequest('openai', model, accountId);
        this.metricsCollector.recordApiRequestDuration('openai', model, accountId, duration);
      }
      
      // Log the API call with error
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, null, error);
      
      // Also log detailed error separately
      await debugLogger.logError('/v1/chat/completions regular', error, 'error');
      
      // Print error message in red
      if (debugFileName) {
        console.error('\x1b[31m%s\x1b[0m', `Error in regular chat completion request. Debug log saved to: ${debugFileName}`);
      } else {
        console.error('\x1b[31m%s\x1b[0m', 'Error in regular chat completion request.');
      }
      
      // Handle authentication errors
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        const authError = ErrorFormatter.openAIAuthError();
        return res.status(authError.status).json(authError.body);
      }
      
      // Re-throw to be handled by the main handler
      throw error;
    }
  }
  
  async handleStreamingChatCompletion(req, res, validatedBody) {
    const startTime = Date.now();
    const accountId = req.headers['x-qwen-account'] || req.query.account || req.body.account;
    const model = validatedBody.model || config.defaultModel;
    
    try {
      // Set streaming headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // Call Qwen API streaming method
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
      
      // Record successful API request metrics (at the start of streaming)
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // Convert to seconds at the start
        this.metricsCollector.incrementApiRequest('openai_streaming', model, accountId);
        this.metricsCollector.recordApiRequestDuration('openai_streaming', model, accountId, duration);
      }
      
      // Log the API call (without response data since it's streaming)
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, { streaming: true });
      
      // Print streaming request message
      console.log('\x1b[32m%s\x1b[0m', `Streaming chat completion request started. Debug log saved to: ${debugFileName}`);
      
      // Pipe the stream to the response
      stream.pipe(res);
      
      // Handle stream errors
      stream.on('error', (error) => {
        console.error('\x1b[31m%s\x1b[0m', `Error in streaming chat completion: ${error.message}`);
        if (!res.headersSent) {
          const apiError = ErrorFormatter.openAIApiError(error.message, 'streaming_error');
          res.status(apiError.status).json(apiError.body);
        }
        res.end();
      });
      
      // Handle client disconnect
      req.on('close', () => {
        stream.destroy();
      });
      
    } catch (error) {
      // Record failed API request metrics
      if (this.metricsCollector) {
        const duration = (Date.now() - startTime) / 1000; // Convert to seconds
        this.metricsCollector.incrementApiRequest('openai_streaming', model, accountId);
        this.metricsCollector.recordApiRequestDuration('openai_streaming', model, accountId, duration);
      }
      
      // Log the API call with error
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, null, error);
      
      // Also log detailed error separately
      await debugLogger.logError('/v1/chat/completions streaming', error, 'error');
      
      // Print error message in red
      if (debugFileName) {
        console.error('\x1b[31m%s\x1b[0m', `Error in streaming chat completion request. Debug log saved to: ${debugFileName}`);
      } else {
        console.error('\x1b[31m%s\x1b[0m', 'Error in streaming chat completion request.');
      }
      
      // Handle authentication errors
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        const authError = ErrorFormatter.openAIAuthError();
        if (!res.headersSent) {
          res.status(authError.status).json(authError.body);
          res.end();
        }
        return;
      }
      
      // For other errors in streaming context
      const apiError = ErrorFormatter.openAIApiError(error.message);
      if (!res.headersSent) {
        res.status(apiError.status).json(apiError.body);
        res.end();
      }
    }
  }
  
  async handleModels(req, res) {
    try {
      // Display request in terminal
      console.log('\x1b[36m%s\x1b[0m', 'Models request received');
      
      // Get models from Qwen
      const models = await qwenAPI.listModels();
      // Log the API call
      const debugFileName = await debugLogger.logApiCall('/v1/models', req, models);
      
      // Print success message with debug file info in green
      if (debugFileName) {
        console.log('\x1b[32m%s\x1b[0m', `Models request processed successfully. Debug log saved to: ${debugFileName}`);
      } else {
        console.log('\x1b[32m%s\x1b[0m', 'Models request processed successfully.');
      }
      
      res.json(models);
    } catch (error) {
      // Log the API call with error
      const debugFileName = await debugLogger.logApiCall('/v1/models', req, null, error);
      
      // Print error message in red
      if (debugFileName) {
        console.error('\x1b[31m%s\x1b[0m', `Error fetching models. Debug log saved to: ${debugFileName}`);
      } else {
        console.error('\x1b[31m%s\x1b[0m', 'Error fetching models.');
      }
      
      // Handle authentication errors
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        return res.status(401).json({
          error: {
            message: 'Not authenticated with Qwen. Please authenticate first.',
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
  
  
  
  async handleAuthInitiate(req, res) {
    try {
      // Initiate device flow
      const deviceFlow = await authManager.initiateDeviceFlow();
      
      const response = {
        verification_uri: deviceFlow.verification_uri,
        user_code: deviceFlow.user_code,
        device_code: deviceFlow.device_code,
        code_verifier: deviceFlow.code_verifier // This should be stored securely for polling
      };
      
      // Log the API call
      const debugFileName = await debugLogger.logApiCall('/auth/initiate', req, response);
      
      // Print success message with debug file info in green
      if (debugFileName) {
        console.log('\x1b[32m%s\x1b[0m', `Auth initiate request processed successfully. Debug log saved to: ${debugFileName}`);
      } else {
        console.log('\x1b[32m%s\x1b[0m', 'Auth initiate request processed successfully.');
      }
      
      res.json(response);
    } catch (error) {
      // Log the API call with error
      await debugLogger.logApiCall('/auth/initiate', req, null, error);
      
      // Print error message in red
      console.error('\x1b[31m%s\x1b[0m', `Error initiating authentication: ${error.message}`);
      
      res.status(500).json({
        error: {
          message: error.message,
          type: 'authentication_error'
        }
      });
    }
  }
  
  async handleAuthPoll(req, res) {
    try {
      // Validate the request body
      const validatedBody = this.validateRequest(this.authPollSchema, req.body);
      const { device_code, code_verifier } = validatedBody;
      
      // Poll for token
      const token = await authManager.pollForToken(device_code, code_verifier);
      
      const response = {
        access_token: token,
        message: 'Authentication successful'
      };
      
      // Log the API call
      const debugFileName = await debugLogger.logApiCall('/auth/poll', req, response);
      
      // Print success message with debug file info in green
      if (debugFileName) {
        console.log('\x1b[32m%s\x1b[0m', `Auth poll request processed successfully. Debug log saved to: ${debugFileName}`);
      } else {
        console.log('\x1b[32m%s\x1b[0m', 'Auth poll request processed successfully.');
      }
      
      res.json(response);
    } catch (error) {
      // Check if it's a validation error
      if (error.message.includes('Validation error')) {
        console.error('\x1b[31m%s\x1b[0m', `Validation error: ${error.message}`);
        const validationError = ErrorFormatter.openAIValidationError(error.message);
        return res.status(validationError.status).json(validationError.body);
      }
      
      // Log the API call with error
      await debugLogger.logApiCall('/auth/poll', req, null, error);
      
      // Also log detailed error separately
      await debugLogger.logError('/auth/poll', error, 'error');
      
      // Print error message in red
      console.error('\x1b[31m%s\x1b[0m', `Error polling for token: ${error.message}`);
      
      const apiError = ErrorFormatter.openAIApiError(error.message, 'authentication_error');
      res.status(apiError.status).json(apiError.body);
    }
  }
}

// Initialize proxies
const proxy = new QwenOpenAIProxy(metricsCollector);
const anthropicProxy = new AnthropicProxy(debugLogger);

// OpenAI-compatible routes
app.post('/v1/chat/completions', (req, res) => proxy.handleChatCompletion(req, res));
app.get('/v1/models', (req, res) => proxy.handleModels(req, res));

// Anthropic API routes for Claude Code CLI compatibility
app.post('/anthropic/v1/messages', (req, res) => {
  // 检查是否为流式请求
  if (req.body.stream) {
    anthropicProxy.handleStreamingRequest(req, res);
  } else {
    anthropicProxy.handleMessages(req, res);
  }
});
app.get('/anthropic/v1/models', (req, res) => anthropicProxy.handleModels(req, res));

// Authentication routes
app.post('/auth/initiate', (req, res) => proxy.handleAuthInitiate(req, res));
app.post('/auth/poll', (req, res) => proxy.handleAuthPoll(req, res));

// Metrics endpoint for Prometheus
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

// Health check endpoint
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
    
    // Get token usage data
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

// Handle graceful shutdown to save pending data
process.on('SIGINT', async () => {
  console.log('\n\x1b[33m%s\x1b[0m', 'Received SIGINT, shutting down gracefully...');
  try {
    // Force save any pending request counts before exit
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
    // Force save any pending request counts before exit
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
  console.log(`Anthropic-compatible endpoint: http://${HOST}:${PORT}/v2`);
  console.log(`Authentication endpoint: http://${HOST}:${PORT}/auth/initiate`);
  
  // Show available accounts
  try {
    await qwenAPI.authManager.loadAllAccounts();
    const accountIds = qwenAPI.authManager.getAccountIds();
    
    // Show default account if configured
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
      // Check if default account exists
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