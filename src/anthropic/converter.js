/**
 * Anthropic API 与 Qwen API 之间的转换器
 * 处理请求和响应格式的转换
 */

/**
 * Anthropic 与 Qwen 之间的转换器
 * 处理请求和响应格式的转换
 */

/**
 * 将 Anthropic API 请求转换为 Qwen API 请求
 * @param {Object} anthropicReq - Anthropic API 请求对象
 * @returns {Object} 转换后的 Qwen API 请求对象
 */
function anthropicToQwenConverter(anthropicReq) {
  // 映射 Anthropic 模型到 Qwen 模型
  const modelMap = {
    'claude-3-5-sonnet-latest': 'qwen3-coder-plus',
    'claude-3-5-sonnet-20241022': 'qwen3-coder-plus',
    'claude-3-7-sonnet-20250219': 'qwen3-coder-plus',
    'claude-3-7-sonnet-latest': 'qwen3-coder-plus',
    'claude-sonnet-4-5-20250929': 'qwen3-coder-plus',
    'claude-3-sonnet-20240229': 'qwen3-coder-plus',
    'claude-3-opus-latest': 'qwen3-coder-plus',
    'claude-3-opus-20240229': 'qwen3-coder-plus',
    'claude-3-haiku-latest': 'qwen3-coder-flash',
    'claude-3-haiku-20240307': 'qwen3-coder-flash',
    'claude-haiku-4-5-20251001': 'qwen3-coder-flash',
    'claude-opus-4-1-20250805': 'qwen3-coder-plus',
    // 视觉模型映射
    'claude-3-5-sonnet-latest-vision': 'vision-model',
    'claude-3-7-sonnet-latest-vision': 'vision-model',
    'claude-sonnet-4-5-20250929-vision': 'vision-model',
    // 可以添加更多的模型映射
  };

  // 创建 Qwen 兼容的请求对象
  const qwenReq = {
    model: modelMap[anthropicReq.model] || anthropicReq.model || 'qwen3-coder-plus',
    messages: [],
    temperature: anthropicReq.temperature,
    max_tokens: anthropicReq.max_tokens,
    top_p: anthropicReq.top_p,
    stream: anthropicReq.stream || false
  };
  
  // 如果请求的模型不是 Qwen 模型也不是预定义的特殊模型（如 vision-model），则使用默认模型
  if (!qwenReq.model.startsWith('qwen') && qwenReq.model !== 'vision-model') {
    qwenReq.model = 'qwen3-coder-plus'; // 默认使用 Qwen 模型
  }
  
  // 添加 Anthropic 特定参数的映射（Claude Code 2.0+ 新增功能）
  if (anthropicReq.top_k !== undefined) {
    qwenReq.top_k = anthropicReq.top_k;
  }
  
  if (anthropicReq.stop_sequences !== undefined) {
    qwenReq.stop = anthropicReq.stop_sequences;
  }
  
  if (anthropicReq.metadata !== undefined) {
    qwenReq.metadata = anthropicReq.metadata;
  }
  
  // 处理 system 消息
  let systemMessage = null;
  if (anthropicReq.system) {
    if (typeof anthropicReq.system === 'string') {
      systemMessage = { role: 'system', content: anthropicReq.system };
    } else if (Array.isArray(anthropicReq.system)) {
      // Anthropic 允许系统消息使用 content blocks
      const systemContent = anthropicReq.system
        .map(block => typeof block === 'string' ? block : (block.text || block.data || ''))
        .join(' ');
      systemMessage = { role: 'system', content: systemContent };
    }
  }

  // 转换消息格式
  if (anthropicReq.messages && Array.isArray(anthropicReq.messages)) {
    // 检查是否有图像内容，如果有图像内容，强制使用视觉模型
    let hasImageContent = false;
    for (const msg of anthropicReq.messages) {
      if (typeof msg.content === 'string') {
        // 检查字符串中是否包含图片 URL
        if (msg.content.includes('.jpg') || msg.content.includes('.jpeg') || 
            msg.content.includes('.png') || msg.content.includes('.gif') || 
            msg.content.includes('.webp')) {
          hasImageContent = true;
          break;
        }
      } else if (Array.isArray(msg.content)) {
        // 检查内容块数组中是否有图像类型
        if (msg.content.some(block => 
          block.type === 'image' || 
          (typeof block === 'object' && block.url && (
            block.url.includes('.jpg') || block.url.includes('.jpeg') || 
            block.url.includes('.png') || block.url.includes('.gif') || 
            block.url.includes('.webp')
          ))
        )) {
          hasImageContent = true;
          break;
        }
      }
    }

    // 如果有图像内容，使用视觉模型
    if (hasImageContent && !qwenReq.model.includes('vision')) {
      qwenReq.model = 'vision-model'; // 强制使用视觉模型
    }

    // 如果有 system 消息，将其放在最前面
    if (systemMessage) {
      qwenReq.messages.push(systemMessage);
    }

    for (const msg of anthropicReq.messages) {
      // Anthropic 消息格式转换为 Qwen 格式
      let content = [];
      
      // Anthropic 支持 content blocks，需要提取文本内容
      if (typeof msg.content === 'string') {
        content = [{ type: 'text', text: msg.content }];
      } else if (Array.isArray(msg.content)) {
        // 处理内容块数组
        content = msg.content.map(block => {
          if (typeof block === 'string') {
            return { type: 'text', text: block };
          } else if (block.type === 'text') {
            return { type: 'text', text: block.text };
          } else if (block.type === 'image') {
            // 处理图像内容块
            return { 
              type: 'image_url', 
              image_url: { 
                url: typeof block.source === 'string' ? block.source : 
                     typeof block.source?.data === 'string' ? block.source.data : 
                     block.source?.url || ''
              } 
            };
          } else if (typeof block === 'object' && block.type === undefined && block.url) {
            // 处理直接包含 URL 的图像对象
            return { 
              type: 'image_url', 
              image_url: { 
                url: block.url 
              } 
            };
          }
          // 对于非文本内容块，我们暂时只提取文本
          if (block.text) return { type: 'text', text: block.text };
          return { type: 'text', text: '' };
        });
      } else {
        content = [{ type: 'text', text: String(msg.content || '') }];
      }

      // 转换角色
      const role = msg.role === 'assistant' ? 'assistant' : 
                 msg.role === 'user' ? 'user' : 
                 msg.role === 'system' ? 'system' : 'user';

      qwenReq.messages.push({
        role: role,
        content: content
      });
    }
  }

  // 移除 undefined 值以保持请求简洁
  Object.keys(qwenReq).forEach(key => {
    if (qwenReq[key] === undefined) {
      delete qwenReq[key];
    }
  });

  return qwenReq;
}

