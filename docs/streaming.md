# Qwen OpenAI 兼容代理中的流式传输

本文档说明代理服务器如何实现来自 Qwen API 的流式响应。

## 概述

流式传输是大型语言模型的关键功能，因为它允许用户在生成响应时看到它，而不是等待整个响应完成。代理服务器具有强大的流式传输实现，可以通过配置启用或禁用。

默认情况下，流式传输被禁用。要启用流式传输并允许流式响应，请设置 `STREAM=true` 环境变量。

当流式传输被禁用时，即使是指定 `stream: true` 的客户端请求也会在单个负载中接收完整的响应，而不是块流。

## 工作原理

1.  **Client Request**: When a client makes a request to the `/v1/chat/completions` endpoint, the server checks if streaming is both requested by the client (`stream: true`) and enabled in the configuration.

2.  **配置检查**: The server checks the `STREAM` environment variable. If it's set to `false`, all responses will be non-streaming regardless of the client's request.

3.  **Streaming Path**: If streaming is enabled and requested, the server makes a streaming request to the Qwen API and forwards the chunks to the client as Server-Sent Events.

4.  **Non-Streaming Path**: If streaming is disabled or not requested, the server makes a regular request to the Qwen API and returns the complete response to the client.

## 关键代码片段

### 配置检查

服务器检查客户端请求和环境配置：

```javascript
// In src/index.js

// Check if streaming is requested and enabled
const isStreaming = req.body.stream === true && config.stream;

if (isStreaming) {
  // Handle streaming response
  await this.handleStreamingChatCompletion(req, res);
} else {
  // Handle regular response
  await this.handleRegularChatCompletion(req, res);
}
```

### 环境配置

流式行为由 `STREAM` 环境变量控制：

```javascript
// In src/config.js

stream: process.env.STREAM === 'true', // Disable streaming by default, enable only if STREAM=true
```

这种方法允许用户轻松切换流式行为而无需修改代码。