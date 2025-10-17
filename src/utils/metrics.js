const client = require('prom-client');

// Create a Registry which registers all metrics
const register = new client.Registry();

// Add default metrics
client.collectDefaultMetrics({
  register,
  prefix: 'qwen_proxy_'
});

// Define custom metrics
const httpRequestTotal = new client.Counter({
  name: 'qwen_proxy_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestDuration = new client.Histogram({
  name: 'qwen_proxy_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.1, 0.5, 1, 2, 5, 10] // 0.1s, 0.5s, 1s, 2s, 5s, 10s
});

const apiRequestsTotal = new client.Counter({
  name: 'qwen_proxy_api_requests_total',
  help: 'Total number of API requests to Qwen',
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

// Register custom metrics
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

  // Increment HTTP request counter
  incrementHttpRequest(method, route, statusCode) {
    this.httpRequestTotal.inc({
      method: method.toUpperCase(),
      route,
      status_code: statusCode
    });
  }

  // Record HTTP request duration
  recordHttpRequestDuration(method, route, durationInSeconds) {
    this.httpRequestDuration.observe({
      method: method.toUpperCase(),
      route
    }, durationInSeconds);
  }

  // Increment API request counter
  incrementApiRequest(apiType, model, accountId) {
    this.apiRequestsTotal.inc({
      api_type: apiType,
      model: model || 'unknown',
      account_id: accountId || 'default'
    });
  }

  // Record API request duration
  recordApiRequestDuration(apiType, model, accountId, durationInSeconds) {
    this.apiRequestDuration.observe({
      api_type: apiType,
      model: model || 'unknown',
      account_id: accountId || 'default'
    }, durationInSeconds);
  }

  // Record token usage
  recordTokenUsage(type, model, accountId, count) {
    this.tokenUsageTotal.inc({
      type,
      model: model || 'unknown',
      account_id: accountId || 'default'
    }, count);
  }

  // Set active connections count
  setActiveConnections(count) {
    this.activeConnections.set(count);
  }

  // Set request queue size
  setRequestQueueSize(count) {
    this.requestQueueSize.set(count);
  }

  // Get metrics for Prometheus endpoint
  async getMetrics() {
    return await this.register.metrics();
  }

  // Reset all metrics (useful for testing)
  resetMetrics() {
    this.register.resetMetrics();
  }
}

module.exports = { MetricsCollector };