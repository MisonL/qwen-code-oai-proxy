/**
 * 配置版本管理
 * 跟踪配置模式版本并处理迁移
 */

/**
 * 配置版本管理工具
 * 跟踪配置模式版本并处理迁移
 */

class ConfigVersionManager {
  constructor() {
    // 定义当前配置模式版本
    this.currentVersion = '1.0.0';
    
    // 定义用于版本跟踪的配置模式
    this.configSchema = {
      version: this.currentVersion,
      properties: [
        'port',
        'host', 
        'stream',
        'qwen.clientId',
        'qwen.clientSecret', 
        'qwen.baseUrl',
        'qwen.deviceCodeEndpoint',
        'qwen.tokenEndpoint', 
        'qwen.scope',
        'defaultModel',
        'tokenRefreshBuffer',
        'defaultAccount',
        'qwenCodeAuthUse',
        'debugLog', 
        'logFileLimit'
      ]
    };
  }

  /**
   * 获取当前配置版本
   */
  getCurrentVersion() {
    return this.currentVersion;
  }

  /**
   * 验证配置是否符合当前模式
   * @param {Object} config - 要验证的配置对象
   * @returns {Object} 包含有效标志和错误的验证结果
   */
  validateConfig(config) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    // 检查配置是否有版本属性
    if (!config.version) {
      result.warnings.push('未指定配置版本，假设为当前版本');
    } else if (config.version !== this.currentVersion) {
      result.errors.push(`配置版本不匹配。期望: ${this.currentVersion}, 实际: ${config.version}`);
      result.valid = false;
    }

    // 验证必需属性是否存在
    for (const prop of this.configSchema.properties) {
      if (!this.hasProperty(config, prop)) {
        result.errors.push(`缺少必需的配置属性: ${prop}`);
        result.valid = false;
      }
    }

    return result;
  }

  /**
   * 检查对象是否具有嵌套属性
   * @param {Object} obj - 要检查的对象
   * @param {string} path - 属性路径（例如 'qwen.clientId'）
   * @returns {boolean} 如果属性存在则为true
   */
  hasProperty(obj, path) {
    return path.split('.').reduce((current, prop) => {
      return current && current[prop] !== undefined ? current[prop] : undefined;
    }, obj) !== undefined;
  }

  /**
   * 从旧版本迁移到当前版本的配置
   * @param {Object} oldConfig - 旧的配置对象
   * @returns {Object} 迁移后的配置对象
   */
  migrateConfig(oldConfig) {
    // 如果没有指定版本，假设它是需要更新的旧配置
    if (!oldConfig.version) {
      console.log('正在迁移旧配置...');
      return this.applyMigrations(oldConfig, '0.0.0');
    }

    const oldVersion = oldConfig.version;
    if (oldVersion !== this.currentVersion) {
      console.log(`正在将配置从 ${oldVersion} 迁移到 ${this.currentVersion}...`);
      return this.applyMigrations(oldConfig, oldVersion);
    }

    return oldConfig;
  }

  /**
   * 应用必要的迁移来更新配置
   * @param {Object} config - 要迁移的配置
   * @param {string} fromVersion - 要迁移的版本
   * @returns {Object} 迁移后的配置
   */
  applyMigrations(config, fromVersion) {
    // 创建配置的副本以避免修改原始配置
    const migratedConfig = JSON.parse(JSON.stringify(config));

    // 示例迁移：将默认主机从 'localhost' 更新为 '0.0.0.0'
    if (migratedConfig.host === 'localhost') {
      migratedConfig.host = '0.0.0.0';
      console.log('将主机从localhost更新为0.0.0.0以获得更好的网络绑定');
    }

    // 示例迁移：将默认端口从8080更新为8765
    if (migratedConfig.port === 8080) {
      migratedConfig.port = 8765;
      console.log('将默认端口从8080更新为8765');
    }

    // 如果缺少版本属性则添加
    migratedConfig.version = this.currentVersion;

    return migratedConfig;
  }

  /**
   * 序列化配置并添加版本信息
   * @param {Object} config - 要序列化的配置
   * @returns {string} 带有版本信息的JSON字符串
   */
  serializeConfig(config) {
    const configWithVersion = {
      ...config,
      version: this.currentVersion,
      updatedAt: new Date().toISOString()
    };

    return JSON.stringify(configWithVersion, null, 2);
  }
}

module.exports = { ConfigVersionManager };