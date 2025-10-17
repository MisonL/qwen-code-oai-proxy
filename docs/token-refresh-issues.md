# Token 刷新问题和解决方案

## 问题描述

Qwen OpenAI 兼容代理遇到了间歇性 504 网关超时错误，在重启代理服务器后会暂时解决。本文档说明根本原因和解决方案。

## 根本原因分析

### 当前实现问题

1. **No Token Validation**: The proxy loads credentials using `loadCredentials()` but doesn't check if the access token is expired.

2. **No Automatic Refresh**: Expired tokens are sent to the Qwen API, causing authentication failures that may manifest as 504 errors.

3. **No Error Recovery**: When authentication errors occur, there's no retry mechanism with refreshed tokens.

4. **No Concurrent Handling**: Multiple requests can trigger simultaneous token refresh attempts.

### 为什么重启修复问题

代理重启时：
- 从文件系统加载新凭据
- 令牌可能仍然有效（如果最近由 qwen-code CLI 刷新）
- 所有有问题的内部状态被清除
- HTTP 连接池被重置

然而，这只是临时修复，因为令牌最终会再次过期。

## qwen-code CLI 如何处理令牌刷新

官方 qwen-code CLI 实现强大的令牌管理：

1. **Automatic Validation**: `getAccessToken()` checks token validity using `isTokenValid()`
2. **Proactive Refresh**: Refreshes tokens 30 seconds before expiration
3. **Error-Based Retry**: Detects auth errors and automatically retries with refreshed tokens
4. **Concurrent Request Handling**: Uses `refreshPromise` to prevent multiple simultaneous refreshes
5. **Retry Logic**: Automatically retries failed requests once after token refresh

## 解决方案实现

### 增强的认证管理器

src/qwen/auth.js 文件已更新：

1. **Token Validation**: Added `isTokenValid()` method that checks if tokens will expire within 30 seconds
2. **Automatic Refresh**: Implemented `getValidAccessToken()` that validates and refreshes tokens automatically
3. **Concurrent Handling**: Added `refreshPromise` to prevent multiple simultaneous refresh attempts
4. **Error Handling**: Improved error messages and logging for token operations

### 增强的 API 客户端

src/qwen/api.js 文件已更新：

1. **Token Usage**: Both `chatCompletions()` and `createEmbeddings()` now use `getValidAccessToken()` instead of `loadCredentials()`
2. **Auth Error Detection**: Added `isAuthError()` function to detect authentication-related errors including 504 Gateway Timeout
3. **Retry Logic**: Implemented automatic retry mechanism for auth errors
4. **Logging**: Added comprehensive logging for token operations and retry attempts

### 关键功能

**自动令牌管理：**
```
请求前 → 检查令牌有效性 → 如需刷新 → 发起 API 调用
```

**错误恢复：**
```
API 错误 → 检测认证错误 → 刷新令牌 → 重试请求 → 成功/失败
```

**并发处理：**
```
多个请求 → 单个刷新操作 → 全部等待相同结果
```

### 日志输出

增强的实现提供清晰的终端输出：

- **🟡 "Refreshing Qwen access token..."** - Token refresh started
- **✅ "Qwen access token refreshed successfully"** - Token refresh completed
- **✅ "Using valid Qwen access token"** - Token is still valid
- **🟡 "Qwen access token expired or expiring soon, refreshing..."** - Proactive refresh
- **🟡 "Detected auth error (504), attempting token refresh and retry..."** - Error-triggered refresh
- **🔵 "Retrying request with refreshed token..."** - Retry in progress
- **✅ "Request succeeded after token refresh"** - Retry successful
- **❌ "Request failed even after token refresh"** - Retry failed

### 优势

- **Eliminates 504 Errors**: Most 504 Gateway Timeout errors caused by expired tokens are now resolved automatically
- **Improved Reliability**: No more need to manually restart the proxy when tokens expire
- **Better User Experience**: Requests succeed automatically without user intervention
- **Alignment with Official Tool**: Implementation now matches the robust token handling of the official qwen-code CLI
- **Transparent Operation**: Clear logging shows what's happening with token management

## 测试解决方案

实现已完成并测试。重启代理后，您应该看到：

1. **Initial Requests**: "Using valid Qwen access token" if tokens are still valid
2. **Token Expiration**: Automatic refresh with clear logging messages
3. **Error Recovery**: Auth errors automatically trigger refresh and retry
4. **No Manual Intervention**: 504 errors should be resolved automatically

该解决方案已验证可消除由过期令牌引起的 504 超时问题。