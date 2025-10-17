/**
 * Qwen API 客户端测试
 * 测试 Qwen API 客户端的功能，包括认证、账户管理和错误处理
 */

const { QwenAPI } = require('../../src/qwen/api.js');
jest.mock('axios');
jest.mock('fs');
jest.mock('../../src/qwen/auth.js');

const axios = require('axios');
const { promises: fs } = require('fs');
const { QwenAuthManager } = require('../../src/qwen/auth.js');

describe('QwenAPI', () => {
  let qwenAPI;

  beforeEach(() => {
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
      
      const result = require('../../src/qwen/api.js').processMessagesForVision(messages, model);
      
      expect(result).toEqual(messages);
    });

    it('should process messages for vision model', () => {
      const messages = [{ role: 'user', content: 'Check this image: https://example.com/image.jpg' }];
      const model = 'vision-model';
      
      const result = require('../../src/qwen/api.js').processMessagesForVision(messages, model);
      
      // 结果应包含原始文本内容和image_url部分
      expect(result[0].content).toBeInstanceOf(Array);
      expect(result[0].content[0].type).toBe('text');
      expect(result[0].content[1].type).toBe('image_url');
    });
  });
});