# Token 使用追踪

## 概述

Qwen OpenAI 代理现在包含全面的 token Usage Tracking功能，监控和报告所有账户和请求类型的输入和输出 token 消耗。

## 功能

- **Daily Token Tracking**: Records input tokens (prompt) and output tokens (completion) for each day
- **Multi-Account Support**: Aggregates token usage across all configured accounts
- **Streaming & Regular Requests**: Tracks tokens from both streaming and non-streaming API responses
- **Persistent Storage**: Token usage data is stored locally in `~/.qwen/request_counts.json`
- **Clean Terminal Display**: Beautiful table-based reporting with `npm run auth:tokens`

## 工作原理

### 数据收集
1. **Regular Requests**: Token usage is extracted from the `usage` field in API responses
2. **Streaming Requests**: Token usage is captured from the final chunk of streaming responses
3. **Daily Aggregation**: 使用 is automatically grouped by date and account

### 数据存储
Token 使用数据与请求计数一起存储在现有的 `request_counts.json` 文件中：
```json
{
  "lastResetDate": "2025-08-22",
  "requests": {
    "default": 45,
    "account2": 82
  },
  "tokenUsage": {
    "default": [
      {"date": "2025-08-20", "inputTokens": 12500, "outputTokens": 8300},
      {"date": "2025-08-21", "inputTokens": 15200, "outputTokens": 9100}
    ]
  }
}
```

## 使用

### View Token Usage Report

您可以使用以下任一命令查看 token usage report：

```bash
npm run auth:tokens
```

or

```bash
npm run tokens
```

两个命令都显示一个清晰的表格，显示：
- 每日输入 token、输出 token 和总计
- 总体生命周期总计
- 总请求计数

### 示例输出
```
📊 Qwen Token Usage Report
═══════════════════════════════════════════════════════════════════════════════

┌────────────┬───────────────┬────────────────┬───────────────┐
│ Date       │ Input Tokens  │ Output Tokens  │ Total Tokens  │
├────────────┼───────────────┼────────────────┼───────────────┤
│ 2025-08-20 │ 12,500        │ 8,300          │ 20,800        │
│ 2025-08-21 │ 15,200        │ 9,100          │ 24,300        │
│ 2025-08-22 │ 8,750         │ 5,400          │ 14,150        │
├────────────┼───────────────┼────────────────┼───────────────┤
│ TOTAL      │ 36,450        │ 22,800         │ 59,250        │
└────────────┴───────────────┴────────────────┴───────────────┘

Total Requests: 127
```

## 技术实现

### 核心组件
- **QwenAPI Class**: Enhanced with token tracking methods
- **tokens.js**: Terminal display script with table formatting
- **cli-table3**: npm package for beautiful terminal tables

### 关键方法
- `recordToken使用(accountId, inputTokens, outputTokens)`: Records daily token usage
- `loadRequestCounts()` / `saveRequestCounts()`: Handle persistent storage
- 每日聚合自动合并所有账户的数据

## 依赖项
- `cli-table3`: Terminal table formatting (automatically installed)

## 数据隐私
所有 token usage data本地存储，从不对外传输。系统仅追踪使用统计以供您自己的监控和预算目的。