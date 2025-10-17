# Qwen OpenAI & Anthropic 兼容代理服务器 - 支持 opencode、crush、claude code router、roo code、cline 等大部分应用

一个通过 OpenAI 和 Anthropic 兼容 API 端点暴露 Qwen 模型的代理服务器。支持工具调用和流式传输。版本 1.2.1 增加了全面的安全和性能改进。

## 重要变更 (v1.2.1)
- **新增输入验证系统**：使用Joi库对所有API请求进行严格验证，防止恶意输入
- **安全增强**：集成helmet中间件，添加多种安全头，改进CORS配置
- **速率限制**：新增全面的速率限制功能，防止滥用
- **错误处理**：新增全面的错误处理和格式化系统
- **配置验证**：新增配置验证和版本管理功能
- **性能提升**：新增HTTP连接池管理，提高并发性能
- **监控指标**：新增Prometheus指标端点，便于系统监控
- **账户管理**：新增账户锁定机制和账户级速率限制，防止并发冲突
- **代码重构**：全面重构代码架构，采用更模块化的设计

## 重要说明

为了在生产环境中有更好的体验，您可以使用 CloudFlare Worker。查看仓库 https://github.com/aptdnfapt/qwen-worker-proxy

当使用 130,000 到 150,000 个或更多 token 的上下文时，用户可能会遇到错误或 504 网关超时问题。这似乎是 Qwen 模型的实际限制。Qwen 代码本身也倾向于在此限制下出现故障并卡住。

## 快速开始

### 选项 1: 使用 Docker (推荐)

1.  **配置环境**:
    ```bash
    cp .env.example .env
    # 编辑 .env 文件以配置所需设置
    ```

2.  **使用 Docker Compose 构建和运行**:
    ```bash
    docker-compose up -d
    ```

3.  **认证**:
    ```bash
    docker-compose exec qwen-proxy npm run auth:add <account>
    ```

4.  **使用代理**: 将您的 OpenAI 兼容客户端指向 `http://localhost:8765/v1`

### 选项 2: 本地开发

1.  **安装依赖**:
    ```bash
    npm install
    ```
