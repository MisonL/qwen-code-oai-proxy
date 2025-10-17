/**
 * Qwen API 客户端
 * 与 Qwen API 进行交互，处理认证、账户管理和错误处理
 */

const axios = require('axios');
const http = require('http');
const https = require('https');
const { QwenAuthManager } = require('./auth.js');
const { PassThrough } = require('stream');
const path = require('path');
const { promises: fs } = require('fs');
const { Cache } = require('../utils/cache.js');

// 创建支持连接池的HTTP代理
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  freeSocketTimeout: 30000
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  freeSocketTimeout: 30000
});

// 为静态数据创建缓存实例
const staticDataCache = new Cache();

// 默认Qwen配置
const DEFAULT_QWEN_API_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen3-coder-plus';

// 已知Qwen模型列表
const QWEN_MODELS = [
  {
    id: 'qwen3-coder-plus',
    object: 'model',
    created: 1754686206,
    owned_by: 'qwen'
  },
  {
    id: 'qwen3-coder-flash',
    object: 'model',
    created: 1754686206,
    owned_by: 'qwen'
  },
  {
    id: 'vision-model',
    object: 'model',
    created: 1754686206,
    owned_by: 'qwen'
  }
];

/**
 * Process messages to handle image content for vision models
 * @param {Array} messages - Array of messages
 * @param {string} model - Model name
 * @returns {Array} Processed messages
 */
function processMessagesForVision(messages, model) {
  // 仅对视觉模型进行处理
  if (model !== 'vision-model') {
    return messages;
  }

  return messages.map(message => {
    if (!message.content) {
      return message;
    }

    // 如果内容已经是数组，假设其格式正确
    if (Array.isArray(message.content)) {
      return message;
    }

    // 如果内容是字符串，检查是否包含图像引用
    if (typeof message.content === 'string') {
      // 查找base64图像模式或URL
      const imagePatterns = [
        /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g,
        /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|bmp)/gi
      ];

      let hasImages = false;
      const content = message.content;
      const parts = [{ type: 'text', text: content }];

      // 提取base64图像
      const base64Matches = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g);
      if (base64Matches) {
        hasImages = true;
        base64Matches.forEach(match => {
          const mimeMatch = match.match(/data:image\/([^;]+);base64,/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'png';
          const base64Data = match.split(',')[1];
          
          parts.push({
            type: 'image_url',
            image_url: {
              url: match
            }
          });
        });
      }

      // 提取图像URL
      const urlMatches = content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|bmp)/gi);
      if (urlMatches) {
        hasImages = true;
        urlMatches.forEach(url => {
          parts.push({
            type: 'image_url',
            image_url: {
              url: url
            }
          });
        });
      }

      // 如果未找到图像，保持为字符串
      if (!hasImages) {
        return message;
      }

      return {
        ...message,
        content: parts
      };
    }

    return message;
  });
}

/**
 * Check if an error is related to authentication/authorization
 */
function isAuthError(error) {
  if (!error) return false;

  const errorMessage = 
    error instanceof Error 
      ? error.message.toLowerCase() 
      : String(error).toLowerCase();

  // 为可能具有状态或代码属性的错误定义类型
  const errorWithCode = error;
  const errorCode = errorWithCode?.response?.status || errorWithCode?.code;

  return (
    errorCode === 400 ||
    errorCode === 401 ||
    errorCode === 403 ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('forbidden') ||
    errorMessage.includes('invalid api key') ||
    errorMessage.includes('invalid access token') ||
    errorMessage.includes('token expired') ||
    errorMessage.includes('authentication') ||
    errorMessage.includes('access denied') ||
    (errorMessage.includes('token') && errorMessage.includes('expired')) ||
    // 还要检查可能与认证问题相关的504错误
    errorCode === 504 ||
    errorMessage.includes('504') ||
    errorMessage.includes('gateway timeout')
  );
}

/**
 * Check if an error is related to quota limits
 */
