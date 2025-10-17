const client = require('prom-client');

/**
 * 指标收集工具
 * 收集和暴露Prometheus指标
 */

// 创建注册所有指标的注册表
const register = new client.Registry();

// 添加默认指标
client.collectDefaultMetrics({
  register,
  prefix: 'qwen_proxy_'
});

// 定义自定义指标
const httpRequestTotal = new client.Counter({
  name: 'qwen_proxy_http_requests_total',
  help: 'HTTP请求总数',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestDuration = new client.Histogram({
  name: 'qwen_proxy_http_request_duration_seconds',
  help: 'HTTP请求持续时间（秒）',
  labelNames: ['method', 'route'],
  buckets: [0.1, 0.5, 1, 2, 5, 10] // 0.1秒, 0.5秒, 1秒, 2秒, 5秒, 10秒
});

const apiRequestsTotal = new client.Counter({
  name: 'qwen_proxy_api_requests_total',
  help: 'Qwen的API请求总数',
  labelNames: ['api_type', 'model', 'account_id']
});

const apiRequestDuration = new client.Histogram({
  name: 'qwen_proxy_api_request_duration_seconds',
  help: 'Duration of API requests to Qwen in seconds',
  labelNames: ['api_type', 'model', 'account_id'],
  buckets: [0.5, 1, 2, 5, 10, 30]
});

const tokenUsageTotal = new client.Counter({
  name: 'qwen_proxy_token_usage_total',
  help: 'Total number of tokens processed',
  labelNames: ['type', 'model', 'account_id'] // type: input, output
});

const activeConnections = new client.Gauge({
  name: 'qwen_proxy_active_connections',
  help: 'Number of active connections'
});

const requestQueueSize = new client.Gauge({
  name: 'qwen_proxy_request_queue_size',
  help: 'Size of the request queue'
});

// 注册自定义指标
register.registerMetric(httpRequestTotal);
register.registerMetric(httpRequestDuration);
register.registerMetric(apiRequestsTotal);
register.registerMetric(apiRequestDuration);
register.registerMetric(tokenUsageTotal);
register.registerMetric(activeConnections);
register.registerMetric(requestQueueSize);

class MetricsCollector {
  constructor() {
    this.register = register;
    this.httpRequestTotal = httpRequestTotal;
    this.httpRequestDuration = httpRequestDuration;
    this.apiRequestsTotal = apiRequestsTotal;
    this.apiRequestDuration = apiRequestDuration;
    this.tokenUsageTotal = tokenUsageTotal;
    this.activeConnections = activeConnections;
    this.requestQueueSize = requestQueueSize;
  }

  // 增加HTTP请求计数器
  incrementHttpRequest(method, route, statusCode) {
    this.httpRequestTotal.inc({
      method: method.toUpperCase(),
      route,
      status_code: statusCode
    });
  }

  // 记录HTTP请求持续时间
  recordHttpRequestDuration(method, route, durationInSeconds) {
    this.httpRequestDuration.observe({
      method: method.toUpperCase(),
      route
    }, durationInSeconds);
  }

  // 增加API请求计数器
  incrementApiRequest(apiType, model, accountId) {
    this.apiRequestsTotal.inc({
      api_type: apiType,
      model: model || 'unknown',
      account_id: accountId || 'default'
    });
  }

  // 记录API请求持续时间
  recordApiRequestDuration(apiType, model, accountId, durationInSeconds) {
    this.apiRequestDuration.observe({
      api_type: apiType,
      model: model || 'unknown',
      account_id: accountId || 'default'
    }, durationInSeconds);
  }

  // 记录token使用情况
  recordTokenUsage(type, model, accountId, count) {
    this.tokenUsageTotal.inc({
      type,
      model: model || 'unknown',
      account_id: accountId || 'default'
    }, count);
  }

  // 设置活动连接数
  setActiveConnections(count) {
    this.activeConnections.set(count);
  }

  // 设置请求队列大小
  setRequestQueueSize(count) {
    this.requestQueueSize.set(count);
  }

  // 获取Prometheus端点的指标
  async getMetrics() {
    return await this.register.metrics();
  }

  // 重置所有指标（对测试有用）
  resetMetrics() {
    this.register.resetMetrics();
  }
}

module.exports = { MetricsCollector };