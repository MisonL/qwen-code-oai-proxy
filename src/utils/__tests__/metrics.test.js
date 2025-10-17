/**
 * 指标收集工具测试
 * 测试指标收集功能是否正常
 */

const { MetricsCollector } = require('../metrics.js');
const client = require('prom-client');

// Mock prom-client
jest.mock('prom-client', () => {
  const Registry = jest.fn();
  const Counter = jest.fn();
  const Histogram = jest.fn();
  const Gauge = jest.fn();
  
  const mockRegister = {
    registerMetric: jest.fn(),
    metrics: jest.fn().mockResolvedValue(''),
    resetMetrics: jest.fn()
  };
  
  Registry.prototype = {
    registerMetric: mockRegister.registerMetric,
    metrics: mockRegister.metrics,
    resetMetrics: mockRegister.resetMetrics
  };
  
  Counter.prototype.inc = jest.fn();
  Histogram.prototype.observe = jest.fn();
  Gauge.prototype.set = jest.fn();
  
  return {
    Registry,
    Counter,
    Histogram,
    Gauge,
    collectDefaultMetrics: jest.fn(),
    default: {
      Registry,
      Counter,
      Histogram,
      Gauge,
      collectDefaultMetrics: jest.fn()
    }
  };
});

describe('MetricsCollector', () => {
  let metricsCollector;

  beforeEach(() => {
    metricsCollector = new MetricsCollector();
  });

  describe('constructor', () => {
    it('should initialize with metric instances', () => {
      expect(metricsCollector.httpRequestTotal).toBeDefined();
      expect(metricsCollector.httpRequestDuration).toBeDefined();
      expect(metricsCollector.apiRequestsTotal).toBeDefined();
      expect(metricsCollector.apiRequestDuration).toBeDefined();
      expect(metricsCollector.tokenUsageTotal).toBeDefined();
      expect(metricsCollector.activeConnections).toBeDefined();
      expect(metricsCollector.requestQueueSize).toBeDefined();
    });
  });

  describe('incrementHttpRequest', () => {
    it('should increment HTTP request counter with correct labels', () => {
      const method = 'GET';
      const route = '/test';
      const statusCode = 200;
      
      metricsCollector.incrementHttpRequest(method, route, statusCode);
      
      expect(metricsCollector.httpRequestTotal.inc).toHaveBeenCalledWith({
        method: method.toUpperCase(),
        route: route,
        status_code: statusCode
      });
    });
  });

  describe('recordHttpRequestDuration', () => {
    it('should record HTTP request duration with correct labels', () => {
      const method = 'POST';
      const route = '/test';
      const duration = 0.5;
      
      metricsCollector.recordHttpRequestDuration(method, route, duration);
      
      expect(metricsCollector.httpRequestDuration.observe).toHaveBeenCalledWith(
        { method: method.toUpperCase(), route: route },
        duration
      );
    });
  });

  describe('incrementApiRequest', () => {
    it('should increment API request counter with correct labels', () => {
      const apiType = 'openai';
      const model = 'gpt-3.5-turbo';
      const accountId = 'test-account';
      
      metricsCollector.incrementApiRequest(apiType, model, accountId);
      
      expect(metricsCollector.apiRequestsTotal.inc).toHaveBeenCalledWith({
        api_type: apiType,
        model: model,
        account_id: accountId
      });
    });
  });

  describe('recordApiRequestDuration', () => {
    it('should record API request duration with correct labels', () => {
      const apiType = 'anthropic';
      const model = 'claude-3';
      const accountId = 'test-account';
      const duration = 1.5;
      
      metricsCollector.recordApiRequestDuration(apiType, model, accountId, duration);
      
      expect(metricsCollector.apiRequestDuration.observe).toHaveBeenCalledWith(
        { api_type: apiType, model: model, account_id: accountId },
        duration
      );
    });
  });

  describe('recordTokenUsage', () => {
    it('should record token usage with correct labels', () => {
      const type = 'input';
      const model = 'gpt-4';
      const accountId = 'test-account';
      const count = 100;
      
      metricsCollector.recordTokenUsage(type, model, accountId, count);
      
      expect(metricsCollector.tokenUsageTotal.inc).toHaveBeenCalledWith({
        type: type,
        model: model,
        account_id: accountId
      }, count);
    });
  });

  describe('setActiveConnections', () => {
    it('should set active connections count', () => {
      const count = 5;
      
      metricsCollector.setActiveConnections(count);
      
      expect(metricsCollector.activeConnections.set).toHaveBeenCalledWith(count);
    });
  });

  describe('setRequestQueueSize', () => {
    it('should set request queue size', () => {
      const count = 3;
      
      metricsCollector.setRequestQueueSize(count);
      
      expect(metricsCollector.requestQueueSize.set).toHaveBeenCalledWith(count);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics from register', async () => {
      const expectedMetrics = 'test metrics';
      metricsCollector.register.metrics.mockResolvedValue(expectedMetrics);
      
      const result = await metricsCollector.getMetrics();
      
      expect(result).toBe(expectedMetrics);
      expect(metricsCollector.register.metrics).toHaveBeenCalled();
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics', () => {
      metricsCollector.resetMetrics();
      
      expect(metricsCollector.register.resetMetrics).toHaveBeenCalled();
    });
  });
});