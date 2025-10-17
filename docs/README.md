# 项目目标和架构

## 目标

该项目的主要目标是创建一个 OpenAI 兼容 API 代理服务器，允许任何设计用于使用 OpenAI API 的应用程序无缝使用 qwen-code cli 的 qwen oauth 子模块中的 Qwen 模型。这包括对流式传输等的完全支持。 

qwen-code cli 的源代码在 ./qwen-code 中。它已被添加到 .gitignore 中，但 LLM 应该能找到并搜索它以了解更多。 

这解决的核心问题是新模型的"冷启动"问题。通过通过广泛采用的 API 标准（OpenAI 的）暴露 Qwen 的功能，我们可以利用现有工具和应用程序的庞大生态系统，使 Qwen 的模型立即对广大用户有用。

简单来说，它是 qwen-code 的即插即用替代品，适用于广泛用例 
qwen api -- > qwen code cli --- > 仅在终端中用于编码工作 
            (检查认证和刷新)
qwen api -- > 代理 ---> openai OpenAI 兼容 api --> 任何使用 openai api 的工具
            (检查认证和刷新)

## 架构

代理服务器位于 OpenAI 兼容客户端和 Qwen API 之间，实时翻译请求和响应。

```
[OpenAI Client] <--> [Proxy Server] <--> [Qwen API]
      |                   |                  |
OpenAI Format      Translation Layer      Qwen Models
```

### 关键组件：

1.  **API Translation Layer**: This is the heart of the proxy. It converts incoming OpenAI-formatted requests into the format expected by the Qwen API, and then translates the Qwen API's response back into the OpenAI format.

2.  **认证 Management**: The proxy is designed to be user-friendly by automatically using the same authentication credentials as the official Qwen CLI tool. It reads the `oauth_creds.json` file, uses the access token, and handles token refreshes automatically. This means that if a user is already logged into the Qwen CLI, the proxy works out-of-the-box without requiring a separate login. Users can authenticate using either the official `qwen-code` CLI tool or the proxy's built-in authentication script with QR code support. For a detailed explanation of the authentication process, see `authentication.md` and `qr-authentication.md`.

3.  **Server Implementation**: The proxy is built as a Node.js server using the Express.js framework. It exposes the necessary OpenAI-compatible endpoints, such as `/v1/chat/completions`.

## 架构

代理服务器位于 OpenAI/Anthropic 兼容客户端和 Qwen API 之间，实时翻译请求和响应。

```
[OpenAI/Anthropic Client] <--> [Proxy Server] <--> [Qwen API]
      |                             |                  |
OpenAI/Anthropic Format      Translation Layer      Qwen Models
```

### 关键组件：

1.  **API Translation Layer**: This is the heart of the proxy. It converts incoming OpenAI-formatted requests into the format expected by the Qwen API, and then translates the Qwen API's response back into the OpenAI format. The proxy also includes support for Anthropic API format translation, especially for Claude Code.

2.  **认证 Management**: The proxy is designed to be user-friendly by automatically using the same authentication credentials as the official Qwen CLI tool. It reads the `oauth_creds.json` file, uses the access token, and handles token refreshes automatically. This means that if a user is already logged into the Qwen CLI, the proxy works out-of-the-box without requiring a separate login. Users can authenticate using either the official `qwen-code` CLI tool or the proxy's built-in authentication script with QR code support. For a detailed explanation of the authentication process, see `authentication.md` and `qr-authentication.md`.

3.  **Server Implementation**: The proxy is built as a Node.js server using the Express.js framework. It exposes the necessary OpenAI-compatible endpoints, such as `/v1/chat/completions`, and Anthropic-compatible endpoints, such as `/anthropic/v1/messages`.

## 支持的端点

基于 `src/index.js` 中的实现，代理支持以下端点：
- `POST /v1/chat/completions` - Chat completions with streaming support and full temperature control
- `GET /v1/models` - List available models (returns mock data)
- `POST /anthropic/v1/messages` - Anthropic API compatible endpoint for Claude Code (optimized)
- `GET /anthropic/v1/models` - List Anthropic-compatible models for Claude Code
- `GET /health` - Health check endpoint
- `POST /auth/initiate` - 认证 initiation endpoint
- `POST /auth/poll` - 认证 polling endpoint

## 关键特性

### 认证
- 过期前 30 秒自动刷新令牌
- 具有刷新队列的并发请求处理
- 认证错误的回退重试逻辑
- 支持来自凭据的自定义端点

### 令牌管理
- 输入令牌估算的终端显示
- API 返回的令牌使用统计（提示、完成、总计）
- 自动上下文窗口管理
- 主动令牌限制处理

### 温度控制
- 完全支持 OpenAI 兼容的温度参数
- 值从 0.0（确定性）到 2.0（随机）
- 直接传递到 Qwen API 以获得原生行为
- 详细信息请参见 `temperature-settings.md`

### 错误处理
- 认证错误的自动重试
- 优雅处理 504 网关超时问题
- 带有调试文件输出的详细错误日志
- 上下文长度超出错误的特定处理

### 日志和调试
- 具有文件输出的可配置调试日志
- 具有可配置限制的日志文件轮换
- 不同消息类型的彩色终端输出
- 调试文件中的详细 API 请求/响应日志

## 配置

代理服务器可以使用环境变量进行配置。在项目根目录创建 `.env` 文件或直接在环境中设置变量。

- `LOG_FILE_LIMIT`: Maximum number of debug log files to keep (default: 20)
- `DEBUG_LOG`: Set to `true` to enable debug logging (default: false)
- `HOST`: Server host (default: localhost)
- `PORT`: Server port (default: 8080)
- `DEFAULT_ACCOUNT`: Specify which account the proxy should use by default (when using multi-account setup)
    - 应与使用 `npm run auth add <name>` 添加账户时使用的名称匹配
    - 如果未设置或无效，代理将使用第一个可用账户

有关温度设置和其他模型参数的信息，请参见 `temperature-settings.md`。

有关配置默认账户的信息，请参见 `default-account.md`。

## 令牌限制和性能

当使用 130,000 到 150,000 个或更多 token 的上下文时，用户可能会遇到错误或 504 网关超时问题。这似乎是 Qwen 模型的实际限制。基于用户反馈的详细信息，请参见 `user-feedback.md`。

代理现在在终端中显示每个请求的 token 计数，显示输入 token 估算和 API 返回的使用统计（提示、完成和总 token）。
