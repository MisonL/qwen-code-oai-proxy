# Qwen Code OpenAI/Anthropic 代理服务器项目上下文

## 项目概述
本项目是一个 Qwen 到 OpenAI/Anthropic API 代理服务器，允许用户使用 OpenAI 兼容端点或 Anthropic 兼容端点（特别是 Claude Code 优化）与 Qwen 的 API 进行交互。主要功能包括：
- 多账户支持，具有自动轮换以处理请求配额
- QR 码认证流程
- Claude Code 优化的 Anthropic 兼容端点
- 流式响应支持
- Token 计数和管理
- 详细的调试日志功能

## 架构概览
- `src/` - 代理服务器的主源代码
  - `src/index.js` - Express 服务器主入口点，包含 OpenAI 和 Anthropic 兼容路由
  - `src/qwen/` - Qwen 特定的 API 和认证逻辑
  - `src/anthropic/` - Anthropic API 兼容逻辑和模型转换
  - `src/utils/` - 实用功能，如日志记录和 token 计数
- `docs/` - 功能的详细文档
  - 特别是 `docs/claude_code_cli_setup.md` 包含 Claude Code 配置指南
- `authenticate.js` - 账户管理的 CLI 工具
- `tokens.js` - Token 使用追踪工具
- `simple_qwen_test.py` - 端点测试脚本

## 主要功能和 API 端点
- **OpenAI 兼容端点**:
  - `POST /v1/chat/completions`
  - `GET /v1/models`
- **Claude Code 优化 Anthropic 端点**:
  - `POST /anthropic/v1/messages`
  - `GET /anthropic/v1/models`
- **其他端点**:
  - `GET /health` - 服务器健康检查
  - `POST /auth/initiate` 和 `POST /auth/poll` - 认证流程

## 配置和环境变量
- `PORT` - 服务器端口 (默认 8765)
- `STREAM` - 启用流式响应 (默认 false)
- `DEFAULT_ACCOUNT` - 默认使用账户
- `DEBUG_LOG` - 启用调试日志 (默认 false)

## 构建和运行
1. **Docker 部署 (推荐)**:
   ```bash
   # 构建并启动
   docker-compose up -d
   # 认证账户
   node authenticate.js
   ```

2. **本地开发**:
   ```bash
   npm install
   npm start
   # 或使用 nodemon 进行开发
   npm run dev
   ```

## Claude Code 专用配置
该项目已专为 Claude Code 进行优化，仅提供 `/anthropic/v1/` 端点，并精简了支持的模型列表：
- `claude-3-5-sonnet-latest`
- `claude-sonnet-4-5-20250929`
- `claude-haiku-4-5-20251001`
- `claude-3-5-sonnet-latest-vision` (视觉模型)
- `claude-sonnet-4-5-20250929-vision` (视觉模型)

Claude Code 使用以下配置：
```bash
export ANTHROPIC_BASE_URL=http://localhost:8765/anthropic
export ANTHROPIC_API_KEY=your-fake-api-key
```

## 账户管理
- 添加账户: `npm run auth:add <account-id>`
- 列出账户: `npm run auth:list`
- 删除账户: `npm run auth:remove <account-id>`
- 检查请求计数: `npm run auth:counts`
- 检查 token 使用: `npm run tokens`

## 测试和验证
- 使用 `simple_qwen_test.py` 验证所有端点的工作情况
- 健康检查: `curl http://localhost:8765/health`
- 模型列表: `curl http://localhost:8765/v1/models` 或 `curl http://localhost:8765/anthropic/v1/models`

## 开发惯例
- 所有新功能应使用专用 markdown 文件记录在 `docs/` 文件夹中
- 修改现有功能时更新现有文档
- 关键面向用户的变化也应反映在主 `README.md` 中
- 架构和实现细节应记录在 `docs/codebase_analysis.md` 中