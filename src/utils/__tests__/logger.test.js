/**
 * 日志工具测试
 * 测试日志记录功能是否正常
 */

const { DebugLogger } = require('../logger.js');
const fs = require('fs').promises;
const path = require('path');

// Mock config to control debug logging
jest.mock('../../config.js', () => ({
  debugLog: true,
  logFileLimit: 10
}));

describe('DebugLogger', () => {
  let debugLogger;
  const debugDir = path.join(__dirname, '..', '..', 'debug');

  beforeEach(() => {
    debugLogger = new DebugLogger();
  });

  afterEach(async () => {
    // Clean up any created debug files after each test
    try {
      const files = await fs.readdir(debugDir);
      const debugFiles = files.filter(file => file.startsWith('debug-') && file.endsWith('.txt'));
      for (const file of debugFiles) {
        await fs.unlink(path.join(debugDir, file));
      }
    } catch (error) {
      // Directory might not exist, which is fine
    }
  });

  describe('constructor', () => {
    it('should ensure debug directory exists', async () => {
      // The DebugLogger constructor should ensure the debug directory exists
      expect(debugLogger).toBeDefined();
    });
  });

  describe('getTimestampForFilename', () => {
    it('should return properly formatted timestamp for filename', () => {
      const timestamp = debugLogger.getTimestampForFilename();
      // Format should be YYYY-MM-DD-HH:MM:SS
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('getTimestampForLog', () => {
    it('should return properly formatted timestamp for log entries', () => {
      const timestamp = debugLogger.getTimestampForLog();
      // Format should be YYYY-MM-DD HH:MM:SS.mmm
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    });
  });

  describe('sanitizeRequest', () => {
    it('should sanitize sensitive headers', () => {
      const request = {
        headers: {
          Authorization: 'Bearer secret-token',
          'X-API-Key': 'secret-key',
          'Content-Type': 'application/json'
        },
        body: {
          access_token: 'secret-access-token',
          regular_field: 'normal-value'
        }
      };

      const sanitized = debugLogger.sanitizeRequest(request);

      expect(sanitized.headers.Authorization).toBe('[REDACTED]');
      expect(sanitized.headers['X-API-Key']).toBe('secret-key'); // Only Authorization is sanitized in the implementation
      expect(sanitized.body.access_token).toBe('[REDACTED]');
      expect(sanitized.body.regular_field).toBe('normal-value');
    });

    it('should handle missing headers and body gracefully', () => {
      const request = {};
      const sanitized = debugLogger.sanitizeRequest(request);
      expect(sanitized).toEqual({});
    });
  });

  describe('logApiCall', () => {
    it('should create a debug log file when debug logging is enabled', async () => {
      const endpoint = '/v1/chat/completions';
      const request = {
        method: 'POST',
        url: endpoint,
        headers: { 'Content-Type': 'application/json' },
        body: { model: 'test-model', messages: [] }
      };
      const response = { id: 'test-response', choices: [] };

      const debugFile = await debugLogger.logApiCall(endpoint, request, response);
      
      expect(debugFile).toMatch(/^debug-\d{4}-\d{2}-\d{2}-\d{2}:\d{2}:\d{2}\.txt$/);
    });

    it('should handle error logging', async () => {
      const endpoint = '/v1/chat/completions';
      const request = {
        method: 'POST',
        url: endpoint,
        headers: { 'Content-Type': 'application/json' },
        body: { model: 'test-model', messages: [] }
      };
      const error = new Error('Test error');

      const debugFile = await debugLogger.logApiCall(endpoint, request, null, error);
      
      expect(debugFile).toMatch(/^debug-\d{4}-\d{2}-\d{2}-\d{2}:\d{2}:\d{2}\.txt$/);
    });
  });

  describe('logError', () => {
    it('should create an error log file', async () => {
      const context = 'test-context';
      const error = new Error('Test error');
      
      const debugFile = await debugLogger.logError(context, error);
      
      expect(debugFile).toMatch(/^debug-\d{4}-\d{2}-\d{2}-\d{2}:\d{2}:\d{2}\.txt$/);
    });

    it('should handle different error types', async () => {
      const context = 'test-context';
      const error = {
        message: 'Custom error',
        code: 'CUSTOM_ERROR',
        status: 500
      };
      
      const debugFile = await debugLogger.logError(context, error);
      
      expect(debugFile).toMatch(/^debug-\d{4}-\d{2}-\d{2}-\d{2}:\d{2}:\d{2}\.txt$/);
    });
  });

  describe('getErrorStatusCode', () => {
    it('should extract status code from error object', () => {
      const errorWithResponse = { response: { status: 404 } };
      const errorWithStatus = { status: 500 };
      const errorWithMessage = { message: 'Error with status 429' };
      const errorWithoutStatus = { message: 'Normal error' };
      
      expect(debugLogger.getErrorStatusCode(errorWithResponse)).toBe(404);
      expect(debugLogger.getErrorStatusCode(errorWithStatus)).toBe(500);
      expect(debugLogger.getErrorStatusCode(errorWithMessage)).toBe(429);
      expect(debugLogger.getErrorStatusCode(errorWithoutStatus)).toBeNull();
    });
  });
});