2.  **认证**: 您需要与 Qwen 认证以生成所需的凭据文件。
    *   运行 `npm run auth:add <account>` 与您的 Qwen 账户认证
    *   这将创建代理服务器所需的 `~/.qwen/oauth_creds.json` 文件
    *   或者，您可以使用官方的 `qwen-code` CLI 工具 [QwenLM/qwen-code](https://github.com/QwenLM/qwen-code)
3.  **启动服务器**:
    ```bash
    npm start
    ```
4.  **使用代理**: 
    - 对于 OpenAI 兼容客户端，使用 `http://localhost:8765/v1`
    - 对于 Claude Code，使用 `http://localhost:8765/anthropic`

默认端口可在 `.env` 文件中通过 `PORT` 环境变量进行配置。

**注意**: API 密钥可以是任何随机字符串 - 对于此代理不重要。

## 多账户支持

代理支持多个 Qwen 账户以克服每个账户每天 2,000 次请求的限制。当达到配额限制时，账户会自动轮换。

### 设置多账户

**对于 Docker:**
```bash
docker-compose exec qwen-proxy npm run auth:list
docker-compose exec qwen-proxy npm run auth:add <account-id>
docker-compose exec qwen-proxy npm run auth:remove <account-id>
```

**对于本地开发:**
1. 列出已有账户:
   ```bash
   npm run auth:list
   ```

2. 添加新账户:
   ```bash
   npm run auth:add <account-id>
   ```
   将 `<account-id>` 替换为您的账户唯一标识符（例如 `account2`、`team-account` 等）

3. 删除账户:
   ```bash
   npm run auth:remove <account-id>
   ```

### 账户轮换工作原理

- 当您配置了多个账户时，代理将自动在它们之间轮换
- 每个账户每天有 2,000 次请求限制
- 当账户达到限制时，Qwen 的 API 将返回配额超出错误
- 代理检测到这些配额错误并自动切换到下一个可用账户
- 如果配置了 DEFAULT_ACCOUNT，代理将首先使用该账户，然后再轮换到其他账户
- 请求计数在本地跟踪并在 UTC 午夜每天重置
- 您可以使用以下命令检查所有账户的请求计数：
  ```bash
  npm run auth:counts
  ```

### 账户使用监控

代理在终端中提供实时反馈：
- 显示每个请求使用的账户
- 显示每个账户的当前请求计数
- 当因配额限制轮换账户时通知
- 指示轮换期间将尝试的下一个账户
- 显示服务器启动时配置的默认账户
- 在账户列表显示中标记默认账户

## 配置

代理服务器可以使用环境变量进行配置。在项目根目录创建 `.env` 文件或直接在环境中设置变量。

*   `LOG_FILE_LIMIT`: 保留的调试日志文件最大数量（默认：20）
*   `DEBUG_LOG`: 设置为 `true` 以启用调试日志（默认：false）
*   `STREAM`: 设置为 `true` 以启用流式响应（默认：false）
    *   **重要**: 使用需要流式响应的 opencode 或 crush 等工具时，将此设置为 `true`
*   `DEFAULT_ACCOUNT`: 指定代理默认应使用的账户（使用多账户设置时）
    *   应与使用 `npm run auth add <name>` 添加账户时使用的名称匹配
    *   如果未设置或无效，代理将使用第一个可用账户

示例 `.env` 文件：
```bash
# 只保留最新的 10 个日志文件
LOG_FILE_LIMIT=10

# 启用调试日志（将创建日志文件）
DEBUG_LOG=true

# 启用流式响应（默认禁用）
# opencode 和 crush 等工具需要
STREAM=true

# 指定默认使用的账户（使用多账户设置时）
# 应与使用 'npm run auth add <name>' 添加账户时使用的名称匹配
DEFAULT_ACCOUNT=my-primary-account
```

## 示例使用

### OpenAI 兼容 API

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'fake-key', // 不使用，但 OpenAI 客户端需要
  baseURL: 'http://localhost:8765/v1'
});

async function main() {
  const response = await openai.chat.completions.create({
    model: 'qwen3-coder-plus',
    messages: [
      { "role": "user", "content": "Hello!" }
    ]
  });

  console.log(response.choices[0].message.content);
}

main();
```

### Anthropic API (Claude Code 优化支持)

代理服务器为 Claude Code 进行了专门优化，支持所有最新功能。Claude Code 需要使用 `/anthropic/v1` 端点：

```bash
# Claude Code 配置
export ANTHROPIC_BASE_URL=http://localhost:8765/anthropic
export ANTHROPIC_API_KEY=your-fake-api-key
```

代理服务器支持以下针对 Claude Code 优化的模型：

- `claude-3-5-sonnet-latest`
- `claude-sonnet-4-5-20250929`
- `claude-haiku-4-5-20251001`
- `claude-3-5-sonnet-latest-vision` (视觉模型)
- `claude-sonnet-4-5-20250929-vision` (视觉模型)

### Claude Code 配置说明

如果您只使用 Claude Code，我们提供了一个精简版本，仅包含 Claude Code 需要的端点和模型。要使用这个优化版本：

1. 确保您使用的是仅保留 `/anthropic/v1` 端点的配置
2. 所有 API 通信将通过 `http://localhost:8765/anthropic` 端点处理
3. 模型列表已精简，只包含 Claude Code 2.0+ 版本会使用的模型

有关完整配置指南，请参阅 [Claude Code 配置指南](docs/claude_code_cli_setup.md)。

## 支持的模型

代理通过 OpenAI 兼容端点支持以下 Qwen 模型：

*   `qwen3-coder-plus` - 具有增强功能的主要编码模型
*   `qwen3-coder-flash` - 更快、更轻量的编码模型，用于快速响应
*   `vision-model` - 具有图像处理能力的多模态模型

此外，代理通过 `/anthropic/v1` 端点支持 Anthropic 模型名称，它们会自动映射到适当的 Qwen 模型：

