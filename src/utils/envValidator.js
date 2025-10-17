/**
 * 环境验证工具
 * 在启动时验证所有必需的环境变量
 */

/**
 * 环境验证工具
 * 在启动时验证所有必需的环境变量
 */

const requiredEnvVars = [
  // 在这里添加任何真正必需的环境变量
  // 对于此代理，大多数配置值都有默认值，所以我们不需要必需的环境变量
];

const allowedEnvVars = [
  'PORT',
  'HOST',
  'STREAM',
  'QWEN_CLIENT_ID',
  'QWEN_CLIENT_SECRET',
  'QWEN_BASE_URL',
  'QWEN_DEVICE_CODE_ENDPOINT',
  'QWEN_TOKEN_ENDPOINT',
  'QWEN_SCOPE',
  'DEFAULT_MODEL',
  'TOKEN_REFRESH_BUFFER',
  'DEFAULT_ACCOUNT',
  'QWEN_CODE_AUTH_USE',
  'DEBUG_LOG',
  'LOG_FILE_LIMIT',
  'NODE_ENV',
  'HOSTNAME'
];

function validateEnvironment() {
  // 检查缺失的必需环境变量
  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missingEnvVars.length > 0) {
    console.error('缺少必需的环境变量:', missingEnvVars.join(', '));
    process.exit(1);
  }

  // 验证环境变量格式
  // PORT 应该是数字
  if (process.env.PORT && isNaN(parseInt(process.env.PORT, 10))) {
    console.error('PORT 环境变量必须是数字');
    process.exit(1);
  }

  // LOG_FILE_LIMIT 应该是数字
  if (process.env.LOG_FILE_LIMIT && isNaN(parseInt(process.env.LOG_FILE_LIMIT, 10))) {
    console.error('LOG_FILE_LIMIT 环境变量必须是数字');
    process.exit(1);
  }

  // TOKEN_REFRESH_BUFFER 应该是数字
  if (process.env.TOKEN_REFRESH_BUFFER && isNaN(parseInt(process.env.TOKEN_REFRESH_BUFFER, 10))) {
    console.error('TOKEN_REFRESH_BUFFER 环境变量必须是数字');
    process.exit(1);
  }

  // 检查生产环境中不在允许列表中的环境变量
  if (process.env.NODE_ENV === 'production') {
    const allEnvVars = Object.keys(process.env);
    const unexpectedEnvVars = allEnvVars.filter(envVar => 
      !allowedEnvVars.includes(envVar) && !envVar.startsWith('npm_') && !envVar.startsWith('yarn_') && !envVar.startsWith('_')
    );
    
    if (unexpectedEnvVars.length > 0) {
      console.warn('生产环境中的意外环境变量:', unexpectedEnvVars.join(', '));
    }
  }

  // 验证布尔环境变量
  const booleanEnvVars = ['STREAM', 'DEBUG_LOG', 'QWEN_CODE_AUTH_USE'];
  for (const envVar of booleanEnvVars) {
    if (process.env[envVar] && !['true', 'false', '1', '0', ''].includes(process.env[envVar].toLowerCase())) {
      console.warn(`警告: ${envVar} 环境变量有意外的值: ${process.env[envVar]}。期望值: 'true', 'false', '1', '0', 或空。`);
    }
  }

  console.log('环境验证通过');
}

module.exports = { validateEnvironment };