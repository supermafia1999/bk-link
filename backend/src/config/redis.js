const Redis = require('ioredis');

let redis = null;

try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  redis.on('connect', () => {
    console.log('Redis connected successfully');
  });

  redis.on('error', (err) => {
    console.error('Redis error:', err.message);
  });
} catch (error) {
  console.error('Redis connection failed:', error.message);
  // Create a mock redis client for development without Redis
  redis = {
    get: async () => null,
    set: async () => 'OK',
    setex: async () => 'OK',
    del: async () => 1,
    exists: async () => 0,
    on: () => {},
  };
}

module.exports = { redis };
