# Qwen 项目上下文用于 AI 交互

## 项目概述
必须首先阅读 ./docs/README.md 以了解项目目标。qwen-code cli 目录是 ./qwen-code。它被添加到 git ignore 中以避免推送到 github。
本项目是一个 Qwen 到 OpenAI/Anthropic API 代理服务器，允许用户使用 OpenAI 兼容端点或 Anthropic 兼容端点（特别是为 Claude Code 优化）与 Qwen 的 API 进行交互。主要功能包括：
- 多账户支持，具有自动轮换以处理请求配额
- QR 码认证流程
- Claude Code 优化的 Anthropic API 支持
- 流式响应支持
- Token 计数和管理
- 详细的调试日志功能

## 文档实践
- 所有新功能应使用专用 markdown 文件记录在 `docs/` 文件夹中
- 修改现有功能时更新现有文档
- 关键面向用户的变化也应该反映在主 `README.md` 中
- 架构和实现细节应记录在 `docs/codebase_analysis.md` 中

## 变更日志实践
- 在提交消息中维护高级功能变更日志
- 对于详细的技术更改，运行这些命令来分析最近的修改：

```bash
# 当前仓库状态
git status --porcelain

# 最近的提交（最后 10 个）
git log --oneline -10

# 详细的最近更改
git log --since="1 周前" --pretty=format:"%h - %an, %ar : %s" --stat

# 最近更改的文件
git diff HEAD~5 --name-only | head -20

# 新增的文件
git diff --name-status HEAD~10 | grep "^A" | head -15

# 删除的文件
git diff --name-status HEAD~10 | grep "^D" | head -10

# 修改的核心文件
git diff --name-status HEAD~10 | grep "^M" | grep -E "(package\.json|README|config|main|index|app)" | head -10
```

## 最近项目状态说明
- 文档通常维护良好，主要功能都有专用文件
- 最近的开发重点是多账户管理和流式传输改进
- 项目有良好的测试套件，包含简单和复杂的测试脚本
- 配置通过环境变量处理，并提供示例配置
- 认证已通过 QR 码支持和账户管理命令得到增强

## 项目结构
- `src/` - 代理服务器的主源代码
- `docs/` - 功能的详细文档
- `authenticate.js` - 账户管理的 CLI 工具
- `src/qwen/` - Qwen 特定的 API 和认证逻辑
- `src/utils/` - 实用功能，如日志记录和 token 计数
- `qwen-code/` - 这是 qwen-code cli 源代码的目录。当用户要求查看 qwen cli 的源代码时，请阅读此目录。