function isQuotaExceededError(error) {
  if (!error) return false;

  const errorMessage = 
    error instanceof Error 
      ? error.message.toLowerCase() 
      : String(error).toLowerCase();

  // 为可能具有状态或代码属性的错误定义类型
  const errorWithCode = error;
  const errorCode = errorWithCode?.response?.status || errorWithCode?.code;

  return (
    errorMessage.includes('insufficient_quota') ||
    errorMessage.includes('free allocated quota exceeded') ||
    (errorMessage.includes('quota') && errorMessage.includes('exceeded')) ||
    errorCode === 429
  );
}

class QwenAPI {
  constructor() {
    this.authManager = new QwenAuthManager();
    this.requestCount = new Map(); // Track requests per account
    this.authErrorCount = new Map(); // Track consecutive auth errors per account
    this.tokenUsage = new Map(); // Track token usage per account
    this.lastResetDate = new Date().toISOString().split('T')[0]; // Track last reset date (UTC)
    this.requestCountFile = path.join(this.authManager.qwenDir, 'request_counts.json');
    
    // 智能账户选择
    this.failedAccountsFile = path.join(this.authManager.qwenDir, 'failed_accounts.json');
    this.failedAccounts = new Set();
    this.lastFailedReset = null;
    
    // 文件I/O缓存机制
    this.lastSaveTime = 0;
    this.saveInterval = 60000; // Save every 60 seconds
    this.pendingSave = false;
    
    // 并发请求处理
    this.accountLocks = new Map(); // Track which accounts are in use
    this.accountQueues = new Map(); // Queue for requests waiting for specific accounts
    
    // 每账户速率限制
    this.accountRequestCounts = new Map(); // Track requests per account per time window
    this.requestWindowDuration = 60000; // 1 minute window
    
    this.loadRequestCounts();
    this.loadFailedAccounts();
  }

  /**
   * Reset failed accounts if we've crossed into a new UTC day
   */
  async resetFailedAccountsIfNeeded() {
    const today = new Date().toISOString().split('T')[0];
    if (this.lastFailedReset !== today) {
      this.failedAccounts.clear();
      this.lastFailedReset = today;
      await this.saveFailedAccounts();
      console.log('Resetting failed accounts for new UTC day');
    }
  }

  /**
   * Load request counts from disk
   */
  async loadRequestCounts() {
    try {
      const data = await fs.readFile(this.requestCountFile, 'utf8');
      const counts = JSON.parse(data);
      
      // 恢复上次重置日期
      if (counts.lastResetDate) {
        this.lastResetDate = counts.lastResetDate;
      }
      
      // 恢复请求计数
      if (counts.requests) {
        for (const [accountId, count] of Object.entries(counts.requests)) {
          this.requestCount.set(accountId, count);
        }
      }
      
      // 恢复token使用数据
      if (counts.tokenUsage) {
        for (const [accountId, usageData] of Object.entries(counts.tokenUsage)) {
          this.tokenUsage.set(accountId, usageData);
        }
      }
      
      // 如果进入新的UTC日期则重置计数
      this.resetRequestCountsIfNeeded();
    } catch (error) {
      // 文件不存在或无效，从空计数开始
      this.resetRequestCountsIfNeeded();
    }
  }

  /**
   * Save request counts to disk
   */
  async saveRequestCounts() {
    try {
      const counts = {
        lastResetDate: this.lastResetDate,
        requests: Object.fromEntries(this.requestCount),
        tokenUsage: Object.fromEntries(this.tokenUsage)
      };
      await fs.writeFile(this.requestCountFile, JSON.stringify(counts, null, 2));
      this.lastSaveTime = Date.now();
      this.pendingSave = false;
    } catch (error) {
      console.warn('Failed to save request counts:', error.message);
      this.pendingSave = false;
    }
  }

  /**
   * Schedule a save operation with debouncing
   */
  scheduleSave() {
    // 如果保存已在等待中则不安排
    if (this.pendingSave) return;
    
    this.pendingSave = true;
    const now = Date.now();
    
    // 如果最近已保存，则等待间隔，否则立即保存
    if (now - this.lastSaveTime < this.saveInterval) {
      setTimeout(() => this.saveRequestCounts(), this.saveInterval);
    } else {
      // 立即保存
      this.saveRequestCounts();
    }
  }

