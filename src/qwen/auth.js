/**
 * Qwen 认证管理器
 * 处理 Qwen OAuth 认证流程和凭证管理
 */

const path = require('path');
const { promises: fs } = require('fs');
const { fetch } = require('undici');
const crypto = require('crypto');
const open = require('open');
const qrcode = require('qrcode-terminal');

// 文件系统配置
const QWEN_DIR = '.qwen';
const QWEN_CREDENTIAL_FILENAME = 'oauth_creds.json';
const QWEN_MULTI_ACCOUNT_PREFIX = 'oauth_creds_';
const QWEN_MULTI_ACCOUNT_SUFFIX = '.json';

// OAuth配置（来自qwen-code分析）
const QWEN_OAUTH_BASE_URL = 'https://chat.qwen.ai';
const QWEN_OAUTH_DEVICE_CODE_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/device/code`;
const QWEN_OAUTH_TOKEN_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/token`;
const QWEN_OAUTH_CLIENT_ID = 'f0304373b74a44d2b584a3fb70ca9e56';
const QWEN_OAUTH_SCOPE = 'openid profile email model.completion';
const QWEN_OAUTH_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
const TOKEN_REFRESH_BUFFER_MS = 30 * 1000; // 30 seconds

/**
 * Generate a random code verifier for PKCE
 * @returns A random string of 43-128 characters
 */
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a code challenge from a code verifier using SHA-256
 * @param codeVerifier The code verifier string
 * @returns The code challenge string
 */
function generateCodeChallenge(codeVerifier) {
  const hash = crypto.createHash('sha256');
  hash.update(codeVerifier);
  return hash.digest('base64url');
}

/**
 * Generate PKCE code verifier and challenge pair
 * @returns Object containing code_verifier and code_challenge
 */
function generatePKCEPair() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  return { code_verifier: codeVerifier, code_challenge: codeChallenge };
}

class QwenAuthManager {
  constructor() {
    this.qwenDir = path.join(process.env.HOME || process.env.USERPROFILE, QWEN_DIR);
    this.credentialsPath = path.join(this.qwenDir, QWEN_CREDENTIAL_FILENAME);
    this.credentials = null;
    this.refreshPromise = null;
    this.accounts = new Map(); // For multi-account support
    this.currentAccountIndex = 0; // For round-robin account selection
  }

  async loadCredentials() {
    // 检查QWEN_CODE_AUTH_USE是否已禁用
    const config = require('../config.js');
    if (config.qwenCodeAuthUse === false) {
      return null;
    }
    
    if (this.credentials) {
      return this.credentials;
    }
    try {
      const credentialsData = await fs.readFile(this.credentialsPath, 'utf8');
      this.credentials = JSON.parse(credentialsData);
      return this.credentials;
    } catch (error) {
      return null;
    }
  }

  /**
   * Load all multi-account credentials
   * @returns {Promise<Map>} Map of account IDs to credentials
   */
  async loadAllAccounts() {
    try {
      // 清除现有账户
      this.accounts.clear();
      
      // 读取目录以查找所有凭证文件
      const files = await fs.readdir(this.qwenDir);
      
      // 过滤多账户凭证文件
      const accountFiles = files.filter(file => 
        file.startsWith(QWEN_MULTI_ACCOUNT_PREFIX) && 
        file.endsWith(QWEN_MULTI_ACCOUNT_SUFFIX) &&
        file !== QWEN_CREDENTIAL_FILENAME
      );
      
      // 检查冲突的认证文件，如果需要则显示警告
      const config = require('../config.js');
      try {
        // 检查默认认证文件是否存在
        const defaultAuthExists = await fs.access(this.credentialsPath).then(() => true).catch(() => false);
        
        // 如果默认和命名的认证文件都存在且QWEN_CODE_AUTH_USE已启用，则显示警告
        if (defaultAuthExists && accountFiles.length > 0 && config.qwenCodeAuthUse !== false) {
          console.log('\n\x1b[31m%s\x1b[0m', '[PROXY WARNING] Conflicting authentication files detected!');
          console.log('\x1b[31m%s\x1b[0m', 'Found both default ~/.qwen/oauth_creds.json (created by qwen-code) and named account file(s) ~/.qwen/oauth_creds_<name>.json');
          console.log('\x1b[31m%s\x1b[0m', 'If these were created with the same account, token refresh conflicts will occur, invalidating the other file.');
          console.log('\x1b[31m%s\x1b[0m', 'Solution: Set QWEN_CODE_AUTH_USE=false in your .env file, or remove the default auth file.');
        }
      } catch (checkError) {
        // 忽略检查错误
      }
      
      // 加载每个账户
      for (const file of accountFiles) {
        try {
          const accountPath = path.join(this.qwenDir, file);
          const credentialsData = await fs.readFile(accountPath, 'utf8');
          const credentials = JSON.parse(credentialsData);
          
          // 从文件名提取账户ID
          const accountId = file.substring(
            QWEN_MULTI_ACCOUNT_PREFIX.length,
            file.length - QWEN_MULTI_ACCOUNT_SUFFIX.length
          );
          
          this.accounts.set(accountId, credentials);
        } catch (error) {
          console.warn(`Failed to load account from ${file}:`, error.message);
        }
      }
      
      return this.accounts;
    } catch (error) {
      console.warn('Failed to load multi-account credentials:', error.message);
      return this.accounts;
    }
  }

