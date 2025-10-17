# 默认账户配置

## 概述

Qwen OpenAI 代理支持配置默认账户，以在有多个账户可用时使用。此功能允许您指定在达到配额限制并轮换到其他账户之前应首先使用哪个账户。

## 配置

要配置默认账户，请在您的 `.env` 文件中设置 `DEFAULT_ACCOUNT` 环境变量：

```bash
# 指定默认使用的账户（使用多账户设置时）
# 应与使用 'npm run auth add <name>' 添加账户时使用的名称匹配
DEFAULT_ACCOUNT=my-primary-account
```

## 工作原理

1. 代理启动时，检查是否配置了 `DEFAULT_ACCOUNT`
2. 如果设置了默认账户且它存在于可用账户列表中，则将首先使用它
3. 如果没有设置默认账户或指定的账户不存在，代理将使用第一个可用账户
4. 达到配额限制并发生账户轮换时，代理将轮换到列表中的下一个账户
5. 在后续服务器重启时，默认账户将再次首先被使用

## 优势

- **Priority Usage**: Ensure your preferred account is used first
- **Consistent Behavior**: Predictable account selection across server restarts
- **Easy Management**: Simple configuration through environment variables
- **Backward Compatible**: Works with existing multi-account setups

## 示例使用

1. 添加多个账户：
   ```bash
   npm run auth:add primary
   npm run auth:add secondary
   npm run auth:add backup
   ```

2. 配置您的 `.env` 文件：
   ```bash
   DEFAULT_ACCOUNT=primary
   ```

3. 启动代理：
   ```bash
   npm start
   ```

4. 代理将在启动时显示配置为默认的账户：
   ```
   配置的默认账户：primary
   ```

5. 在账户列表中，默认账户将被标记：
   ```
   可用账户：
     primary (默认): ✅ 有效
     secondary: ✅ 有效
     backup: ✅ 有效
   ```

6. 进行请求时，代理将指示正在使用的账户：
   ```
   使用账户 primary (今天第1个请求)
   ```

## 日志记录

代理提供关于账户使用的清晰反馈：

- 服务器启动时，显示配置的默认账户
- 在账户列表中，标记哪个账户是默认的
- 请求处理期间，显示正在使用的账户
- 账户轮换时，指示将尝试的下一个账户

## 注意事项

- DEFAULT_ACCOUNT` 值必须与使用 `npm run auth add <name>` 添加账户时使用的名称完全匹配
- 如果指定的默认账户不存在或无效，代理将回退到使用第一个可用账户
- 默认账户功能仅影响初始账户选择；达到配额时轮换行为保持不变