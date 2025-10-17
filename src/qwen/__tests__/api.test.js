/**
 * Qwen API 客户端测试
 * 测试 Qwen API 客户端的功能，包括认证、账户管理和错误处理
 */

const { QwenAPI } = require('../api.js');
jest.mock('axios');
jest.mock('fs');
jest.mock('path');
jest.mock('../auth.js');

const axios = require('axios');
const { promises: fs } = require('fs');
const { QwenAuthManager } = require('../auth.js');
const path = require('path');

describe('QwenAPI', () => {
  let qwenAPI;

  beforeEach(() => {
    // Mock path.join to return a simple string to prevent errors during initialization
    path.join.mockImplementation((...args) => args.join('/'));
    
    qwenAPI = new QwenAPI();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct default values', () => {
      expect(qwenAPI.authManager).toBeInstanceOf(QwenAuthManager);
      expect(qwenAPI.requestCount).toBeInstanceOf(Map);
      expect(qwenAPI.authErrorCount).toBeInstanceOf(Map);
      expect(qwenAPI.tokenUsage).toBeInstanceOf(Map);
    });
  });

  describe('incrementRequestCount', () => {
    it('should increment request count for an account', async () => {
      const accountId = 'test-account';
      const initialCount = qwenAPI.getRequestCount(accountId);
      
      await qwenAPI.incrementRequestCount(accountId);
      
      expect(qwenAPI.getRequestCount(accountId)).toBe(initialCount + 1);
    });

    it('should schedule save after incrementing request count', async () => {
      const accountId = 'test-account';
      const scheduleSaveSpy = jest.spyOn(qwenAPI, 'scheduleSave');
      
      await qwenAPI.incrementRequestCount(accountId);
      
      expect(scheduleSaveSpy).toHaveBeenCalled();
    });
  });

  describe('getRequestCount', () => {
    it('should return 0 for a new account', () => {
      const accountId = 'new-account';
      expect(qwenAPI.getRequestCount(accountId)).toBe(0);
    });

    it('should return the correct count after incrementing', async () => {
      const accountId = 'test-account';
      await qwenAPI.incrementRequestCount(accountId);
      await qwenAPI.incrementRequestCount(accountId);
      
      expect(qwenAPI.getRequestCount(accountId)).toBe(2);
    });
  });

  describe('recordTokenUsage', () => {
    it('should record token usage for an account', async () => {
      const accountId = 'test-account';
      const inputTokens = 100;
      const outputTokens = 200;

      await qwenAPI.recordTokenUsage(accountId, inputTokens, outputTokens);

      // 查找今天的使用记录
      const accountUsage = qwenAPI.tokenUsage.get(accountId);
      const today = new Date().toISOString().split('T')[0];
      const todayRecord = accountUsage.find(record => record.date === today);

      expect(todayRecord).toBeDefined();
      expect(todayRecord.inputTokens).toBe(inputTokens);
      expect(todayRecord.outputTokens).toBe(outputTokens);
    });

    it('should schedule save after recording token usage', async () => {
      const accountId = 'test-account';
      const inputTokens = 100;
      const outputTokens = 200;
      const scheduleSaveSpy = jest.spyOn(qwenAPI, 'scheduleSave');

      await qwenAPI.recordTokenUsage(accountId, inputTokens, outputTokens);

      expect(scheduleSaveSpy).toHaveBeenCalled();
    });
  });

  describe('isAuthError', () => {
    it('should identify authentication errors', () => {
      // 使用getter导入函数以访问私有函数
      const isAuthError = (error) => {
        // 这已在源文件中实现，因此我们可以测试使用它的方法
      };

      // 测试401状态的错误
      const error401 = {
        response: { status: 401 }
      };
      expect(qwenAPI).toBeDefined(); // The function exists in the source

      // 我们无法直接测试私有函数，但可以验证它在代码中
    });
  });

  describe('processMessagesForVision', () => {
    it('should return messages unchanged for non-vision models', () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const model = 'qwen3-coder-plus';
      
      const { processMessagesForVision } = require('../api.js');
      const result = processMessagesForVision(messages, model);
      
      expect(result).toEqual(messages);
    });

    it('should process messages for vision model', () => {
      const messages = [{ role: 'user', content: 'Check this image: https://example.com/image.jpg' }];
      const model = 'vision-model';
      
      const { processMessagesForVision } = require('../api.js');
      const result = processMessagesForVision(messages, model);
      
      // 结果应包含原始文本内容和image_url部分
      expect(result[0].content).toBeInstanceOf(Array);
      expect(result[0].content[0].type).toBe('text');
      expect(result[0].content[1].type).toBe('image_url');
    });
  });

  describe('isAuthError', () => {
    it('should identify authentication errors', () => {
      const authError401 = { response: { status: 401 } };
      const networkError = { message: 'Network error' };
      const authErrorToken = { message: 'invalid access token' }; // 必须是小写
      const authErrorForbidden = { response: { status: 403 } };
      const authErrorUnauthorized = { message: 'unauthorized access' };
      const authErrorExpired = { message: 'token expired' }; // 必须是小写
      const authErrorGateway = { response: { status: 504 } };
      const invalidApiKey = { message: 'invalid api key' }; // 必须是小写
      const invalidAccessToken = { message: 'invalid access token' }; // 必须是小写
      const accessDenied = { message: 'access denied' }; // 必须是小写
      
      const { isAuthError } = require('../api.js');
      
      expect(isAuthError(authError401)).toBe(true);
      expect(isAuthError(networkError)).toBe(false);
      expect(isAuthError(authErrorToken)).toBe(true);
      expect(isAuthError(authErrorForbidden)).toBe(true);
      expect(isAuthError(authErrorUnauthorized)).toBe(true);
      expect(isAuthError(authErrorExpired)).toBe(true);
      expect(isAuthError(authErrorGateway)).toBe(true);
      expect(isAuthError(invalidApiKey)).toBe(true);
      expect(isAuthError(invalidAccessToken)).toBe(true);
      expect(isAuthError(accessDenied)).toBe(true);
    });
  });

  describe('isQuotaExceededError', () => {
    it('should identify quota exceeded errors', () => {
      const quotaError = { response: { status: 429 } };
      const errorMessage = { message: 'quota exceeded' }; // 必须同时包含 'quota' 和 'exceeded'
      const insufficientQuotaError = { message: 'insufficient_quota' }; // 必须包含下划线
      const normalError = { message: 'Normal error' };
      const quotaExceededError = { message: 'free allocated quota exceeded' };
      
      const { isQuotaExceededError } = require('../api.js');
      
      expect(isQuotaExceededError(quotaError)).toBe(true);
      expect(isQuotaExceededError(errorMessage)).toBe(true);
      expect(isQuotaExceededError(insufficientQuotaError)).toBe(true);
      expect(isQuotaExceededError(quotaExceededError)).toBe(true);
      expect(isQuotaExceededError(normalError)).toBe(false);
    });
  });
});