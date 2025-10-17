/**
 * 环境验证工具测试
 * 测试环境变量验证功能是否正常
 */

const { validateEnvironment } = require('../envValidator.js');

// Store original process.exit and process.env
const originalExit = process.exit;
const originalEnv = { ...process.env }; // Create a copy to avoid affecting other tests

describe('EnvValidator', () => {
  let exitSpy;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit: ${code}`);
    });
    process.env = { ...originalEnv }; // Create a copy to avoid affecting other tests
  });

  afterEach(() => {
    process.env = originalEnv; // Restore original environment
    exitSpy.mockRestore();
  });

  describe('validateEnvironment', () => {
    it('should pass with default environment', () => {
      // Should not throw an error with default environment
      expect(() => validateEnvironment()).not.toThrow();
    });

    it('should handle valid PORT value', () => {
      process.env.PORT = '8080';
      expect(() => validateEnvironment()).not.toThrow();
    });

    it('should fail with invalid PORT value', () => {
      process.env.PORT = 'invalid';
      expect(() => validateEnvironment()).toThrow('process.exit: 1');
    });

    it('should handle valid LOG_FILE_LIMIT value', () => {
      process.env.LOG_FILE_LIMIT = '100';
      expect(() => validateEnvironment()).not.toThrow();
    });

    it('should fail with invalid LOG_FILE_LIMIT value', () => {
      process.env.LOG_FILE_LIMIT = 'invalid';
      expect(() => validateEnvironment()).toThrow('process.exit: 1');
    });

    it('should handle valid TOKEN_REFRESH_BUFFER value', () => {
      process.env.TOKEN_REFRESH_BUFFER = '60000';
      expect(() => validateEnvironment()).not.toThrow();
    });

    it('should fail with invalid TOKEN_REFRESH_BUFFER value', () => {
      process.env.TOKEN_REFRESH_BUFFER = 'invalid';
      expect(() => validateEnvironment()).toThrow('process.exit: 1');
    });

    it('should handle valid boolean environment variables', () => {
      process.env.STREAM = 'true';
      process.env.DEBUG_LOG = 'false';
      process.env.QWEN_CODE_AUTH_USE = '1';
      expect(() => validateEnvironment()).not.toThrow();
    });
  });
});