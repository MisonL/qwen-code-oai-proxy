/**
 * Token计数工具
 * 使用tiktoken计算消息中的token数量
 */

const { get_encoding } = require('tiktoken');

/**
 * 使用tiktoken计算消息中的token数量
 * @param {Array|String|Object} input - 要计算token的输入
 * @returns {number} - token数量
 */
function countTokens(input) {
  try {
    // 将输入转换为字符串格式以进行token计数
    let inputString = '';
    
    if (typeof input === 'string') {
      inputString = input;
    } else if (Array.isArray(input)) {
      // 处理消息数组
      inputString = JSON.stringify(input);
    } else if (typeof input === 'object' && input !== null) {
      // 处理消息对象
      if (input.content) {
        inputString = typeof input.content === 'string' ? input.content : JSON.stringify(input.content);
      } else {
        inputString = JSON.stringify(input);
      }
    } else {
      inputString = String(input);
    }
    
    // 使用cl100k_base编码（GPT-4分词器，对Qwen来说是很好的近似）
    const encoding = get_encoding('cl100k_base');
    const tokens = encoding.encode(inputString);
    const tokenCount = tokens.length;
    
    // 清理编码资源
    encoding.free();
    
    return tokenCount;
  } catch (error) {
    console.warn('计算token时出错，回退到字符近似:', error);
    // 回退：使用字符计数进行粗略近似
    
    let inputString = '';
    if (typeof input === 'string') {
      inputString = input;
    } else if (Array.isArray(input)) {
      inputString = JSON.stringify(input);
    } else if (typeof input === 'object' && input !== null) {
      if (input.content) {
        inputString = typeof input.content === 'string' ? input.content : JSON.stringify(input.content);
      } else {
        inputString = JSON.stringify(input);
      }
    } else {
      inputString = String(input);
    }
    
    return Math.ceil(inputString.length / 4); // 粗略估计：1个token ≈ 4个字符
  }
}

module.exports = { countTokens };