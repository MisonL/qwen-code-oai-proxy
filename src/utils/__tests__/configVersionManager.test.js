/**
 * 配置版本管理工具测试
 * 测试配置版本管理功能是否正常
 */

const { ConfigVersionManager } = require('../configVersionManager.js');

describe('ConfigVersionManager', () => {
  let versionManager;

  beforeEach(() => {
    versionManager = new ConfigVersionManager();
  });

  describe('constructor', () => {
    it('should initialize with default version', () => {
      expect(versionManager.getCurrentVersion()).toBeDefined();
      expect(typeof versionManager.getCurrentVersion()).toBe('string');
    });
  });

  describe('getCurrentVersion', () => {
    it('should return the current configuration version', () => {
      const version = versionManager.getCurrentVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+$/); // Semantic versioning format
    });
  });

  describe('validateConfig', () => {
    it('should validate a correctly formatted config', () => {
      const validConfig = {
        version: versionManager.getCurrentVersion(),
        port: 8765,
        host: 'localhost',
        stream: false,
        qwen: {
          clientId: 'test-client-id',
          clientSecret: 'test-secret',
          baseUrl: 'https://test.com',
          deviceCodeEndpoint: 'https://test.com/device',
          tokenEndpoint: 'https://test.com/token',
          scope: 'test-scope'
        },
        defaultModel: 'test-model',
        tokenRefreshBuffer: 30000,
        defaultAccount: '',
        qwenCodeAuthUse: true,
        debugLog: false,
        logFileLimit: 10
      };
      
      const result = versionManager.validateConfig(validConfig);
      expect(result.valid).toBe(true);
    });

    it('should return errors for invalid config', () => {
      const invalidConfig = {
        version: '0.0.0', // Different version
        // Missing required properties
      };
      
      const result = versionManager.validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
    });

    it('should handle config without version', () => {
      const configWithoutVersion = {
        // No version property
      };
      
      const result = versionManager.validateConfig(configWithoutVersion);
      expect(result.valid).toBe(false);
      expect(result.warnings).toContain('未指定配置版本，假设为当前版本');
    });
  });

  describe('hasProperty', () => {
    it('should check for nested properties correctly', () => {
      const obj = {
        level1: {
          level2: 'value'
        }
      };
      
      expect(versionManager.hasProperty(obj, 'level1.level2')).toBe(true);
      expect(versionManager.hasProperty(obj, 'level1.nonexistent')).toBe(false);
      expect(versionManager.hasProperty(obj, 'nonexistent')).toBe(false);
    });
  });

  describe('migrateConfig', () => {
    it('should migrate legacy config without version', () => {
      const legacyConfig = {
        // No version property
        host: 'localhost',
        port: 8080
      };
      
      const migratedConfig = versionManager.migrateConfig(legacyConfig);
      
      // Check if default migrations were applied
      expect(migratedConfig.host).toBe('0.0.0.0'); // Should migrate localhost to 0.0.0.0
      expect(migratedConfig.port).toBe(8765); // Should migrate 8080 to 8765
      expect(migratedConfig.version).toBe(versionManager.getCurrentVersion());
    });

    it('should not modify newer config versions', () => {
      const newerConfig = {
        version: versionManager.getCurrentVersion(),
        host: 'localhost',
        port: 8080
      };
      
      const migratedConfig = versionManager.migrateConfig(newerConfig);
      
      // Values should remain unchanged since version matches
      expect(migratedConfig.host).toBe('localhost');
      expect(migratedConfig.port).toBe(8080);
      expect(migratedConfig.version).toBe(versionManager.getCurrentVersion());
    });
  });

  describe('applyMigrations', () => {
    it('should apply necessary migrations to config', () => {
      const config = {
        host: 'localhost',
        port: 8080
      };
      
      const migrated = versionManager.applyMigrations(config, '0.0.0');
      
      expect(migrated.host).toBe('0.0.0.0');
      expect(migrated.port).toBe(8765);
      expect(migrated.version).toBe(versionManager.getCurrentVersion());
    });
  });
});