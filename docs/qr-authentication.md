# QR 码认证

代理服务器现在包含一个带有 QR 码支持的内置认证系统，使与 Qwen 的认证比以往任何时候都更容易。

## 工作原理

内置认证脚本实现 OAuth 2.0 设备授权流程，具有以下功能：

1. **Automatic Credential Management**: Checks for existing credentials and attempts to refresh them before initiating a new flow
2. **QR Code Generation**: Automatically generates and displays a QR code for quick mobile authentication
3. **Browser Integration**: Attempts to automatically open the authentication URL in your default browser
4. **Real-time Feedback**: Provides clear status updates during the authentication process

## 使用 QR 码认证

使用内置 QR 码系统进行认证：

```bash
npm run auth
```

认证脚本将：

1. 检查 `~/.qwen/oauth_creds.json` 中的现有凭据
2. 如果找到有效凭据，脚本将以成功消息退出
3. 如果找到过期凭据，它将尝试自动刷新它们
4. 如果凭据不存在或刷新失败，它将启动新的认证流程

## 认证流程

启动新的认证流程时，您将看到类似以下的输出：

```
Starting Qwen authentication flow...
Initiating device flow...

=== Qwen OAuth Device Authorization ===
Please visit the following URL to authenticate:

https://chat.qwen.ai/device?user_code=XXXX-YYYY

Or scan the QR code below:
█████████████████████████████████████
█████████████████████████████████████
████ ▄▄▄▄▄ █▀█ █▄▄▄▄▄█ ▄ █ ▄▄▄▄▄ ████
████ █   █ █▀▀▀█ ▄▄▄ █▀ ▀▀▄█   █ ████
████ █▄▄▄█ █ ▄ █▄█▄█▄▀ ▀▄█▄█▄▄▄█ ████
████▄▄▄▄▄▄▄█▄█▄█▄█▄█▄█▄▄▄▄▄▄▄▄▄▄▄████
████ ▄▄▄▄▄ █▀▄▀▄ █ ▄██ ▄ ▀ ▀▄█▄▀█████
████ █   █ █ █ █▄█▀ ▀▀▀ ▀██ ▀██▄ ████
████ █▄▄▄█ █ ▄ ▀▄▀ ▄▀▄██▄▀ ▄ ▄██ ████
████▄▄▄▄▄▄▄█▄▄█▄▄▄▄██▄▄▄█▄██▄██▄▄████
█████████████████████████████████████
█████████████████████████████████████

User code: XXXX-YYYY
(Press Ctrl+C to cancel)

Browser opened automatically. If not, please visit the URL above.
```

## 认证选项

您有三种方式完成认证：

1. **QR Code Scanning**: Use your mobile device to scan the QR code displayed in the terminal
2. **Manual URL Entry**: Visit the displayed URL in any browser and enter the user code
3. **Automatic Browser Opening**: If supported, the script will automatically open your default browser to the authentication page

## 凭据存储

凭据存储在官方 `qwen-code` CLI 工具使用的相同位置：

- **Location**: `~/.qwen/oauth_creds.json`
- **Format**: Standard OAuth 2.0 token format with access token, refresh token, and expiration information
- **Security**: Tokens are stored locally and never transmitted to any third-party servers

## 优势

内置 QR 码认证系统提供几个优势：

- **No External Dependencies**: Authenticate without installing additional CLI tools
- **Mobile-Friendly**: QR codes make it easy to authenticate from your mobile device
- **Automatic Refresh**: Automatically refreshes expired tokens when possible
- **User-Friendly**: Clear instructions and real-time feedback throughout the process
- **Cross-Platform**: Works on all platforms that support terminal QR code display

## 故障排除

如果在认证过程中遇到问题：

1. **QR Code Not Displaying**: Ensure your terminal supports Unicode characters
2. **Browser Not Opening**: Manually visit the displayed URL in your browser
3. **Authentication Timeout**: Restart the authentication process with `npm run auth`
4. **Existing Credentials Issues**: Delete `~/.qwen/oauth_creds.json` and re-authenticate

有关 OAuth 2.0 设备授权流程的详细信息，请参见 [认证文档](./authentication.md)。