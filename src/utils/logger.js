const fs = require('fs').promises;
const path = require('path');
const config = require('../config.js');

// 确保调试目录存在
const debugDir = path.join(__dirname, '..', '..', 'debug');

class DebugLogger {
  constructor() {
    // 确保调试目录存在
    this.ensureDebugDir();
  }

  async ensureDebugDir() {
    try {
      await fs.access(debugDir);
    } catch (error) {
      // 目录不存在，创建它
      await fs.mkdir(debugDir, { recursive: true });
    }
  }

  /**
   * 通过删除最旧的文件来执行日志文件限制
   * @param {number} limit - 保留日志文件的最大数量
   */
  async enforceLogFileLimit(limit) {
    try {
      // 获取目录中的所有调试文件
      const files = await fs.readdir(debugDir);
      
      // 仅过滤调试文件（以 'debug-' 开头并以 '.txt' 结尾）
      const debugFiles = files.filter(file => 
        file.startsWith('debug-') && file.endsWith('.txt')
      );
      
      // 如果我们有超过限制的文件，则删除最旧的文件
      if (debugFiles.length > limit) {
        // 获取文件状态以按创建时间排序
        const fileStats = await Promise.all(
          debugFiles.map(async (file) => {
            const filePath = path.join(debugDir, file);
            const stats = await fs.stat(filePath);
            return { file, mtime: stats.mtime };
          })
        );
        
        // 按修改时间排序（最旧的在前）
        fileStats.sort((a, b) => a.mtime - b.mtime);
        
        // 计算要删除的文件数量
        const filesToRemove = fileStats.length - limit;
        
        // 删除最旧的文件
        for (let i = 0; i < filesToRemove; i++) {
          const filePath = path.join(debugDir, fileStats[i].file);
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      // 静默处理错误以避免破坏应用程序
      // 日志文件限制执行对主要功能不是关键的
    }
  }

  /**
   * 为文件名格式化当前日期/时间
   * @returns {string} 格式化的时间戳，如 '2023-12-06-14:30:45'
   */
  getTimestampForFilename() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day}-${hours}:${minutes}:${seconds}`;
  }

  /**
   * 为日志条目格式化当前日期/时间
   * @returns {string} 格式化的时间戳，如 '2023-12-06 14:30:45.123'
   */
  getTimestampForLog() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  /**
   * 将API请求和响应记录到文件
   * @param {string} endpoint - 被调用的API端点
   * @param {object} request - 请求数据
   * @param {object} response - 响应数据
   * @param {object} error - 请求失败时的错误对象
   * @returns {string} 创建的调试文件名
   */
  async logApiCall(endpoint, request, response, error = null) {
    // 检查是否启用了调试日志
    if (!config.debugLog) {
      // 如果调试日志已禁用，直接返回而不创建日志文件
      return null;
    }
    
    try {
      const timestamp = this.getTimestampForFilename();
      const logFilePath = path.join(debugDir, `debug-${timestamp}.txt`);
      const debugFileName = `debug-${timestamp}.txt`;
      
      // 仅提取请求的相关部分
      const logRequest = {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body,
        query: request.query
      };
      
      // 如果错误存在，则创建详细的错误信息
      let detailedError = null;
      if (error) {
        detailedError = {
          name: error.name,
          message: error.message,
          stack: error.stack,
          type: this.getErrorType(error),
          statusCode: this.getErrorStatusCode(error),
          timestamp: this.getTimestampForLog()
        };
        
        // 如果错误有额外属性，则包含它们
        if (error.response && error.response.status) {
          detailedError.apiStatus = error.response.status;
          detailedError.apiData = error.response.data;
        }
        
        if (error.code) {
          detailedError.code = error.code;
        }
        
        if (error.errno) {
          detailedError.errno = error.errno;
        }
        
        if (error.syscall) {
          detailedError.syscall = error.syscall;
        }
      }
      
      const logEntry = {
        timestamp: this.getTimestampForLog(),
        endpoint: endpoint,
        request: this.sanitizeRequest(logRequest),
        response: error ? detailedError : response,
        isErrorResponse: !!error
      };
      
      // 处理循环引用和不可序列化的对象
      const logContent = JSON.stringify(logEntry, (key, value) => {
        if (key === 'stack' && typeof value === 'string') {
          // 限制堆栈跟踪长度
          return value.split('\n').slice(0, 20).join('\n'); // 增加到20行以获得更多细节
        }
        if (value instanceof Error) {
          // 直接处理Error对象
          return {
            name: value.name,
            message: value.message,
            stack: value.stack
          };
        }
        if (typeof value === 'bigint') {
          // 处理BigInt值
          return value.toString();
        }
        return value;
      }, 2);
      
      await fs.writeFile(logFilePath, logContent);
      
      // 执行日志文件限制
      await this.enforceLogFileLimit(config.logFileLimit);
      
      // 以绿色在终端打印调试文件名
      console.log('\x1b[32m%s\x1b[0m', `调试日志已保存到: ${debugFileName}`);
      
      return debugFileName;
    } catch (err) {
      // 不要让日志错误破坏应用程序
      // 静默处理日志错误以避免让终端混乱
      return null;
    }
  }

  /**
   * Determine the type of error based on its properties
   * @param {Error} error - The error object
   * @returns {string} The error type
   */
  getErrorType(error) {
    if (!error) return 'unknown';
    
    if (error.message && (
      error.message.includes('validation') || 
      error.message.toLowerCase().includes('invalid') ||
      error.message.includes('Validation error')
    )) {
      return 'validation_error';
    }
    
    if (error.message && (
      error.message.includes('Not authenticated') ||
      error.message.includes('access token') ||
      error.message.includes('authorization') ||
      error.message.includes('401') ||
      error.message.includes('403')
    )) {
      return 'authentication_error';
    }
    
    if (error.message && (
      error.message.includes('429') ||
      error.message.toLowerCase().includes('rate limit') ||
      error.message.toLowerCase().includes('quota')
    )) {
      return 'rate_limit_error';
    }
    
    if (error.code && (
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'EAI_AGAIN'
    )) {
      return 'network_error';
    }
    
    if (error.message && (
      error.message.toLowerCase().includes('timeout') ||
      error.code === 'TIMEOUT'
    )) {
      return 'timeout_error';
    }
    
    if (error.name === 'SyntaxError' || error.name === 'TypeError' || error.name === 'ReferenceError') {
      return 'javascript_error';
    }
    
    return 'application_error';
  }

  /**
   * 从错误中提取HTTP状态码（如果可用）
   * @param {Error} error - 错误对象
   * @returns {number|null} 状态码或null
   */
  getErrorStatusCode(error) {
    if (error.response && error.response.status) {
      return error.response.status;
    }
    
    if (error.status) {
      return error.status;
    }
    
    // 如果存在，从错误消息中提取状态码
    const match = error.message.match(/status[^\d]*(\d{3})/i);
    if (match) {
      return parseInt(match[1]);
    }
    
    return null;
  }
  
  /**
   * 仅创建带有上下文的错误的简化日志
   * @param {string} context - 错误发生的上下文
   * @param {Error} error - 错误对象
   * @param {string} level - 日志级别（错误、警告、信息）
   */
  async logError(context, error, level = 'error') {
    // 检查是否启用了调试日志
    if (!config.debugLog) {
      return null;
    }
    
    try {
      const timestamp = this.getTimestampForFilename();
      const logFilePath = path.join(debugDir, `debug-${timestamp}.txt`);
      const debugFileName = `debug-${timestamp}.txt`;
      
      const detailedError = {
        context: context,
        level: level,
        name: error.name,
        message: error.message,
        stack: error.stack,
        type: this.getErrorType(error),
        timestamp: this.getTimestampForLog()
      };
      
      // 如果可用，则包含额外的错误属性
      if (error.code) detailedError.code = error.code;
      if (error.errno) detailedError.errno = error.errno;
      if (error.syscall) detailedError.syscall = error.syscall;
      if (error.path) detailedError.path = error.path;
      
      if (error.response) {
        detailedError.response = {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: error.response.data
        };
      }
      
      await fs.writeFile(logFilePath, JSON.stringify(detailedError, null, 2));
      
      // 执行日志文件限制
      await this.enforceLogFileLimit(config.logFileLimit);
      
      console.log('\x1b[32m%s\x1b[0m', `错误日志已保存到: ${debugFileName}`);
      
      return debugFileName;
    } catch (err) {
      return null;
    }
  }

  /**
   * Sanitize request data to remove sensitive information
   * @param {object} request - Request data to sanitize
   * @returns {object} Sanitized request data
   */
  sanitizeRequest(request) {
    if (!request) return request;
    
    // 创建深层副本以避免修改原始数据
    const sanitized = JSON.parse(JSON.stringify(request));
    
    // 如果存在，删除敏感头信息
    if (sanitized.headers) {
      if (sanitized.headers.Authorization) {
        sanitized.headers.Authorization = '[REDACTED]';
      }
      if (sanitized.headers.authorization) {
        sanitized.headers.authorization = '[REDACTED]';
      }
    }
    
    // 如果存在，删除敏感的主体字段
    if (sanitized.body) {
      // 如果主体包含访问令牌或凭证，则删除它们
      if (sanitized.body.access_token) {
        sanitized.body.access_token = '[REDACTED]';
      }
      if (sanitized.body.refresh_token) {
        sanitized.body.refresh_token = '[REDACTED]';
      }
    }
    
    return sanitized;
  }
}

module.exports = { DebugLogger };