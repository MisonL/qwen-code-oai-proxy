// src/config.js
require('dotenv').config();

const Joi = require('joi');
const { ConfigVersionManager } = require('./utils/configVersionManager.js');

// Initialize version manager
const versionManager = new ConfigVersionManager();

// Define validation schema for configuration
const configSchema = Joi.object({
  // Server configuration
  port: Joi.number().port().default(8765),
  host: Joi.string().default('0.0.0.0'),
  
  // Streaming configuration
  stream: Joi.boolean().default(false),
  
  // Qwen OAuth configuration
  qwen: Joi.object({
    clientId: Joi.string().max(200).default('f0304373b74a44d2b584a3fb70ca9e56'),
    clientSecret: Joi.string().max(200).default(''),
    baseUrl: Joi.string().uri().max(200).default('https://chat.qwen.ai'),
    deviceCodeEndpoint: Joi.string().uri().max(300).default('https://chat.qwen.ai/api/v1/oauth2/device/code'),
    tokenEndpoint: Joi.string().uri().max(300).default('https://chat.qwen.ai/api/v1/oauth2/token'),
    scope: Joi.string().max(200).default('openid profile email model.completion')
  }).default(),
  
  // Default model
  defaultModel: Joi.string().max(100).default('qwen3-coder-plus'),
  
  // Token refresh buffer (milliseconds)
  tokenRefreshBuffer: Joi.number().integer().min(1000).max(300000).default(30000), // Between 1s and 5min
  
  // Default account to use first (if available)
  defaultAccount: Joi.string().max(100).allow('').default(''),
  
  // Qwen Code authentication usage
  qwenCodeAuthUse: Joi.boolean().default(true),
  
  // Debug logging configuration
  debugLog: Joi.boolean().default(false),
  logFileLimit: Joi.number().integer().min(1).max(1000).default(20),
  
  // Configuration version (managed by ConfigVersionManager)
  version: Joi.string().default(versionManager.getCurrentVersion())
});

// Get raw config values from environment
const rawConfig = {
  port: parseInt(process.env.PORT, 10) || undefined,
  host: process.env.HOST,
  
  stream: process.env.STREAM === 'true',
  
  qwen: {
    clientId: process.env.QWEN_CLIENT_ID,
    clientSecret: process.env.QWEN_CLIENT_SECRET,
    baseUrl: process.env.QWEN_BASE_URL,
    deviceCodeEndpoint: process.env.QWEN_DEVICE_CODE_ENDPOINT,
    tokenEndpoint: process.env.QWEN_TOKEN_ENDPOINT,
    scope: process.env.QWEN_SCOPE
  },
  
  defaultModel: process.env.DEFAULT_MODEL,
  tokenRefreshBuffer: parseInt(process.env.TOKEN_REFRESH_BUFFER, 10) || undefined,
  defaultAccount: process.env.DEFAULT_ACCOUNT,
  qwenCodeAuthUse: process.env.QWEN_CODE_AUTH_USE !== 'false',
  debugLog: process.env.DEBUG_LOG === 'true',
  logFileLimit: parseInt(process.env.LOG_FILE_LIMIT, 10) || undefined
};

// Add version from environment if available
if (process.env.CONFIG_VERSION) {
  rawConfig.version = process.env.CONFIG_VERSION;
}

// Validate the configuration
const { error, value: validatedConfig } = configSchema.validate(rawConfig, { 
  stripUnknown: true,
  convert: true,
  allowUnknown: true
});

if (error) {
  console.error('Configuration validation error:', error.details[0].message);
  process.exit(1);
}

// Apply any necessary configuration migrations
const migratedConfig = versionManager.migrateConfig(validatedConfig);

// Validate the final configuration
const validationResult = versionManager.validateConfig(migratedConfig);
if (!validationResult.valid) {
  console.error('Configuration validation failed after migration:', validationResult.errors);
  process.exit(1);
}

// Additional validations after parsing
if (migratedConfig.port < 1 || migratedConfig.port > 65535) {
  console.error('Invalid port configuration: must be between 1 and 65535');
  process.exit(1);
}

if (migratedConfig.logFileLimit < 1) {
  console.error('Invalid LOG_FILE_LIMIT: must be at least 1');
  process.exit(1);
}

console.log(`Configuration validated successfully. Server will run on ${migratedConfig.host}:${migratedConfig.port}`);
console.log(`Configuration version: ${migratedConfig.version}`);

module.exports = migratedConfig;