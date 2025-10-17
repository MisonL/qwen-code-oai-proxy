/**
 * Anthropic 模型列表
 * 定义代理支持的 Anthropic 模型（仅保留 Claude Code 2.0+ 版本会用到的）
 */

const anthropicModels = [
  {
    id: 'claude-3-5-sonnet-latest',
    created: 1754686206,
    owned_by: 'anthropic'
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    created: 1754686206,
    owned_by: 'anthropic'
  },
  {
    id: 'claude-haiku-4-5-20251001',
    created: 1754686206,
    owned_by: 'anthropic'
  },
  // 视觉模型
  {
    id: 'claude-3-7-sonnet-latest-vision',
    created: 1754686206,
    owned_by: 'anthropic'
  },
  {
    id: 'claude-3-5-sonnet-latest-vision',
    created: 1754686206,
    owned_by: 'anthropic'
  },
  {
    id: 'claude-sonnet-4-5-20250929-vision',
    created: 1754686206,
    owned_by: 'anthropic'
  }
];

module.exports = { anthropicModels };