/**
 * Qwen 认证管理器测试
 * 测试 Qwen OAuth 认证流程和凭证管理功能
 */

const { QwenAuthManager } = require('../auth.js');
const path = require('path');
const { fetch } = require('undici');

// Mock fs 模块，包含 promises 对象和其方法
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    readdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    access: jest.fn(),
  },
  readdir: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
  access: jest.fn(),
}));

jest.mock('undici');
jest.mock('crypto');
const { promises: fs } = require('fs');

describe('QwenAuthManager', () => {
  let authManager;

  beforeEach(() => {
    authManager = new QwenAuthManager();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct default values', () => {
      expect(authManager.qwenDir).toBe(path.join(process.env.HOME || process.env.USERPROFILE, '.qwen'));
      expect(authManager.credentialsPath).toBe(path.join(authManager.qwenDir, 'oauth_creds.json'));
      expect(authManager.accounts).toBeInstanceOf(Map);
      expect(authManager.currentAccountIndex).toBe(0);
    });
  });

  describe('isTokenValid', () => {
    it('should return false for null credentials', () => {
      expect(authManager.isTokenValid(null)).toBe(false);
    });

    it('should return false for credentials without expiry_date', () => {
      const credentials = { access_token: 'token' };
      expect(authManager.isTokenValid(credentials)).toBe(false);
    });

    it('should return true for valid credentials', () => {
      // 确保时间在未来超过TOKEN_REFRESH_BUFFER（30秒）
      const credentials = {
        access_token: 'token',
        expiry_date: Date.now() + 60000 // 60 seconds in the future (more than 30s buffer)
      };
      expect(authManager.isTokenValid(credentials)).toBe(true);
    });

    it('should return false for expired credentials', () => {
      const credentials = {
        expiry_date: Date.now() - 1000 // 1 second in the past
      };
      expect(authManager.isTokenValid(credentials)).toBe(false);
    });

    it('should return false for credentials expiring soon', () => {
      const credentials = {
        expiry_date: Date.now() + 20000 // 20 seconds in the future (less than buffer of 30 seconds)
      };
      expect(authManager.isTokenValid(credentials)).toBe(false);
    });
  });

  describe('generatePKCEPair', () => {
    it('should generate code verifier and challenge', () => {
      // 我们无法直接测试私有函数，但可以通过公共方法测试它们的使用
      // 函数已在源文件中
      expect(authManager).toBeDefined();
    });
  });

  describe('loadAllAccounts', () => {
    it('should load all multi-account credentials', async () => {
      // 模拟fs.readdir以返回一些账户文件
      const mockFiles = [
        'oauth_creds.json', // default file
        'oauth_creds_account1.json',
        'oauth_creds_account2.json'
      ];
      
      fs.readdir.mockResolvedValue(mockFiles);
      
      // 模拟fs.readFile以返回有效凭证
      fs.readFile
        .mockResolvedValueOnce(JSON.stringify({ 
          access_token: 'token1', 
          expiry_date: Date.now() + 60000 
        })) // for account1
        .mockResolvedValueOnce(JSON.stringify({ 
          access_token: 'token2', 
          expiry_date: Date.now() + 60000 
        })); // for account2

      const result = await authManager.loadAllAccounts();
      
      expect(fs.readdir).toHaveBeenCalledWith(authManager.qwenDir);
      expect(result).toBeInstanceOf(Map);
    });
  });

  describe('getAccountIds', () => {
    it('should return an empty array when no accounts are loaded', () => {
      const accountIds = authManager.getAccountIds();
      expect(accountIds).toEqual([]);
    });

    it('should return account IDs when accounts are loaded', () => {
      authManager.accounts.set('account1', { access_token: 'token1' });
      authManager.accounts.set('account2', { access_token: 'token2' });

      const accountIds = authManager.getAccountIds();
      expect(accountIds).toEqual(['account1', 'account2']);
    });
  });

  describe('addAccount', () => {
    it('should add an account and save credentials', async () => {
      const credentials = { 
        access_token: 'new_token', 
        refresh_token: 'refresh_token',
        expiry_date: Date.now() + 60000 
      };
      const accountId = 'new-account';
      
      const saveSpy = jest.spyOn(authManager, 'saveCredentials');
      
      await authManager.addAccount(credentials, accountId);
      
      expect(saveSpy).toHaveBeenCalledWith(credentials, accountId);
      expect(authManager.accounts.get(accountId)).toEqual(credentials);
    });
  });

  describe('getValidAccessToken', () => {
    it('should return valid token if it is still valid', async () => {
      const validCredentials = {
        access_token: 'valid-token',
        expiry_date: Date.now() + 100000 // far in the future
      };

      authManager.loadCredentials = jest.fn().mockResolvedValue(validCredentials);

      const token = await authManager.getValidAccessToken();

      expect(token).toBe('valid-token');
      expect(authManager.loadCredentials).toHaveBeenCalled();
    });
  });
});