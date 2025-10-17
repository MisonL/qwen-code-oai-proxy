# Claude Code 兼容性配置指南

本指南将帮助您配置 Qwen OpenAI 兼容代理服务器，使其与 Claude Code 完全兼容。

## 支持的 Claude Code 功能

我们的代理服务器支持以下 Claude Code 功能：

1. **完整模型兼容性**:
   - `claude-3-7-sonnet-latest` (最新 Sonnet 模型)
   - `claude-3-7-sonnet-20250219` (指定版本 Sonnet 模型)
   - `claude-sonnet-4-5-20250929` (Claude Code 新模型)
   - `claude-3-5-sonnet-latest` (经典 Sonnet 模型)
   - `claude-opus-4-1-20250805` (最新 Opus 模型)
   - `claude-haiku-4-5-20251001` (最新 Haiku 模型)

2. **API 版本支持**:
   - `anthropic-version: 2023-06-01` (标准版本)
   - 支持所有最新 API 特性

3. **请求参数兼容性**:
   - `max_tokens` (最大输出 token 数)
   - `temperature` (温度控制)
   - `top_p` (核采样)
   - `top_k` (Top-K 采样)
   - `stop_sequences` (停止序列)
   - `stream` (流式传输)
   - `system` (系统消息)
   - `metadata` (元数据)
   - `service_tier` (服务层级)

4. **响应格式**:
   - 标准 Anthropic 响应格式
   - `content` blocks 支持
   - `usage` 统计信息
   - `stop_reason` 结束原因
   - `thinking` 扩展思考支持

## Claude Code 2.0+ 配置

### 1. 环境变量配置

在您的 `.env` 文件中确保以下配置：

```bash
# 服务器配置
PORT=8765
HOST=0.0.0.0

# 启用流式传输 (Claude Code 强烈推荐)
STREAM=true

# 调试日志 (可选)
DEBUG_LOG=true
LOG_FILE_LIMIT=20
```

### 2. Claude Code 桌面应用配置

在 Claude Code 桌面应用中，您可以使用以下配置：

```json
{
  "providers": [
    {
      "name": "qwen-proxy",
      "api_base_url": "http://localhost:8765/anthropic/v1/messages",
      "api_key": "any-random-string", // Claude Code 不验证此字段
      "models": [
        "claude-3-7-sonnet-latest",
        "claude-sonnet-4-5-20250929",
        "claude-opus-4-1-20250805",
        "claude-haiku-4-5-20251001"
      ],
      "headers": {
        "anthropic-version": "2023-06-01"
      }
    }
  ]
}
```

### 3. Claude Code CLI 配置

如果您使用 Claude Code CLI，可以创建以下配置文件：

```bash
# ~/.claude/config.json
{
  "default_provider": "qwen-proxy",
  "providers": {
    "qwen-proxy": {
      "type": "anthropic",
      "base_url": "http://localhost:8765/anthropic/v1",
      "api_key": "any-random-string",
      "models": {
        "claude-3-7-sonnet-latest": {
          "name": "qwen3-coder-plus"
        },
        "claude-sonnet-4-5-20250929": {
          "name": "qwen3-coder-plus"
        }
      }
    }
  }
}
```

## Claude Code 新特性支持

### 1. 扩展思考功能 (Thinking)

Claude Code 引入了扩展思考功能，我们的代理服务器支持：

```python
import requests

# 启用扩展思考的请求示例
payload = {
    "model": "claude-3-7-sonnet-latest",
    "max_tokens": 1024,
    "messages": [
        {"role": "user", "content": "Solve this complex math problem step by step."}
    ],
    "thinking": {
        "enabled": True,
        "depth": "deep"  # 控制思考深度
    }
}

response = requests.post(
    "http://localhost:8765/anthropic/v1/messages",
    json=payload,
    headers={
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
    }
)
```

### 2. 服务层级 (Service Tier)

支持不同的服务层级以满足不同性能需求：

```python
# 标准层级 (默认)
payload = {
    "model": "claude-3-7-sonnet-latest",
    "service_tier": "standard",
    "max_tokens": 1024,
    "messages": [...]
}

# 高性能层级
payload = {
    "model": "claude-3-7-sonnet-latest",
    "service_tier": "premium",
    "max_tokens": 1024,
    "messages": [...]
}
```

## Claude Code 测试验证

您可以使用以下脚本验证兼容性：

```python
import requests
import json

def test_claude_code():
    """测试 Claude Code 兼容性"""
    
    # 测试模型列表
    response = requests.get("http://localhost:8765/anthropic/v1/models")
    models = response.json()
    print("支持的模型:")
    for model in models['data']:
        print(f"  - {model['id']}")
    
    # 测试消息端点
    payload = {
        "model": "claude-3-7-sonnet-latest",
        "max_tokens": 150,
        "messages": [
            {"role": "user", "content": "Hello from Claude Code!"}
        ]
    }
    
    response = requests.post(
        "http://localhost:8765/anthropic/v1/messages",
        json=payload,
        headers={
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01"
        }
    )
    
    if response.status_code == 200:
        result = response.json()
        print("响应内容:")
        print(result['content'][0]['text'])
        return True
    else:
        print(f"错误: {response.status_code}")
        print(response.text)
        return False

if __name__ == "__main__":
    test_claude_code()
```

## 故障排除

### 1. 常见问题

**问题**: Claude Code 无法连接到代理服务器
**解决方案**: 
- 确保代理服务器正在运行 (`docker-compose up -d`)
- 检查端口是否正确 (默认 8765)
- 验证防火墙设置

**问题**: 模型不被识别
**解决方案**:
- 使用支持的模型名称之一
- 确保请求头中包含 `anthropic-version: 2023-06-01`

**问题**: 流式传输不工作
**解决方案**:
- 确保 `.env` 文件中设置了 `STREAM=true`
- 检查 Claude Code 配置中的流式设置

### 2. 调试技巧

启用调试日志以获取更多信息：

```bash
# 在 .env 文件中添加
DEBUG_LOG=true
LOG_FILE_LIMIT=50
```

查看日志文件:
```bash
tail -f debug/*.log
```

## 性能优化建议

1. **多账户轮换**:
   配置多个 Qwen 账户以提高请求限额:
   ```bash
   npm run auth:add account1
   npm run auth:add account2
   ```

2. **缓存优化**:
   启用提示缓存以减少重复计算:
   ```python
   payload = {
       "model": "claude-3-7-sonnet-latest",
       "cache_control": {"type": "ephemeral"},
       # ... 其他参数
   }
   ```

3. **批量请求**:
   对于大量请求，考虑使用批处理以提高效率。

## 结论

通过以上配置，您的 Qwen OpenAI 兼容代理服务器现已完全兼容 Claude Code 的所有功能，包括最新的模型支持、API 特性和扩展功能。您可以享受与官方 Claude API 相同的体验，同时使用 Qwen 模型的强大功能。