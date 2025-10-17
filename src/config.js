/**
 * 服务器配置
 * 处理环境变量验证、默认值和配置验证
 */

// src/config.js
require('dotenv').config();

const Joi = require('joi');
const { ConfigVersionManager } = require('./utils/configVersionManager.js');

// 初始化版本管理器
const versionManager = new ConfigVersionManager();

// 为配置定义验证模式
const configSchema = Joi.object({
  // 服务器配置
  port: Joi.number().port().default(8765),
  host: Joi.string().default('0.0.0.0'),
  
  // 流式传输配置
  stream: Joi.boolean().default(false),
  
  // Qwen OAuth配置
  qwen: Joi.object({
    clientId: Joi.string().max(200).default('f0304373b74a44d2b584a3fb70ca9e56'),
    clientSecret: Joi.string().max(200).default(''),
    baseUrl: Joi.string().uri().max(200).default('https://chat.qwen.ai'),
    deviceCodeEndpoint: Joi.string().uri().max(300).default('https://chat.qwen.ai/api/v1/oauth2/device/code'),
    tokenEndpoint: Joi.string().uri().max(300).default('https://chat.qwen.ai/api/v1/oauth2/token'),
    scope: Joi.string().max(200).default('openid profile email model.completion')
  }).default(),
  
  // 默认模型
  defaultModel: Joi.string().max(100).default('qwen3-coder-plus'),
  
  // Token刷新缓冲区（毫秒）
  tokenRefreshBuffer: Joi.number().integer().min(1000).max(300000).default(30000), // 1秒到5分钟之间
  
  // 首先使用的默认账户（如果可用）
  defaultAccount: Joi.string().max(100).allow('').default(''),
  
  // Qwen Code认证使用
  qwenCodeAuthUse: Joi.boolean().default(true),
  
  // 调试日志配置
  debugLog: Joi.boolean().default(false),
  logFileLimit: Joi.number().integer().min(1).max(1000).default(20),
  
  // 配置版本（由ConfigVersionManager管理）
  version: Joi.string().default(versionManager.getCurrentVersion())
});

// 从环境变量获取原始配置值
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

// 如果可用，从环境变量添加版本
if (process.env.CONFIG_VERSION) {
  rawConfig.version = process.env.CONFIG_VERSION;
}

// 验证配置
const { error, value: validatedConfig } = configSchema.validate(rawConfig, { 
  stripUnknown: true,
  convert: true,
  allowUnknown: true
});

if (error) {
  console.error('配置验证错误:', error.details[0].message);
  process.exit(1);
}

// 应用任何必要的配置迁移
const migratedConfig = versionManager.migrateConfig(validatedConfig);

// 验证最终配置
const validationResult = versionManager.validateConfig(migratedConfig);
if (!validationResult.valid) {
  console.error('迁移后配置验证失败:', validationResult.errors);
  process.exit(1);
}

// 解析后的附加验证
if (migratedConfig.port < 1 || migratedConfig.port > 65535) {
  console.error('无效的端口配置：必须在1到65535之间');
  process.exit(1);
}

if (migratedConfig.logFileLimit < 1) {
  console.error('无效的LOG_FILE_LIMIT：必须至少为1');
  process.exit(1);
}

console.log(`配置验证成功。服务器将在 ${migratedConfig.host}:${migratedConfig.port} 上运行`);
console.log(`配置版本: ${migratedConfig.version}`);

module.exports = migratedConfig;