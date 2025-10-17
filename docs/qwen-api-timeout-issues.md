# Qwen API 超时和流式传输问题

## 概述

本文档分析通过 OpenAI 兼容代理使用 Qwen API 时可能出现的潜在超时和流式传输问题。信息基于对代理实现和 qwen-code CLI 工具源代码的分析。

## 已知问题

### 504 网关超时错误

您遇到的错误消息：
```
API Error (500 {"error":{"message":"Error from provider: {\"error\":{\"message\":\"Qwen API error: 504 \\\"stream timeout\\\"\",\"type\":\"internal_server_error\"}}Error: Error from provider: {\"error\":{\"message\":\"Qwen API error: 504 \\\"stream timeout\\\"\",\"type\":\"internal_server_error\"}}
```

这表明 Qwen API 在其后端遇到超时问题，特别是在流式传输操作期间。

## 根本原因分析

基于源代码分析：

1. **Timeout Configuration**: The proxy sets a 5-minute timeout for API requests (300,000 ms) in the chat completions endpoint.

2. **Streaming Complexity**: Streaming responses require maintaining long-lived connections, which are more susceptible to network interruptions and server-side timeouts.

3. **Qwen API Backend**: The 504 "stream timeout" error originates from Qwen's infrastructure, suggesting that their streaming endpoint has internal timeout limits.

4. **Token Expiration Issues**: Expired access tokens were causing authentication failures that manifested as 504 Gateway Timeout errors from Qwen's API. The proxy was not validating token expiration before use.

## 解决方案实现

### 令牌验证和刷新

代理已通过与官方 qwen-code CLI 实现匹配的强大令牌管理增强：

1. **Automatic Token Validation**: Before each API request, the proxy now checks if the access token is still valid using the same logic as qwen-code.

2. **Proactive Token Refresh**: Tokens are automatically refreshed 30 seconds before they expire, preventing authentication failures.

3. **Error-Based Retry Logic**: When 504 Gateway Timeout errors occur (which were often caused by expired tokens), the proxy now:
   - 检测认证错误
   - 自动刷新访问令牌
   - 使用新令牌重试请求
   - 仅在重试也失败时才失败

4. **Concurrent Request Handling**: Multiple simultaneous requests are handled efficiently using a `refreshPromise` pattern that prevents multiple simultaneous token refresh attempts.

### 日志记录和监控

增强的实现提供详细日志以帮助诊断令牌相关问题：

- **Token Status**: Shows when tokens are valid vs. when they need refreshing
- **Refresh Operations**: Logs when token refresh starts and completes
- **Retry Attempts**: Shows when auth errors trigger automatic retries
- **Success/Failure**: Clear indication of whether retries succeed or fail

### 优势

1. **Eliminates 504 Errors**: Most 504 Gateway Timeout errors caused by expired tokens are now resolved automatically.

2. **Improved Reliability**: No more need to manually restart the proxy when tokens expire.

3. **Better User Experience**: Requests succeed automatically without user intervention.

4. **Alignment with Official Tool**: Implementation now matches the robust token handling of the official qwen-code CLI.

## 建议

### 对代理用户

1. **Reduce Input Size**: Large prompts are more likely to trigger timeouts. Try breaking large requests into smaller chunks.

2. **Check Network Connectivity**: Ensure stable internet connection, especially for streaming requests.

3. **Retry Logic**: Implement client-side retry logic for transient timeout errors.

### 对代理配置

1. **Adjust Timeout Settings**: Consider increasing the timeout value in the axios requests if your use case requires longer processing times.

2. **Better Error Handling**: Implement more specific handling for 504 errors to provide better user feedback.

3. **Streaming Fallback**: Consider implementing fallback logic that switches from streaming to non-streaming mode when timeouts occur.

## 实现说明

src/qwen/api.js 中的当前代理实现有捕获 HTTP 状态码和错误响应的基本错误处理。然而，它可以增强为：

1. 专门检测和处理 504 网关超时错误
2. 向用户提供更多错误信息
3. 为临时超时问题实现重试逻辑
4. 为超时值添加配置选项

## 结论

504 "流式超时" 错误是来自 Qwen API 基础设施的服务器端问题。虽然代理无法防止这些错误，但可以增强它以更优雅地处理这些问题，并向用户提供更好的解决方法指导。