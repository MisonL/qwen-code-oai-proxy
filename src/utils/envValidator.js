/**
 * Environment validation utility
 * Validates all required environment variables at startup
 */

const requiredEnvVars = [
  // Add any truly required environment variables here
  // For this proxy, most config values have defaults, so we don't require any
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
  // Check for missing required environment variables
  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars.join(', '));
    process.exit(1);
  }

  // Validate environment variable formats
  // PORT should be a number
  if (process.env.PORT && isNaN(parseInt(process.env.PORT, 10))) {
    console.error('PORT environment variable must be a number');
    process.exit(1);
  }

  // LOG_FILE_LIMIT should be a number
  if (process.env.LOG_FILE_LIMIT && isNaN(parseInt(process.env.LOG_FILE_LIMIT, 10))) {
    console.error('LOG_FILE_LIMIT environment variable must be a number');
    process.exit(1);
  }

  // TOKEN_REFRESH_BUFFER should be a number
  if (process.env.TOKEN_REFRESH_BUFFER && isNaN(parseInt(process.env.TOKEN_REFRESH_BUFFER, 10))) {
    console.error('TOKEN_REFRESH_BUFFER environment variable must be a number');
    process.exit(1);
  }

  // Check for any environment variables that aren't in the allowed list (in production)
  if (process.env.NODE_ENV === 'production') {
    const allEnvVars = Object.keys(process.env);
    const unexpectedEnvVars = allEnvVars.filter(envVar => 
      !allowedEnvVars.includes(envVar) && !envVar.startsWith('npm_') && !envVar.startsWith('yarn_') && !envVar.startsWith('_')
    );
    
    if (unexpectedEnvVars.length > 0) {
      console.warn('Unexpected environment variables in production:', unexpectedEnvVars.join(', '));
    }
  }

  // Validate boolean environment variables
  const booleanEnvVars = ['STREAM', 'DEBUG_LOG', 'QWEN_CODE_AUTH_USE'];
  for (const envVar of booleanEnvVars) {
    if (process.env[envVar] && !['true', 'false', '1', '0', ''].includes(process.env[envVar].toLowerCase())) {
      console.warn(`Warning: ${envVar} environment variable has an unexpected value: ${process.env[envVar]}. Expected values: 'true', 'false', '1', '0', or empty.`);
    }
  }

  console.log('Environment validation passed');
}

module.exports = { validateEnvironment };