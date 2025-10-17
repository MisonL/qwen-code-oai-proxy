class Cache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map(); // To track timeouts for cache expiration
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined if not found/expired
   */
  get(key) {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    return undefined;
  }

  /**
   * Set value in cache with TTL (time-to-live)
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time-to-live in milliseconds (default: 5 minutes)
   */
  set(key, value, ttl = 5 * 60 * 1000) { // Default to 5 minutes
    // Clear existing timeout if any
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Set new value
    this.cache.set(key, value);

    // Set expiration timer
    const timer = setTimeout(() => {
      this.delete(key);
    }, ttl);

    this.timers.set(key, timer);
  }

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.cache.clear();
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and hasn't expired
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Get cache size
   * @returns {number} Number of cached items
   */
  size() {
    return this.cache.size;
  }
}

module.exports = { Cache };