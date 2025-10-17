# 变更日志

所有对 Qwen OpenAI 兼容代理服务器的显著更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
该项目遵循 [语义化版本控制](https://semver.org/spec/v2.0.0.html)。

## [1.2.0] - 2025-10-17

### 新增
- Claude Code 优化的 Anthropic API 支持，带有 `/anthropic/v1` 端点
- 新的 `/anthropic/v1/messages` 端点用于 Anthropic API 兼容
- 新的 `/anthropic/v1/models` 端点返回 Anthropic 模型列表
- Anthropic 和 Qwen API 格式之间的完整转换系统
- Anthropic 模型到 Qwen 模型的模型映射
- Claude Code 优化的端点和功能
- 在同一服务器中支持 OpenAI 和 Anthropic 兼容 API
- Anthropic API 客户端的详细使用示例
- 为 Claude Code 配置优化的模型列表
- 新的测试脚本 `simple_qwen_test.py` 用于验证 OpenAI 和 Anthropic 端点
- Docker 配置中的卷挂载以持久化认证凭据

### 更改
- 所有项目文档翻译为中文
- README.md 完全本地化为中文内容
- 增强的多协议支持（OpenAI v1 和 Anthropic v1）
- 改进不同格式之间的 API 转换逻辑
- 更好的跨平台 API 调用错误处理
- 为 Claude Code 优化，移除 `/v2` 端点，仅保留 `/anthropic/v1` 端点
- 更新 docker-compose.yml 端口从 8080 到 8765
- 改进的认证管理，支持多账户的 OpenAI 和 Anthropic API
- 更新 QWEN.md 以反映项目架构变更
- 更新多个文档以反映新功能和变化

### 修复
- 文档文件中的翻译问题
- 主 README 中不完整的中文本地化
- 健康检查端点配置
- API 路由配置问题
- 修复了多账户管理相关的若干问题

## [1.1.0] - 2025-08-17

### 新增
- 多账户支持，具有自动轮换以克服每个账户每天 2,000 次请求的限制
- 持久化请求计数，服务器重启后仍然保留
- 账户管理命令：
  - `npm run auth:list` - 列出所有已配置的账户
  - `npm run auth:add <account-id>` - 添加新账户
  - `npm run auth:remove <account-id>` - 删除现有账户
  - `npm run auth:counts` - 检查所有账户的请求计数
- 粘性账户选择，而非轮询，以获得更好的一致性
- 使用 OAuth 2.0 设备授权流程和 PKCE 的内置 QR 码认证
- 认证流程中自动打开浏览器
- 流式响应支持，可通过 `STREAM` 环境变量进行配置切换
- 使用详细日志和 token 计数的增强调试
- 显示实时终端反馈：
  - 每个请求的 token 计数
  - 账户使用信息
  - 配额限制通知
  - 账户轮换状态
- 支持 `/v1/chat/completions` 端点
- 健康检查端点在 `/health`
- 所有功能的全面文档

### 更改
- 改进了令牌刷新机制，具有更好的错误处理
- 增强了错误消息，具有特定的配额超出通知
- 更新了认证流程，支持内置和官方 `qwen-code` CLI 方法
- 服务器启动现在显示可用账户及其状态

### 修复
- 令牌验证和刷新时间问题
- 账户轮换逻辑，使用粘性选择而非每个请求的轮询
- OAuth 2.0 设备授权流程中的各种认证边界情况

### 更改
- 所有项目文档翻译为中文
- README.md 完全本地化为中文内容
- 增强的多协议支持（OpenAI v1 和 Anthropic v1）
- 改进不同格式之间的 API 转换逻辑
- 更好的跨平台 API 调用错误处理
- 为 Claude Code 优化，移除 `/v2` 端点，仅保留 `/anthropic/v1` 端点

### 修复
- 文档文件中的翻译问题
- 主 README 中不完整的中文本地化

## [1.0.0] - 2025-08-13

### 新增
- 多账户支持，具有自动轮换以克服每个账户每天 2,000 次请求的限制
- 持久化请求计数，服务器重启后仍然保留
- 账户管理命令：
  - `npm run auth:list` - 列出所有已配置的账户
  - `npm run auth:add <account-id>` - 添加新账户
  - `npm run auth:remove <account-id>` - 删除现有账户
  - `npm run auth:counts` - 检查所有账户的请求计数
- 粘性账户选择，而非轮询，以获得更好的一致性
- 使用 OAuth 2.0 设备授权流程和 PKCE 的内置 QR 码认证
- 认证流程中自动打开浏览器
- 流式响应支持，可通过 `STREAM` 环境变量进行配置切换
- 使用详细日志和 token 计数的增强调试
- 显示实时终端反馈：
  - 每个请求的 token 计数
  - 账户使用信息
  - 配额限制通知
  - 账户轮换状态
- 支持 `/v1/chat/completions` 端点
- 健康检查端点在 `/health`
- 所有功能的全面文档

### 更改
- 改进了令牌刷新机制，具有更好的错误处理
- 增强了错误消息，具有特定的配额超出通知
- 更新了认证流程，支持内置和官方 `qwen-code` CLI 方法
- 服务器启动现在显示可用账户及其状态

### 修复
- 令牌验证和刷新时间问题
- 账户轮换逻辑，使用粘性选择而非每个请求的轮询
- OAuth 2.0 设备授权流程中的各种认证边界情况

## [0.1.0] - 2025-08-07

### 新增
- Qwen OpenAI 兼容代理服务器的初始发布
- 通过 OpenAI 兼容 API 端点对 Qwen 模型的基本代理功能
- 支持 `/v1/chat/completions` 端点
- 环境变量配置
- 通过 `qwen-code` CLI 工具对 Qwen 的基本认证

[1.2.0]: https://github.com/your-repo/qwen-openai-proxy/releases/tag/v1.2.0
[1.1.0]: https://github.com/your-repo/qwen-openai-proxy/releases/tag/v1.1.0
[1.0.0]: https://github.com/your-repo/qwen-openai-proxy/releases/tag/v1.0.0
[0.1.0]: https://github.com/your-repo/qwen-openai-proxy/releases/tag/v0.1.0