/**
 * 缓存工具
 * 提供带有过期时间的内存缓存功能
 */

class Cache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map(); // 用于跟踪缓存过期的超时
  }

  /**
   * 从缓存中获取值
   * @param {string} key - 缓存键
   * @returns {*} 缓存的值，如果未找到或已过期则返回undefined
   */
  get(key) {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    return undefined;
  }

  /**
   * 在缓存中设置值并指定TTL（生存时间）
   * @param {string} key - 缓存键
   * @param {*} value - 要缓存的值
   * @param {number} ttl - 以毫秒为单位的生存时间（默认：5分钟）
   */
  set(key, value, ttl = 5 * 60 * 1000) { // 默认为5分钟
    // 清除现有的超时
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // 设置新值
    this.cache.set(key, value);

    // 设置过期定时器
    const timer = setTimeout(() => {
      this.delete(key);
    }, ttl);

    this.timers.set(key, timer);
  }

  /**
   * 从缓存中删除值
   * @param {string} key - 缓存键
   */
  delete(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    
    this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.cache.clear();
  }

  /**
   * 检查键是否存在于缓存中
   * @param {string} key - 缓存键
   * @returns {boolean} 如果键存在且未过期则返回true
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * 获取缓存大小
   * @returns {number} 缓存项的数量
   */
  size() {
    return this.cache.size;
  }
}

module.exports = { Cache };