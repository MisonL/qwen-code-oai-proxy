const { QwenAPI } = require('../qwen/api.js');
const { anthropicToQwenConverter, qwenToAnthropicConverter } = require('./converter.js');
const { anthropicModels } = require('./models.js');

class AnthropicProxy {
  constructor() {
    this.qwenAPI = new QwenAPI();
  }

  /**
   * 处理 Anthropic Messages API 请求
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async handleMessages(req, res) {
    try {
      console.log('Received Anthropic API request:', req.body);
      
      // 将 Anthropic 请求转换为 Qwen 兼容格式
      const qwenRequest = anthropicToQwenConverter(req.body);
      
      const accountId = req.headers['x-qwen-account'] || req.query.account || qwenRequest.account;
      
      // 直接调用 Qwen API
      const response = await this.qwenAPI.chatCompletions({
        model: qwenRequest.model || 'qwen3-coder-plus',
        messages: qwenRequest.messages,
        tools: qwenRequest.tools,
        tool_choice: qwenRequest.tool_choice,
        temperature: qwenRequest.temperature,
        max_tokens: qwenRequest.max_tokens,
        top_p: qwenRequest.top_p,
        top_k: qwenRequest.top_k,
        stop: qwenRequest.stop,
        metadata: qwenRequest.metadata,
        accountId
      });
      
      // 将 Qwen 响应转换为 Anthropic 格式
      const anthropicResponse = qwenToAnthropicConverter(response);
      
      res.json(anthropicResponse);
    } catch (error) {
      console.error('Error in Anthropic proxy:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          message: error.message || 'Internal server error'
        }
      });
    }
  }

  /**
   * 处理流式请求
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async handleStreamingRequest(req, res) {
    try {
      // 设置 SSE 响应头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // 将 Anthropic 请求转换为 Qwen 兼容格式
      const qwenRequest = anthropicToQwenConverter({ ...req.body, stream: true });
      
      const accountId = req.headers['x-qwen-account'] || req.query.account || qwenRequest.account;

      // 调用 Qwen API 流式方法
      const stream = await this.qwenAPI.streamChatCompletions({
        model: qwenRequest.model || 'qwen3-coder-plus',
        messages: qwenRequest.messages,
        tools: qwenRequest.tools,
        tool_choice: qwenRequest.tool_choice,
        temperature: qwenRequest.temperature,
        max_tokens: qwenRequest.max_tokens,
        top_p: qwenRequest.top_p,
        top_k: qwenRequest.top_k,
        stop: qwenRequest.stop,
        metadata: qwenRequest.metadata,
        accountId
      });

      // 为流式响应创建处理函数
      const dataHandler = (data) => {
        // 将 Qwen 流数据转换为 Anthropic 格式
        try {
          if (data.startsWith('data: ')) {
            const jsonStr = data.substring(6); // 移除 'data: ' 前缀
            if (jsonStr === '[DONE]') {
              // 发送 Anthropic 格式的完成信号
              res.write(`event: message_stop\n`);
              res.write(`data: {}\n\n`);
              return;
            }
            
            const parsed = JSON.parse(jsonStr);
            
            // 将 Qwen 格式的流数据转换为 Anthropic 格式
            const anthropicChunk = qwenToAnthropicConverter(parsed, true); // true 表示流式
            
            if (anthropicChunk) {
              res.write(`data: ${JSON.stringify(anthropicChunk)}\n\n`);
            }
          } else {
            res.write(data);
          }
        } catch (e) {
          console.error('Error processing stream data:', e);
        }
      };

      // 处理来自 Qwen API 的流数据
      stream.on('data', (chunk) => {
        if (typeof chunk === 'string') {
          dataHandler(chunk);
        }
      });

      stream.on('end', () => {
        res.end();
      });

      stream.on('error', (error) => {
        console.error('Stream error:', error);
        res.write(`data: {"error": {"type": "api_error", "message": "${error.message || 'Internal server error'}"}}\n\n`);
        res.end();
      });
    } catch (error) {
      console.error('Error in Anthropic streaming proxy:', error);
      res.write(`data: {"error": {"type": "api_error", "message": "${error.message || 'Internal server error'}"}}\n\n`);
      res.end();
    }
  }

  /**
   * 处理模型列表请求
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleModels(req, res) {
    try {
      res.json({
        object: 'list',
        data: anthropicModels.map(model => ({
          id: model.id,
          object: 'model',
          created: model.created,
          owned_by: model.owned_by
        }))
      });
    } catch (error) {
      console.error('Error in Anthropic models endpoint:', error);
      res.status(500).json({
        error: {
          type: 'api_error',
          message: error.message || 'Internal server error'
        }
      });
    }
  }
}

module.exports = { AnthropicProxy };