  async saveCredentials(credentials, accountId = null) {
    try {
      // 保存前清理凭证 - 确保敏感数据得到正确处理
      const sanitizedCredentials = { ...credentials };
      
      // 保存前验证凭证结构
      if (!sanitizedCredentials.access_token || !sanitizedCredentials.refresh_token || !sanitizedCredentials.expiry_date) {
        throw new Error('Incomplete credentials data');
      }
      
      // 确保文件权限安全
      const credString = JSON.stringify(sanitizedCredentials, null, 2);
      
      let filePath;
      if (accountId) {
        // 保存到特定账户文件
        const accountFilename = `${QWEN_MULTI_ACCOUNT_PREFIX}${accountId}${QWEN_MULTI_ACCOUNT_SUFFIX}`;
        filePath = path.join(this.qwenDir, accountFilename);
        await fs.writeFile(filePath, credString);
        
        // 更新账户映射
        this.accounts.set(accountId, sanitizedCredentials);
      } else {
        // 保存到默认凭证文件
        filePath = this.credentialsPath;
        await fs.writeFile(filePath, credString);
        this.credentials = sanitizedCredentials;
      }
      
      // 确保证据文件具有安全权限（仅所有者可读写）
      try {
        await fs.chmod(filePath, 0o600); // Only owner can read/write
      } catch (chmodError) {
        console.warn('Could not set secure file permissions:', chmodError.message);
      }
    } catch (error) {
      console.error('Error saving credentials:', error.message);
      throw error; // Re-throw to handle properly in calling function
    }
  }

  isTokenValid(credentials) {
    if (!credentials || !credentials.access_token || !credentials.expiry_date) {
      return false;
    }
    
    // 通过验证结构检查token是否被篡改
    if (typeof credentials.access_token !== 'string' || credentials.access_token.length === 0) {
      console.warn('Invalid access token format');
      return false;
    }
    
    // 检查过期日期是否有效
    if (isNaN(credentials.expiry_date) || credentials.expiry_date <= 0) {
      console.warn('Invalid expiry date');
      return false;
    }
    
    // 检查token是否已过期或即将过期
    return Date.now() < credentials.expiry_date - TOKEN_REFRESH_BUFFER_MS;
  }

  /**
   * Get a list of all account IDs
   * @returns {string[]} Array of account IDs
   */
  getAccountIds() {
    return Array.from(this.accounts.keys());
  }

  /**
   * Get credentials for a specific account
   * @param {string} accountId - The account ID
   * @returns {Object|null} The credentials or null if not found
   */
  getAccountCredentials(accountId) {
    return this.accounts.get(accountId) || null;
  }

  /**
   * Add a new account
   * @param {Object} credentials - The account credentials
   * @param {string} accountId - The account ID
   */
  async addAccount(credentials, accountId) {
    await this.saveCredentials(credentials, accountId);
  }

  /**
   * Remove an account
   * @param {string} accountId - The account ID to remove
   */
  async removeAccount(accountId) {
    try {
      const accountFilename = `${QWEN_MULTI_ACCOUNT_PREFIX}${accountId}${QWEN_MULTI_ACCOUNT_SUFFIX}`;
      const accountPath = path.join(this.qwenDir, accountFilename);
      
      // 删除文件
      await fs.unlink(accountPath);
      
      // 从账户映射中删除
      this.accounts.delete(accountId);
      
      console.log(`Account ${accountId} removed successfully`);
    } catch (error) {
      console.error(`Error removing account ${accountId}:`, error.message);
      throw error;
    }
  }

