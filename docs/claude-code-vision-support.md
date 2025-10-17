# Claude Code 图像识别支持指南

本指南将帮助您配置 Qwen OpenAI 兼容代理服务器，使其支持 Claude Code 的图像识别功能。

## 支持的视觉模型

我们的代理服务器现在支持以下视觉模型：

1. **Claude 3.7 系列**:
   - `claude-3-7-sonnet-latest-vision`

2. **Claude 3.5 系列**:
   - `claude-3-5-sonnet-latest-vision`

3. **Claude Sonnet 4.5 系列**:
   - `claude-sonnet-4-5-20250929-vision`

## Claude Code 图像识别配置

### 1. Claude Code 桌面应用配置

在 Claude Code 桌面应用中，您可以使用以下配置来启用图像识别：

```json
{
  "providers": [
    {
      "name": "qwen-proxy",
      "api_base_url": "http://localhost:8765/anthropic/v1/messages",
      "api_key": "any-random-string",
      "models": [
        "claude-3-7-sonnet-latest-vision",
        "claude-3-5-sonnet-latest-vision",
        "claude-sonnet-4-5-20250929-vision"
      ],
      "headers": {
        "anthropic-version": "2023-06-01"
      }
    }
  ]
}
```

### 2. Claude Code CLI 配置

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
        "claude-3-7-sonnet-latest-vision": {
          "name": "vision-model"
        },
        "claude-3-5-sonnet-latest-vision": {
          "name": "vision-model"
        }
      }
    }
  }
}
```

## Claude Code 图像识别使用示例

### 1. 基本文本询问

```python
import requests
import json

# 基本文本询问视觉模型
payload = {
    "model": "claude-3-7-sonnet-latest-vision",
    "max_tokens": 1024,
    "messages": [
        {
            "role": "user", 
            "content": "What can you do with images? Please explain in detail."
        }
    ]
}

headers = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01"
}

response = requests.post(
    "http://localhost:8765/anthropic/v1/messages",
    json=payload,
    headers=headers
)

if response.status_code == 200:
    result = response.json()
    print(result['content'][0]['text'])
```

### 2. 图像识别请求

```python
import requests
import base64

# 图像识别请求
def encode_image(image_path):
    """将图像编码为 base64"""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

# 假设您有一个图像文件 "sample.jpg"
# image_data = encode_image("sample.jpg")

# 注意：图像必须满足最小尺寸要求（高度或宽度必须大于10像素）
payload = {
    "model": "claude-3-7-sonnet-latest-vision",
    "max_tokens": 1024,
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Please describe what you see in this image:"
                },
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": "BASE64_ENCODED_IMAGE_DATA_HERE"
                    }
                }
            ]
        }
    ]
}

headers = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01"
}

response = requests.post(
    "http://localhost:8765/anthropic/v1/messages",
    json=payload,
    headers=headers
)

if response.status_code == 200:
    result = response.json()
    print(result['content'][0]['text'])
```

### 3. Claude Code 桌面应用使用示例

在 Claude Code 桌面应用中，您可以直接拖放图像文件到聊天界面，Claude Code 将自动处理图像编码和请求。

```javascript
// 在 Claude Code 桌面应用中使用 JavaScript SDK
import { Anthropic } from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: 'fake-key',
  baseURL: 'http://localhost:8765/anthropic/v1',
  headers: {
    'anthropic-version': '2023-06-01'
  }
});

async function analyzeImage(imageBase64) {
  const message = await anthropic.messages.create({
    model: 'claude-3-7-sonnet-latest-vision',
    max_tokens: 1024,
    messages: [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Analyze this image and provide a detailed description:"
          },
          {
            "type": "image",
            "source": {
              "type": "base64",
              "media_type": "image/jpeg",
              "data": imageBase64
            }
          }
        ]
      }
    ]
  });

  return message.content[0].text;
}
```

## 图像识别要求和限制

### 1. 图像尺寸要求

- **最小尺寸**: 图像的高度或宽度必须大于10像素
- **推荐尺寸**: 至少 100x100 像素以获得更好的识别效果
- **最大尺寸**: 根据 Qwen 模型限制（通常为几千像素）

### 2. 支持的图像格式

- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif) - 仅第一帧
- WebP (.webp)

### 3. 文件大小限制

- 单个图像文件大小限制取决于 Qwen API 限制
- 建议图像文件大小不超过 5MB

## 故障排除

### 1. 常见问题

**问题**: 图像识别请求失败，提示图像尺寸不符合要求
**解决方案**: 
- 确保图像高度或宽度大于10像素
- 使用图像编辑软件调整图像尺寸

**问题**: 图像识别响应很慢
**解决方案**:
- 使用较小尺寸的图像
- 确保网络连接稳定
- 检查 Qwen 账户配额

**问题**: 模型不支持图像输入
**解决方案**:
- 确保使用视觉模型（*-vision 后缀）
- 检查模型名称拼写

### 2. 调试技巧

查看代理服务器日志以获取更多信息：

```bash
# 查看 Docker 容器日志
docker compose logs -f

# 或者如果启用了调试日志
tail -f debug/*.log
```

## 性能优化建议

### 1. 图像预处理

在发送图像之前进行预处理以提高性能：

```python
from PIL import Image
import io
import base64

def preprocess_image(image_path, max_size=(1024, 1024)):
    """预处理图像以优化大小和质量"""
    with Image.open(image_path) as img:
        # 调整图像大小
        img.thumbnail(max_size, Image.Resampling.LANCZOS)
        
        # 转换为 RGB（如果需要）
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # 保存为 JPEG 格式以减小文件大小
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=85, optimize=True)
        return base64.b64encode(buffer.getvalue()).decode('utf-8')
```

### 2. 批量处理

对于大量图像处理请求，考虑使用批处理：

```python
import asyncio
import aiohttp

async def process_images_batch(image_paths):
    """批量处理图像"""
    tasks = []
    for image_path in image_paths:
        task = asyncio.create_task(process_single_image(image_path))
        tasks.append(task)
    
    results = await asyncio.gather(*tasks)
    return results
```

## 结论

通过以上配置，您的 Qwen OpenAI 兼容代理服务器现已完全支持 Claude Code 的图像识别功能。您可以享受与官方 Claude API 相同的图像处理体验，同时使用 Qwen 视觉模型的强大功能。

Claude Code 用户现在可以直接在桌面应用中使用图像识别功能，包括：
- 拖放图像进行分析
- 图像内容描述
- OCR（光学字符识别）
- 图像中的对象识别
- 图表和图形分析

这为 Claude Code 用户提供了完整的多模态 AI 体验。