/**
 * 将 Qwen API 响应转换为 Anthropic API 响应
 * @param {Object} qwenRes - Qwen API 响应对象
 * @param {boolean} isStream - 是否为流式响应
 * @returns {Object} 转换后的 Anthropic API 响应对象
 */
function qwenToAnthropicConverter(qwenRes, isStream = false) {
  // 如果是流式响应，则处理单个数据块
  if (isStream) {
    if (!qwenRes || !qwenRes.choices || qwenRes.choices.length === 0) {
      // 处理特殊情况，如错误或完成信号
      if (qwenRes && qwenRes.error) {
        return {
          type: 'error',
          error: qwenRes.error
        };
      }
      return null;
    }

    const choice = qwenRes.choices[0];
    if (!choice) return null;

    // 生成 Anthropic SSE 事件格式的响应
    if (choice.finish_reason) {
      // 处理完成情况
      return {
        type: 'message_delta',
        delta: {
          stop_reason: choice.finish_reason === 'stop' ? 'end_turn' :
                      choice.finish_reason === 'length' ? 'max_tokens' :
                      choice.finish_reason || 'end_turn',
          stop_sequence: null
        },
        usage: {
          output_tokens: qwenRes.usage?.completion_tokens || 0
        }
      };
    }

    if (choice.delta && choice.delta.content) {
      // 处理内容流
      return {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: choice.delta.content
        }
      };
    }

    // 如果是初始消息
    if (choice.message) {
      return {
        type: 'message_start',
        message: {
          id: qwenRes.id || 'msg_' + Date.now(),
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: choice.message?.content || ''
            }
          ],
          model: qwenRes.model || 'claude-3-5-sonnet-latest',
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: qwenRes.usage?.prompt_tokens || 0,
            output_tokens: qwenRes.usage?.completion_tokens || 0
          }
        }
      };
    }

    return null;
  }

  // 处理非流式响应
  if (qwenRes.error) {
    return {
      error: {
        type: 'api_error',
        message: qwenRes.error.message || 'Error from Qwen API'
      }
    };
  }

  if (!qwenRes.choices || qwenRes.choices.length === 0) {
    return {
      error: {
        type: 'api_error',
        message: 'No choices returned from Qwen API'
      }
    };
  }

  // 提取助手的消息内容
  const assistantMessage = qwenRes.choices[0].message;
  const finishReason = qwenRes.choices[0].finish_reason;

  // 转换结束原因
  const anthropicFinishReason = finishReason === 'stop' ? 'end_turn' :
                               finishReason === 'length' ? 'max_tokens' :
                               finishReason || 'end_turn';

  // 创建 Anthropic 格式的响应
  const anthropicResponse = {
    id: qwenRes.id || 'msg_' + Date.now(),
    type: 'message',
    role: 'assistant',
    model: qwenRes.model || 'claude-3-5-sonnet-latest',
    content: [
      {
        type: 'text',
        text: assistantMessage?.content || ''
      }
    ],
    stop_reason: anthropicFinishReason,
    stop_sequence: null,
    usage: {
      input_tokens: qwenRes.usage?.prompt_tokens || 0,
      output_tokens: qwenRes.usage?.completion_tokens || 0
    }
  };

  // 添加 Claude Code 2.0+ 新增的字段
  if (qwenRes.service_tier) {
    anthropicResponse.service_tier = qwenRes.service_tair;
  }
  
  if (qwenRes.thinking) {
    anthropicResponse.thinking = qwenRes.thinking;
  }

  return anthropicResponse;
}

module.exports = { anthropicToQwenConverter, qwenToAnthropicConverter };