  async refreshAccessToken(credentials) {
    console.log('\x1b[33m%s\x1b[0m', 'Refreshing Qwen access token...');
    
    if (!credentials || !credentials.refresh_token) {
      throw new Error('No refresh token available. Please re-authenticate with the Qwen CLI.');
    }

    const bodyData = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refresh_token,
      client_id: QWEN_OAUTH_CLIENT_ID,
    });

    try {
      const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: bodyData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Token refresh failed: ${errorData.error} - ${errorData.error_description}`);
      }

      const tokenData = await response.json();
      const newCredentials = {
        ...credentials,
        access_token: tokenData.access_token,
        token_type: tokenData.token_type,
        refresh_token: tokenData.refresh_token || credentials.refresh_token,
        resource_url: tokenData.resource_url || credentials.resource_url, // Preserve or update resource_url
        expiry_date: Date.now() + tokenData.expires_in * 1000,
      }

      await this.saveCredentials(newCredentials);
      console.log('\x1b[32m%s\x1b[0m', 'Qwen access token refreshed successfully');
      return newCredentials;
    } catch (error) {
      console.error('\x1b[31m%s\x1b[0m', 'Failed to refresh Qwen access token');
      // 如果刷新失败，用户可能需要重新认证。
      throw new Error('Failed to refresh access token. Please re-authenticate with the Qwen CLI.');
    }
  }

  async getValidAccessToken(accountId = null) {
    // 如果已有刷新正在进行，等待其完成
    if (this.refreshPromise) {
      console.log('\x1b[36m%s\x1b[0m', 'Waiting for ongoing token refresh...');
      return this.refreshPromise;
    }

    try {
      let credentials;
      
      if (accountId) {
        // 获取特定账户的凭证
        credentials = this.getAccountCredentials(accountId);
        if (!credentials) {
          // 如果尚未加载，则加载所有账户
          await this.loadAllAccounts();
          credentials = this.getAccountCredentials(accountId);
        }
      } else {
        // 使用默认凭证
        credentials = await this.loadCredentials();
      }

      if (!credentials) {
        if (accountId) {
          throw new Error(`No credentials found for account ${accountId}. Please authenticate this account first.`);
        } else {
          throw new Error('No credentials found. Please authenticate with Qwen CLI first.');
        }
      }

      // 检查token是否有效
      if (this.isTokenValid(credentials)) {
        console.log(accountId ? 
          `\x1b[32m%s\x1b[0m` : 
          '\x1b[32m%s\x1b[0m', 
          accountId ? 
          `Using valid Qwen access token for account ${accountId}` : 
          'Using valid Qwen access token');
        return credentials.access_token;
      } else {
        console.log(accountId ? 
          `\x1b[33m%s\x1b[0m` : 
          '\x1b[33m%s\x1b[0m', 
          accountId ? 
          `Qwen access token for account ${accountId} expired or expiring soon, refreshing...` : 
          'Qwen access token expired or expiring soon, refreshing...');
      }

      // Token需要刷新，开始刷新操作
      this.refreshPromise = this.performTokenRefresh(credentials, accountId);
      
      try {
        const newCredentials = await this.refreshPromise;
        return newCredentials.access_token;
      } finally {
        this.refreshPromise = null;
      }
    } catch (error) {
      this.refreshPromise = null;
      throw error;
    }
  }

  async performTokenRefresh(credentials, accountId = null) {
    try {
      const newCredentials = await this.refreshAccessToken(credentials);
      
      // 保存到适当的账户
      if (accountId) {
        await this.saveCredentials(newCredentials, accountId);
      } else {
        await this.saveCredentials(newCredentials);
      }
      
      return newCredentials;
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the next available account for rotation
   * @returns {Object|null} Object with {accountId, credentials} or null if no accounts available
   */
  async getNextAccount() {
    // 如果尚未加载，则加载所有账户
    if (this.accounts.size === 0) {
      await this.loadAllAccounts();
    }
    
    const accountIds = this.getAccountIds();
    
    if (accountIds.length === 0) {
      return null;
    }
    
    // 使用轮询选择
    const accountId = accountIds[this.currentAccountIndex];
    const credentials = this.getAccountCredentials(accountId);
    
    // 更新索引以供下次调用
    this.currentAccountIndex = (this.currentAccountIndex + 1) % accountIds.length;
    
    return { accountId, credentials };
  }

  /**
   * Peek at the next account without consuming it
   * @returns {Object|null} Object with {accountId, credentials} or null if no accounts available
   */
  peekNextAccount() {
    // 如果尚未加载，则加载所有账户
    if (this.accounts.size === 0) {
      // 注意：这是一个同步方法，所以我们不能在这里加载账户
      // 在调用此方法之前，账户应该已经加载
      return null;
    }
    
    const accountIds = this.getAccountIds();
    
    if (accountIds.length === 0) {
      return null;
    }
    
    // 使用轮询选择 without updating index
    const accountId = accountIds[this.currentAccountIndex];
    const credentials = this.getAccountCredentials(accountId);
    
    return { accountId, credentials };
  }

  /**
   * Check if an account has valid credentials
   * @param {string} accountId - The account ID
   * @returns {boolean} True if the account has valid credentials
   */
  isAccountValid(accountId) {
    const credentials = this.getAccountCredentials(accountId);
    return credentials && this.isTokenValid(credentials);
  }

  async initiateDeviceFlow() {
    // 生成PKCE代码验证器和挑战
    const { code_verifier, code_challenge } = generatePKCEPair();

    const bodyData = new URLSearchParams({
      client_id: QWEN_OAUTH_CLIENT_ID,
      scope: QWEN_OAUTH_SCOPE,
      code_challenge: code_challenge,
      code_challenge_method: 'S256',
    });

    try {
      const response = await fetch(QWEN_OAUTH_DEVICE_CODE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: bodyData,
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Device authorization failed: ${response.status} ${response.statusText}. Response: ${errorData}`);
      }

      const result = await response.json();
      
      // 检查响应是否表示成功
      if (!result.device_code) {
        throw new Error(`Device authorization failed: ${result.error || 'Unknown error'} - ${result.error_description || 'No details provided'}`);
      }

      // 将code_verifier添加到结果中，以便稍后用于轮询
      return {
        ...result,
        code_verifier: code_verifier
      };
    } catch (error) {
      console.error('Device authorization flow failed:', error.message);
      throw error;
    }
  }

  async pollForToken(device_code, code_verifier, accountId = null) {
    let pollInterval = 5000; // 5 seconds
    const maxAttempts = 60; // 5 minutes max

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const bodyData = new URLSearchParams({
        grant_type: QWEN_OAUTH_GRANT_TYPE,
        client_id: QWEN_OAUTH_CLIENT_ID,
        device_code: device_code,
        code_verifier: code_verifier,
      });

      try {
        const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: bodyData,
        });

        if (!response.ok) {
          // 将响应解析为JSON以检查OAuth RFC 8628标准错误
          try {
            const errorData = await response.json();

            // 根据OAuth RFC 8628，处理标准轮询响应
            if (response.status === 400 && errorData.error === 'authorization_pending') {
              // 用户尚未批准授权请求。继续轮询。
              console.log(`Polling attempt ${attempt + 1}/${maxAttempts}...`);
              await new Promise(resolve => setTimeout(resolve, pollInterval));
              continue;
            }

            if (response.status === 400 && errorData.error === 'slow_down') {
              // 客户端轮询过于频繁。增加轮询间隔。
              pollInterval = Math.min(pollInterval * 1.5, 10000); // Increase by 50%, max 10 seconds
              console.log(`Server requested to slow down, increasing poll interval to ${pollInterval}ms`);
              await new Promise(resolve => setTimeout(resolve, pollInterval));
              continue;
            }

            if (response.status === 400 && errorData.error === 'expired_token') {
              throw new Error('Device code expired. Please restart the authentication process.');
            }

            if (response.status === 400 && errorData.error === 'access_denied') {
              throw new Error('Authorization denied by user. Please restart the authentication process.');
            }

            // 对于其他错误，抛出带有适当错误信息的异常
            throw new Error(`Device token poll failed: ${errorData.error || 'Unknown error'} - ${errorData.error_description || 'No details provided'}`);
          } catch (_parseError) {
            // 如果JSON解析失败，回退到文本响应
            const errorData = await response.text();
            throw new Error(`Device token poll failed: ${response.status} ${response.statusText}. Response: ${errorData}`);
          }
        }

        const tokenData = await response.json();
        
        // 转换为QwenCredentials格式并保存
        const credentials = {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || undefined,
          token_type: tokenData.token_type,
          resource_url: tokenData.resource_url || tokenData.endpoint, // Include resource_url if provided
          expiry_date: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
        };

        await this.saveCredentials(credentials, accountId);
        
        return credentials;
      } catch (error) {
        // 处理特定错误情况
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // 如果我们遇到应该停止轮询的特定OAuth错误，则抛出该错误
        if (errorMessage.includes('expired_token') || 
            errorMessage.includes('access_denied') || 
            errorMessage.includes('Device authorization failed')) {
          throw error;
        }
        
        // 对于其他错误，继续轮询
        console.log(`Polling attempt ${attempt + 1}/${maxAttempts} failed:`, errorMessage);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error('Authentication timeout. Please restart the authentication process.');
  }
}

module.exports = { QwenAuthManager };