*   `claude-3-5-sonnet-latest` → `qwen3-coder-plus`
*   `claude-sonnet-4-5-20250929` → `qwen3-coder-plus`
*   `claude-haiku-4-5-20251001` → `qwen3-coder-flash`
*   `claude-3-5-sonnet-latest-vision` → `vision-model`
*   `claude-sonnet-4-5-20250929-vision` → `vision-model`

**注意**: 配置客户端应用程序时，请使用上面显示的确切模型名称。

## 支持的端点

*   `POST /v1/chat/completions`
*   `GET /v1/models`
*   `POST /anthropic/v1/messages` (Claude Code CLI 优化)
*   `GET /anthropic/v1/models` (Claude Code CLI 优化)


## 工具调用支持

此代理服务器支持工具调用功能，允许您将其与 opencode、crush、roo、cline、kilo 等工具一起使用。

### opencode 配置

要与 opencode 一起使用，请将以下内容添加到 `~/.config/opencode/opencode.json`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "myprovider": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "proxy",
      "options": {
        "baseURL": "http://localhost:8765/v1"
      },
      "models": {
        "qwen3-coder-plus": {
          "name": "qwen3"
        }
      }
    }
  }
}
```

**注意**: 要使 opencode 与流式响应正常工作，您需要通过在 `.env` 文件中设置 `STREAM=true` 来在代理服务器中启用流式传输。

### crush 配置

要与 crush 一起使用，请将以下内容添加到 `~/.config/crush/crush.json`：

```json
{
  "$schema": "https://charm.land/crush.json",
  "providers": {
    "proxy": {
      "type": "openai",
      "base_url": "http://localhost:8765/v1",
      "api_key": "",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus",
          "cost_per_1m_in": 0.0,
          "cost_per_1m_out": 0.0,
          "cost_per_1m_in_cached": 0,
          "cost_per_1m_out_cached": 0,
          "context_window": 150000,
          "default_max_tokens": 64000
        }
      ]
    }
  }
}
```

**注意**: 要使 crush 与流式响应正常工作，您需要通过在 `.env` 文件中设置 `STREAM=true` 来在代理服务器中启用流式传输。

### Claude code Router
```json
{
  "LOG": false,
  "Providers": [
    {
      "name": "qwen-code",
      "api_base_url": "http://localhost:8765/v1/chat/completions/",
      "api_key": "wdadwa-random-stuff",
      "models": ["qwen3-coder-plus"],
      "transformer": {
        "use": [
          [
            "maxtoken",
            {
              "max_tokens": 65536
            }
          ],
          "enhancetool",
          "cleancache"
        ]
      }
    }
  ],
  "Router": {
    "default": "qwen-code,qwen3-coder-plus"
  }
}
```

### Roo Code、Kilo Code 和 Cline 配置

要与 Roo Code、Kilo Code 或 Cline 一起使用：

1. 在客户端中转到设置
2. 选择 OpenAI 兼容选项
3. 将 URL 设置为：`http://localhost:8765/v1`
4. 使用随机 API 密钥（不重要）
5. 精确输入或选择模型名称：`qwen3-coder-plus`
6. 对于 Roo Code 或 Kilo Code，在复选框中禁用流式传输
7. 将最大输出设置从 -1 更改为 65000
8. 您可以将上下文窗口大小更改为大约 300k 左右，但在 150k 之后会变慢，所以请注意。

## Token 计数

代理现在在终端中显示每个请求的 token 计数，显示输入 token 和 API 返回的使用统计信息（提示、完成和总 token）。

## Token 使用追踪

代理包含全面的 token 使用追踪，监控所有账户的每日输入和输出 token 消耗。使用以下任一命令查看详细的 token 使用报告：

```bash
npm run auth:tokens
```

或

```bash
npm run tokens
```

两个命令都显示一个清晰的表格，显示每日 token 使用趋势、生命周期总计和请求计数。更多信息，请参见 `docs/token-usage-tracking.md`。

有关更详细的文档，请参见 `docs/` 目录。

有关配置默认账户的信息，请参见 `docs/default-account.md`。
