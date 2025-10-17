# Qwen API 代理中的温度设置

Qwen API 代理支持 `temperature` 参数以控制模型响应的随机性，遵循 OpenAI API 标准。

## 温度如何工作

温度是控制模型输出随机性的参数：
- **Lower values (e.g., 0.1)**: Make the model more deterministic and predictable
- **Higher values (e.g., 0.9)**: Make the model more random and creative
- **Default value**: 1.0 (if not specified)

## 支持的范围

Qwen API 代理接受以下范围内的温度值：
- **Minimum**: 0.0 (most deterministic)
- **Maximum**: 2.0 (most random)
- **Default**: 1.0

## 如何使用温度

### 在 API 请求中

在您的 OpenAI 兼容请求中包含 `temperature` 参数：

```json
{
  "model": "qwen3-coder-plus",
  "messages": [
    {
      "role": "user",
      "content": "Write a creative story about a robot."
    }
  ],
  "temperature": 0.7
}
```

### 示例请求

1. **Deterministic response** (temperature = 0.1):
```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-coder-plus",
    "messages": [{"role": "user", "content": "What is 2+2?"}],
    "temperature": 0.1
  }'
```

2. **Balanced creativity** (temperature = 0.7):
```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-coder-plus",
    "messages": [{"role": "user", "content": "Write a short poem"}],
    "temperature": 0.7
  }'
```

3. **High creativity** (temperature = 1.5):
```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-coder-plus",
    "messages": [{"role": "user", "content": "Invent a new color and describe it"}],
    "temperature": 1.5
  }'
```

## 实现细节

温度参数直接传递到 Qwen API 而不进行修改：

1. 客户端向代理发送带有温度参数的请求
2. 代理将温度参数转发到 Qwen API
3. Qwen API 使用温度值控制响应随机性
4. 响应通过代理返回给客户端

这在利用 Qwen 的原生温度控制的同时保持与 OpenAI API 标准的完全兼容性。

## 最佳实践

- Use **low temperature** (0.1-0.3) for factual responses, code generation, or when consistency is important
- Use **medium temperature** (0.4-0.7) for balanced responses that are both creative and coherent
- Use **high temperature** (0.8-1.5) for creative writing, brainstorming, or when you want varied responses
- Avoid **very high temperature** (>1.5) as it may produce incoherent outputs

## 测试温度效果

您可以使用提供的测试脚本测试温度效果：
```bash
node tmp-test/test-temperature-comprehensive.js
```

此脚本演示不同温度值如何产生不同水平的响应变异性。