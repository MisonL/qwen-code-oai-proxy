/**
 * 缓存工具测试
 * 测试缓存功能是否正常工作
 */

const { Cache } = require('../cache.js');

describe('Cache', () => {
  let cache;

  beforeEach(() => {
    cache = new Cache();
  });

  afterEach(() => {
    cache.clear();
  });

  describe('constructor', () => {
    it('should initialize with empty cache and timers', () => {
      expect(cache.cache).toBeInstanceOf(Map);
      expect(cache.timers).toBeInstanceOf(Map);
      expect(cache.size()).toBe(0);
    });
  });

  describe('set and get', () => {
    it('should store and retrieve a value', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent key', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should respect TTL and expire entries', (done) => {
      cache.set('expiringKey', 'expiringValue', 10); // 10ms TTL
      
      expect(cache.get('expiringKey')).toBe('expiringValue');
      
      setTimeout(() => {
        expect(cache.get('expiringKey')).toBeUndefined();
        done();
      }, 20);
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should return false for non-existing keys', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove a key from cache', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
      
      cache.delete('key1');
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should handle deleting non-existent keys gracefully', () => {
      expect(() => {
        cache.delete('nonexistent');
      }).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all entries from cache', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      expect(cache.size()).toBe(2);
      
      cache.clear();
      
      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('size', () => {
    it('should return the correct cache size', () => {
      expect(cache.size()).toBe(0);
      
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
      
      cache.delete('key1');
      expect(cache.size()).toBe(1);
    });
  });
});