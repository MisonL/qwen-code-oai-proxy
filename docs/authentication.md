# Qwen 认证

本文档解释了如何与 Qwen 认证以供代理服务器使用。代理服务器支持两种认证方法：使用内置认证脚本或官方 `qwen-code` CLI 工具。

## 概述

认证系统基于 **OAuth 2.0 设备授权流程**。这是一种标准协议，允许命令行界面（CLI）和其他输入受限的设备安全地获取访问令牌。

代理服务器现在包含其自己的内置认证实现，基于官方 `qwen-code` CLI 工具使用的相同 OAuth 2.0 设备授权流程。

## 认证方法

### 方法 1：内置认证（推荐）

代理服务器现在包含其自己的内置认证脚本，实现 OAuth 2.0 设备授权流程：

1. 在项目目录中运行 `npm run auth`
2. 脚本将自动：
   - 检查现有有效凭据
   - 如果找到则尝试刷新过期的凭据
   - 如果需要则启动新的认证流程
3. 您将看到一个 QR 码和 URL 以进行认证
4. 扫描 QR 码或访问 URL 以完成认证
5. 凭据将自动保存到 `~/.qwen/oauth_creds.json`

### 方法 2：官方 qwen-code CLI 工具

您也可以使用来自 [QwenLM/qwen-code](https://github.com/QwenLM/qwen-code) 的官方 `qwen-code` CLI 工具：

1. 安装 `qwen-code` CLI 工具
2. 运行 `qwen-code auth` 与您的 Qwen 账户认证
3. 凭据将保存到 `~/.qwen/oauth_creds.json`

## 认证流程

OAuth 2.0 设备授权流程工作如下：

1.  **Initiation**: The client generates a **PKCE (Proof Key for Code Exchange)** pair, which consists of a `code_verifier` and a `code_challenge`. This is a security measure to prevent authorization code interception attacks.

2.  **Device Authorization Request**: The client sends a `POST` request to the `device_code` endpoint with the `code_challenge`.

3.  **User Authorization**: The server responds with a `verification_uri` and a `user_code`. The user is prompted to open the URI in a browser and enter the code to authorize the application.

4.  **Token Polling**: While the user is authorizing, the client continuously polls the `token` endpoint, sending the `device_code` and the original `code_verifier`.

5.  **Token Issuance**: Once the user completes the authorization, the server validates the `code_verifier` and, if successful, returns an `access_token`, a `refresh_token`, and the token's `expiry_date`.

6.  **Credential Caching**: The client saves these tokens to a file at `~/.qwen/oauth_creds.json`.

## 关键实现细节

### 端点和配置

*   **Device Code Endpoint**: `https://chat.qwen.ai/api/v1/oauth2/device/code`
*   **Token Endpoint**: `https://chat.qwen.ai/api/v1/oauth2/token`
*   **Client ID**: `f0304373b74a44d2b584a3fb70ca9e56`
*   **Scope**: `openid profile email model.completion`

这些常量在 `src/qwen/auth.js` 文件中定义。

### 令牌存储

*   **Location**: The credentials are stored at `~/.qwen/oauth_creds.json`.
*   **Functions**:
    *   `saveCredentials`: 将令牌写入文件。
    *   `loadCredentials`: 从文件中读取令牌。
    *   `QwenAuthManager` 类处理所有认证相关的操作。

### 令牌刷新

*   **Trigger**: The `isTokenValid` method checks if the current `access_token` will expire within the next 30 seconds.
*   **Mechanism**: If the token is close to expiring, the `refreshAccessToken` method is called. It sends the `refresh_token` to the token endpoint to get a new `access_token`.
*   **Automatic Refresh**: This process is handled automatically by the `getAccessToken` method, ensuring that the user always has a valid token without needing to re-authenticate manually.

OAuth 2.0 设备流程的这种强大实现使代理服务器能够代表用户无缝且安全地与 Qwen API 认证。