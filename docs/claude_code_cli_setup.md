# Claude Code 配置指南

本文档介绍如何配置 Claude Code 使用本代理服务器。

## 环境要求

- 已安装 Claude Code
- 已启动本代理服务器的 Docker 容器
- 已完成 Qwen 账户认证

## Docker 部署

确保代理服务器已通过 Docker 启动：

```bash
docker compose up -d
```

## Claude Code CLI 配置

### 1. 环境变量配置

在使用 Claude Code 前，设置以下环境变量：

```bash
export ANTHROPIC_BASE_URL=http://localhost:8765/anthropic
export ANTHROPIC_API_KEY=your-fake-api-key
```

或者将这些配置添加到您的 shell 配置文件中（如 `.bashrc`、`.zshrc`）：

```bash
echo 'export ANTHROPIC_BASE_URL=http://localhost:8765/anthropic' >> ~/.bashrc
echo 'export ANTHROPIC_API_KEY=your-fake-api-key' >> ~/.bashrc
source ~/.bashrc
```

### 2. 验证配置

启动 Claude Code 并验证连接：

```bash
claude
```

## 支持的模型

本代理服务器专为 Claude Code CLI 优化，仅提供以下模型：

### 文本模型
- `claude-3-5-sonnet-latest`
- `claude-sonnet-4-5-20250929`
- `claude-haiku-4-5-20251001`

### 视觉模型
- `claude-3-5-sonnet-latest-vision`
- `claude-sonnet-4-5-20250929-vision`

## 认证说明

- 代理服务器使用 Qwen 账户进行实际的 API 调用
- Claude Code 仅需要连接到此代理，认证由代理处理
- 请确保已使用 `node authenticate.js` 完成 Qwen 账户认证

## 故障排除

### 如果遇到认证错误：
1. 确认已运行 `node authenticate.js` 并完成认证
2. 确认 Docker 容器正在运行
3. 重启 Claude Code CLI

### 检查代理服务器状态：
```bash
curl http://localhost:8765/health
```

### 检查可用模型：
```bash
curl -X GET http://localhost:8765/anthropic/v1/models \
  -H "x-api-key: sk-fake-key"
```

## 停止服务

当您不再需要服务时，可以通过以下命令停止：

```bash
docker compose down
```