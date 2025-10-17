/**
 * Configuration version management
 * Tracks configuration schema versions and handles migrations
 */

class ConfigVersionManager {
  constructor() {
    // Define the current configuration schema version
    this.currentVersion = '1.0.0';
    
    // Define configuration schema for version tracking
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
   * Get the current configuration version
   */
  getCurrentVersion() {
    return this.currentVersion;
  }

  /**
   * Validate the configuration against the current schema
   * @param {Object} config - The configuration object to validate
   * @returns {Object} Validation result with valid flag and errors
   */
  validateConfig(config) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check if configuration has a version property
    if (!config.version) {
      result.warnings.push('Configuration version not specified, assuming current version');
    } else if (config.version !== this.currentVersion) {
      result.errors.push(`Configuration version mismatch. Expected: ${this.currentVersion}, Got: ${config.version}`);
      result.valid = false;
    }

    // Validate required properties exist
    for (const prop of this.configSchema.properties) {
      if (!this.hasProperty(config, prop)) {
        result.errors.push(`Missing required configuration property: ${prop}`);
        result.valid = false;
      }
    }

    return result;
  }

  /**
   * Check if an object has a nested property
   * @param {Object} obj - The object to check
   * @param {string} path - The property path (e.g. 'qwen.clientId')
   * @returns {boolean} True if the property exists
   */
  hasProperty(obj, path) {
    return path.split('.').reduce((current, prop) => {
      return current && current[prop] !== undefined ? current[prop] : undefined;
    }, obj) !== undefined;
  }

  /**
   * Migrate configuration from an older version to the current version
   * @param {Object} oldConfig - The old configuration object
   * @returns {Object} Migrated configuration object
   */
  migrateConfig(oldConfig) {
    // If no version is specified, assume it's an old config that needs updates
    if (!oldConfig.version) {
      console.log('Migrating legacy configuration...');
      return this.applyMigrations(oldConfig, '0.0.0');
    }

    const oldVersion = oldConfig.version;
    if (oldVersion !== this.currentVersion) {
      console.log(`Migrating configuration from ${oldVersion} to ${this.currentVersion}...`);
      return this.applyMigrations(oldConfig, oldVersion);
    }

    return oldConfig;
  }

  /**
   * Apply necessary migrations to update configuration
   * @param {Object} config - The configuration to migrate
   * @param {string} fromVersion - The version to migrate from
   * @returns {Object} Migrated configuration
   */
  applyMigrations(config, fromVersion) {
    // Create a copy of the config to avoid modifying the original
    const migratedConfig = JSON.parse(JSON.stringify(config));

    // Example migration: update default host from 'localhost' to '0.0.0.0'
    if (migratedConfig.host === 'localhost') {
      migratedConfig.host = '0.0.0.0';
      console.log('Updated host from localhost to 0.0.0.0 for better network binding');
    }

    // Example migration: update default port from 8080 to 8765
    if (migratedConfig.port === 8080) {
      migratedConfig.port = 8765;
      console.log('Updated default port from 8080 to 8765');
    }

    // Add version property if missing
    migratedConfig.version = this.currentVersion;

    return migratedConfig;
  }

  /**
   * Serialize configuration with version information
   * @param {Object} config - The configuration to serialize
   * @returns {string} JSON string with version information
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