  /**
   * Reset request counts if we've crossed into a new UTC day
   */
  resetRequestCountsIfNeeded() {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.requestCount.clear();
      this.lastResetDate = today;
      console.log('Request counts reset for new UTC day');
      this.saveRequestCounts();
    }
  }

  /**
   * Load failed accounts from local JSON file
   */
  async loadFailedAccounts() {
    try {
      const data = await fs.readFile(this.failedAccountsFile, 'utf8');
      const failed = JSON.parse(data);
      
      // 如果是新的UTC日期则重置失败账户
      const today = new Date().toISOString().split('T')[0];
      if (failed.lastReset !== today) {
        console.log('Resetting failed accounts for new UTC day');
        this.failedAccounts.clear();
        this.lastFailedReset = today;
        await this.saveFailedAccounts();
      } else {
        this.failedAccounts = new Set(failed.accounts || []);
        this.lastFailedReset = failed.lastReset;
      }
    } catch (error) {
      // 文件不存在或无效，从空失败账户开始
      this.failedAccounts.clear();
      this.lastFailedReset = new Date().toISOString().split('T')[0];
      this.saveFailedAccounts();
    }
  }

  /**
   * Save failed accounts to local JSON file
   */
  async saveFailedAccounts() {
    try {
      const data = {
        accounts: Array.from(this.failedAccounts),
        lastReset: this.lastFailedReset
      };
      await fs.writeFile(this.failedAccountsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save failed accounts:', error.message);
    }
  }

  /**
   * Mark an account as failed
   */
  async markAccountAsFailed(accountId) {
    if (!this.failedAccounts.has(accountId)) {
      this.failedAccounts.add(accountId);
      console.log(`Marked account ${accountId} as failed`);
      await this.saveFailedAccounts();
    }
  }

  /**
   * Get list of healthy accounts (not in failed list)
   */
  getHealthyAccounts(allAccountIds) {
    return allAccountIds.filter(id => !this.failedAccounts.has(id));
  }

  /**
   * Increment request count for an account
   * @param {string} accountId - The account ID
   */
  async incrementRequestCount(accountId) {
    this.resetRequestCountsIfNeeded();
    const currentCount = this.requestCount.get(accountId) || 0;
    this.requestCount.set(accountId, currentCount + 1);
    
    // 安排保存而不是立即保存
    this.scheduleSave();
  }

  /**
   * Record token usage for an account
   * @param {string} accountId - The account ID
   * @param {number} inputTokens - Number of input tokens
   * @param {number} outputTokens - Number of output tokens
   */
  async recordTokenUsage(accountId, inputTokens, outputTokens) {
    try {
      // 获取YYYY-MM-DD格式的当前日期
      const currentDate = new Date().toISOString().split('T')[0];
      
      // 如果不存在则为此账户初始化token使用数组
      if (!this.tokenUsage.has(accountId)) {
        this.tokenUsage.set(accountId, []);
      }
      
      const accountUsage = this.tokenUsage.get(accountId);
      
      // 查找今天的现有条目
      let todayEntry = accountUsage.find(entry => entry.date === currentDate);
      
      if (todayEntry) {
        // 更新现有条目
        todayEntry.inputTokens += inputTokens;
        todayEntry.outputTokens += outputTokens;
      } else {
        // 为今天创建新条目
        accountUsage.push({
          date: currentDate,
          inputTokens: inputTokens,
          outputTokens: outputTokens
        });
}
      
      // 安排保存而不是立即保存
      this.scheduleSave();
    } catch (error) {
      console.warn('Failed to record token usage:', error.message);
    }
  }

  /**
   * Get request count for an account
   * @param {string} accountId - The account ID
   * @returns {number} The request count
   */
  getRequestCount(accountId) {
    this.resetRequestCountsIfNeeded();
    return this.requestCount.get(accountId) || 0;
  }

  /**
   * Increment auth error count for an account
   * @param {string} accountId - The account ID
   */
  incrementAuthErrorCount(accountId) {
    const currentCount = this.authErrorCount.get(accountId) || 0;
    this.authErrorCount.set(accountId, currentCount + 1);
    return currentCount + 1;
  }

  /**
   * Reset auth error count for an account (when a successful request is made)
   * @param {string} accountId - The account ID
   */
  resetAuthErrorCount(accountId) {
    this.authErrorCount.set(accountId, 0);
  }

  /**
   * Get auth error count for an account
   * @param {string} accountId - The account ID
   * @returns {number} The auth error count
   */
  getAuthErrorCount(accountId) {
    return this.authErrorCount.get(accountId) || 0;
  }

  /**
   * Get the best available account based on token freshness
   * @returns {Object|null} Account info with {accountId, credentials}
   */
  async getBestAccount(exclude = new Set()) {
    // 获取所有可用账户
    const accountIds = this.authManager.getAccountIds();
    let healthyAccountIds = this.getHealthyAccounts(accountIds);
    if (exclude && exclude.size) {
      healthyAccountIds = healthyAccountIds.filter(id => !exclude.has(id));
    }

    if (healthyAccountIds.length === 0) {
      console.log('No healthy accounts available');
      return null;
    }

    console.log(`Available healthy accounts: ${healthyAccountIds.join(', ')}`);

    // 为所有健康账户加载凭证并找到最新的
    const accountCredentials = [];
    for (const accountId of healthyAccountIds) {
      // 账户应已由调用方加载；从内存中获取
      const credentials = this.authManager.getAccountCredentials(accountId);
      if (credentials) {
        const minutesLeft = (credentials.expiry_date - Date.now()) / 60000;
        accountCredentials.push({
          accountId,
          credentials,
          minutesLeft
        });
      }
    }

    if (accountCredentials.length === 0) {
      console.log('No valid credentials found for any healthy account');
      return null;
    }

    // 按新鲜度排序（最新的在前）
    accountCredentials.sort((a, b) => b.minutesLeft - a.minutesLeft);

    // 从最新到最不新鲜尝试账户
    for (const account of accountCredentials) {
      try {
        let selectedCredentials = account.credentials;

        // 如果账户已过期，尝试刷新
        if (account.minutesLeft < 0) {
          console.log(`Account ${account.accountId} is expired, attempting refresh...`);
          try {
            // 刷新并确保凭证保存在正确的命名账户下
            selectedCredentials = await this.authManager.performTokenRefresh(account.credentials, account.accountId);
            console.log(`Successfully refreshed account ${account.accountId}`);
          } catch (refreshError) {
            console.log(`Failed to refresh account ${account.accountId}: ${refreshError.message}`);
            continue; // Try next account
          }
        }

        console.log(`Selected account ${account.accountId} (${account.minutesLeft.toFixed(1)} minutes left)`);
        return {
          accountId: account.accountId,
          credentials: selectedCredentials
        };
      } catch (error) {
        console.log(`Failed to prepare account ${account.accountId}: ${error.message}`);
        continue;
      }
    }

    console.log('Could not prepare any account for use');
    return null;
  }

  async getApiEndpoint(credentials) {
    // 检查凭证是否包含自定义端点
    if (credentials && credentials.resource_url) {
      let endpoint = credentials.resource_url;
      // 确保其具有方案
      if (!endpoint.startsWith('http')) {
        endpoint = `https://${endpoint}`;
      }
      // 确保其具有/v1后缀
      if (!endpoint.endsWith('/v1')) {
        if (endpoint.endsWith('/')) {
          endpoint += 'v1';
        } else {
          endpoint += '/v1';
        }
      }
      return endpoint;
    } else {
      // 使用默认端点
      return DEFAULT_QWEN_API_BASE_URL;
    }
  }

  async chatCompletions(request) {
    // 重置每日状态并加载账户
    await this.resetFailedAccountsIfNeeded();
    await this.authManager.loadAllAccounts();
    const forcedAccountId = request.accountId;
    if (forcedAccountId) {
      // 仅使用指定账户；如果需要，在请求前刷新一次，不轮换/重试
      const creds0 = this.authManager.getAccountCredentials(forcedAccountId);
      if (!creds0) {
        throw new Error(`No credentials found for account ${forcedAccountId}`);
      }
      let credentials = creds0;
      if (!this.authManager.isTokenValid(credentials)) {
        credentials = await this.authManager.performTokenRefresh(credentials, forcedAccountId);
      }
      const accountInfo = { accountId: forcedAccountId, credentials };
      return await this.processRequestWithAccount(request, accountInfo);
    }

    // 多账户自动选择
    const accountIds = this.authManager.getAccountIds();
    if (accountIds.length === 0) {
      return this.chatCompletionsSingleAccount(request);
    }
    
    const tried = new Set();
    let lastError = null;
    const maxAttempts = 2;
    
    for (let i = 0; i < maxAttempts; i++) {
      const bestAccount = await this.getBestAccount(tried);
      if (!bestAccount) {
        break;
      }
      
      try {
        // 检查账户是否受速率限制
        if (this.isAccountRateLimited(bestAccount.accountId)) {
          // 将账户标记为已尝试并继续下一个
          tried.add(bestAccount.accountId);
          continue;
        }
        
        // 尝试为此账户获取锁
        const lockAcquired = await this.acquireAccountLock(bestAccount.accountId);
        if (!lockAcquired) {
          // 账户正在使用中，跳到下一次尝试
          tried.add(bestAccount.accountId);
          continue;
        }
        
        try {
          // 获取锁后但在处理前增加请求计数
          this.incrementAccountRequestCount(bestAccount.accountId);
          return await this.processRequestWithAccount(request, bestAccount);
        } finally {
          // 请求完成后始终释放锁（成功或失败）
          this.releaseAccountLock(bestAccount.accountId);
        }
      } catch (error) {
        lastError = error;
        await this.handleRequestError(error, bestAccount.accountId);
        tried.add(bestAccount.accountId);
        continue;
      }
    }
    
    if (lastError) throw lastError;
    throw new Error('No healthy accounts available');
  }

  /**
   * Process request with a specific account (no locking)
   */
  async processRequestWithAccount(request, accountInfo) {
    const { accountId, credentials } = accountInfo;
    
    // 显示我们正在使用的账户
    console.log(`\x1b[36mUsing account ${accountId} (Request #${this.getRequestCount(accountId) + 1} today)\x1b[0m`);
    
    // 获取API端点
    const apiEndpoint = await this.getApiEndpoint(credentials);
    
    // 进行API调用
    const url = `${apiEndpoint}/chat/completions`;
    const model = request.model || DEFAULT_MODEL;
    
    // 处理视觉模型支持的消息
    const processedMessages = processMessagesForVision(request.messages, model);
    
    const payload = {
      model: model,
      messages: processedMessages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      top_p: request.top_p,
      tools: request.tools,
      tool_choice: request.tool_choice,
      stream: false
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${credentials.access_token}`,
    };

    const response = await axios.post(url, payload, { 
      headers: headers,
      timeout: 300000, // 5 minutes timeout
      httpAgent,
      httpsAgent
    });

    // 为成功请求增加请求计数
    await this.incrementRequestCount(accountId);
    
    // 成功请求时重置认证错误计数
    this.resetAuthErrorCount(accountId);
    
    // 如果可用则记录token使用情况
    if (response.data && response.data.usage) {
      await this.recordTokenUsage(
        accountId, 
        response.data.usage.prompt_tokens || 0,
        response.data.usage.completion_tokens || 0
      );
    }
    
    console.log(`\x1b[32mRequest completed successfully using account ${accountId}\x1b[0m`);
    return response.data;
  }

  /**
   * Handle request errors with smart account management
   */
  async handleRequestError(error, accountId) {
    if (!error.response) {
      // 网络或其他非API错误 - 不将账户标记为失败
      return;
    }

    const status = error.response.status;
    const errorData = error.response.data || {};
    
    // 为特定错误类型将账户标记为失败
    if (status === 429 || // Rate limit/quota exceeded
        (status === 401 && errorData.error?.message?.includes('Invalid access token')) ||
        (status === 400 && errorData.error?.message?.includes('quota'))) {
      
      console.log(`\x1b[33mMarking account ${accountId} as failed due to ${status} error\x1b[0m`);
      await this.markAccountAsFailed(accountId);
    } else if (status === 401) {
      // 尝试为其他401错误刷新token
      try {
        console.log(`\x1b[33mAttempting token refresh for account ${accountId}\x1b[0m`);
        const credentials = this.authManager.getAccountCredentials(accountId);
        if (credentials) {
          await this.authManager.performTokenRefresh(credentials, accountId);
          console.log(`\x1b[32mSuccessfully refreshed token for account ${accountId}\x1b[0m`);
        }
      } catch (refreshError) {
        console.log(`\x1b[31mToken refresh failed for account ${accountId}, marking as failed\x1b[0m`);
        await this.markAccountAsFailed(accountId);
      }
    }
    // 对于500/502/504错误，不将账户标记为失败（临时服务器问题）
  }

  /**
   * Chat completions for single account mode
   */
  async chatCompletionsSingleAccount(request) {
    // 获取有效的访问token（如果需要会自动刷新）
    const accessToken = await this.authManager.getValidAccessToken();
    const credentials = await this.authManager.loadCredentials();
    const apiEndpoint = await this.getApiEndpoint(credentials);
    
    // 进行API调用
    const url = `${apiEndpoint}/chat/completions`;
    const model = request.model || DEFAULT_MODEL;
    
    // 处理视觉模型支持的消息
    const processedMessages = processMessagesForVision(request.messages, model);
    
    const payload = {
      model: model,
      messages: processedMessages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      top_p: request.top_p,
      tools: request.tools,
      tool_choice: request.tool_choice
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)'
    };
    
    try {
      const response = await axios.post(url, payload, { headers, timeout: 300000, httpAgent, httpsAgent }); // 5 minute timeout
      // 成功请求时重置认证错误计数 (for consistency, even though we don't rotate)
      this.resetAuthErrorCount('default');
      
      // 如果可用则记录token使用情况 in response
      if (response.data && response.data.usage) {
        const { prompt_tokens = 0, completion_tokens = 0 } = response.data.usage;
        await this.recordTokenUsage('default', prompt_tokens, completion_tokens);
      }
      
      return response.data;
    } catch (error) {
      // 检查这是否是可能从重试中受益的认证错误
      if (isAuthError(error)) {
        // 增加认证错误计数（用于跟踪，即使我们不能轮换）
        const authErrorCount = this.incrementAuthErrorCount('default');
        console.log(`\x1b[33mDetected auth error (${error.response?.status || 'N/A'}) (consecutive count: ${authErrorCount})\x1b[0m`);
        
        console.log('\x1b[33m%s\x1b[0m', `Attempting token refresh and retry...`);
        try {
          // 强制刷新token并重试一次
          await this.authManager.performTokenRefresh(credentials);
          const newAccessToken = await this.authManager.getValidAccessToken();
          
          // 使用新token重试请求
          console.log('\x1b[36m%s\x1b[0m', 'Retrying request with refreshed token...');
          const retryHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${newAccessToken}`,
            'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)'
          };
          
          const retryResponse = await axios.post(url, payload, { headers: retryHeaders, timeout: 300000, httpAgent, httpsAgent });
          console.log('\x1b[32m%s\x1b[0m', 'Request succeeded after token refresh');
          // 成功请求时重置认证错误计数
          this.resetAuthErrorCount('default');
          return retryResponse.data;
        } catch (retryError) {
          console.error('\x1b[31m%s\x1b[0m', 'Request failed even after token refresh');
          // 如果重试失败，则抛出带有附加上下文的原始错误
          throw new Error(`Qwen API error (after token refresh attempt): ${error.response?.status || 'N/A'} ${JSON.stringify(error.response?.data || error.message)}`);
        }
      }
      
      if (error.response) {
        // 请求已发出，服务器响应了状态码
        throw new Error(`Qwen API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        // 请求已发出但未收到响应
        throw new Error(`Qwen API request failed: No response received`);
      } else {
        // 在设置请求时发生了触发错误的情况
        throw new Error(`Qwen API request failed: ${error.message}`);
      }
    }
  }

  /**
   * Acquire a lock for an account to prevent concurrent requests
   * @param {string} accountId - The account ID to lock
   * @returns {Promise<boolean>} True if lock was acquired, false otherwise
   */
  async acquireAccountLock(accountId) {
    if (!this.accountLocks.has(accountId)) {
      // 没有人在使用此账户，获取锁
      this.accountLocks.set(accountId, true);
      return true;
    }
    
    // 账户当前正在使用中，返回false
    return false;
  }

  /**
   * Release a lock for an account
   * @param {string} accountId - The account ID to unlock
   */
  releaseAccountLock(accountId) {
    if (this.accountLocks.has(accountId)) {
      this.accountLocks.delete(accountId);
    }
  }

  /**
   * Check if account has exceeded rate limit
   * @param {string} accountId - The account ID to check
   * @returns {boolean} True if rate limit exceeded, false otherwise
   */
  isAccountRateLimited(accountId) {
    const now = Date.now();
    const accountData = this.accountRequestCounts.get(accountId) || { count: 0, resetTime: now + this.requestWindowDuration };
    
    // 如果窗口已过期，重置计数
    if (now >= accountData.resetTime) {
      accountData.count = 0;
      accountData.resetTime = now + this.requestWindowDuration;
    }
    
    // 对于Qwen账户，我们将使用每小时1800个请求的默认限制（每分钟30个）
    // 但由于我们按分钟检查，那是每分钟30个请求
    const rateLimit = 30; // requests per window
    
    // 检查我们是否超过了速率限制
    if (accountData.count >= rateLimit) {
      console.log(`\x1b[33mAccount ${accountId} has exceeded rate limit (${rateLimit} requests per ${this.requestWindowDuration/1000}s window)\x1b[0m`);
      return true;
    }
    
    return false;
  }

  /**
   * Increment account request count
   * @param {string} accountId - The account ID to increment
   */
  incrementAccountRequestCount(accountId) {
    const now = Date.now();
    let accountData = this.accountRequestCounts.get(accountId);
    
    if (!accountData || now >= accountData.resetTime) {
      // 如果窗口已过期则重置窗口
      accountData = { count: 0, resetTime: now + this.requestWindowDuration };
    }
    
    accountData.count++;
    this.accountRequestCounts.set(accountId, accountData);
  }

  async listModels() {
    const cacheKey = 'qwen_models';
    
    // 检查模型是否已缓存
    const cachedModels = staticDataCache.get(cacheKey);
    if (cachedModels) {
      console.log('Returning cached models list');
      return cachedModels;
    }
    
    console.log('Returning mock models list');
    
    // 创建模型响应
    const modelsResponse = {
      object: 'list',
      data: QWEN_MODELS
    };
    
    // 缓存模型1小时
    staticDataCache.set(cacheKey, modelsResponse, 60 * 60 * 1000); // 1 hour
    
    return modelsResponse;
  }

  

  /**
   * Stream chat completions from Qwen API
   * @param {Object} request - The chat completion request
   * @returns {Promise<Stream>} - A stream of SSE events
   */
  async streamChatCompletions(request) {
    // 重置每日状态并加载账户
    await this.resetFailedAccountsIfNeeded();
    await this.authManager.loadAllAccounts();
    const forcedAccountId = request.accountId;
    const accountIds = this.authManager.getAccountIds();

    if (forcedAccountId) {
      const creds0 = this.authManager.getAccountCredentials(forcedAccountId);
      if (!creds0) throw new Error(`No credentials found for account ${forcedAccountId}`);
      let credentials = creds0;
      if (!this.authManager.isTokenValid(credentials)) {
        credentials = await this.authManager.performTokenRefresh(credentials, forcedAccountId);
      }
      const apiEndpoint = await this.getApiEndpoint(credentials);
      const url = `${apiEndpoint}/chat/completions`;
      const model = request.model || DEFAULT_MODEL;
      const processedMessages = processMessagesForVision(request.messages, model);
      const payload = { model, messages: processedMessages, temperature: request.temperature, max_tokens: request.max_tokens, top_p: request.top_p, tools: request.tools, tool_choice: request.tool_choice, stream: true, stream_options: { include_usage: true } };
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${credentials.access_token}`, 'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)', 'Accept': 'text/event-stream' };
      const stream = new PassThrough();
      const response = await axios.post(url, payload, { headers, timeout: 300000, responseType: 'stream', httpAgent, httpsAgent });
      response.data.pipe(stream);
      return stream;
    }

    if (accountIds.length === 0) {
      // 使用默认单账户模式
      const accessToken = await this.authManager.getValidAccessToken();
      const credentials = await this.authManager.loadCredentials();
      const apiEndpoint = await this.getApiEndpoint(credentials);
      const url = `${apiEndpoint}/chat/completions`;
      const model = request.model || DEFAULT_MODEL;
      const processedMessages = processMessagesForVision(request.messages, model);
      const payload = { model, messages: processedMessages, temperature: request.temperature, max_tokens: request.max_tokens, top_p: request.top_p, tools: request.tools, tool_choice: request.tool_choice, stream: true, stream_options: { include_usage: true } };
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)', 'Accept': 'text/event-stream' };
      const stream = new PassThrough();
      const response = await axios.post(url, payload, { headers, timeout: 300000, responseType: 'stream', httpAgent, httpsAgent });
      response.data.pipe(stream);
      return stream;
    }

    // 两次尝试轮换，带账户锁定和速率限制
    const tried = new Set();
    let lastError = null;
    for (let i = 0; i < 2; i++) {
      const bestAccount = await this.getBestAccount(tried);
      if (!bestAccount) break;
      const { accountId, credentials } = bestAccount;
      
      try {
        // 检查账户是否受速率限制
        if (this.isAccountRateLimited(accountId)) {
          // 将账户标记为已尝试并继续下一个
          tried.add(accountId);
          continue;
        }
        
        // 尝试为此账户获取锁
        const lockAcquired = await this.acquireAccountLock(accountId);
        if (!lockAcquired) {
          // 账户正在使用中，跳到下一次尝试
          tried.add(accountId);
          continue;
        }
        
        try {
          const apiEndpoint = await this.getApiEndpoint(credentials);
          const url = `${apiEndpoint}/chat/completions`;
          const model = request.model || DEFAULT_MODEL;
          const processedMessages = processMessagesForVision(request.messages, model);
          const payload = { model, messages: processedMessages, temperature: request.temperature, max_tokens: request.max_tokens, top_p: request.top_p, tools: request.tools, tool_choice: request.tool_choice, stream: true, stream_options: { include_usage: true } };
          const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${credentials.access_token}`, 'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)', 'Accept': 'text/event-stream' };
          const stream = new PassThrough();
          
          // 获取锁后但在处理前增加请求计数
          this.incrementAccountRequestCount(accountId);
          
          const response = await axios.post(url, payload, { headers, timeout: 300000, responseType: 'stream', httpAgent, httpsAgent });
          response.data.pipe(stream);
          return stream;
        } finally {
          // 请求完成后始终释放锁（成功或失败）
          this.releaseAccountLock(accountId);
        }
      } catch (error) {
        lastError = error;
        await this.handleRequestError(error, accountId);
        tried.add(accountId);
        continue;
      }
    }
    if (lastError) throw lastError;
    throw new Error('No healthy accounts available');
  }
}

module.exports = { QwenAPI };