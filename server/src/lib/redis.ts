import Redis from 'ioredis';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      // In development without Redis configured, we'll use a mock/noop
      console.warn('⚠️  REDIS_URL not set — running without Redis (single-instance only)');
      // Return a fake client that no-ops everything
      // This allows Phase 1 to work without Redis configured
      return createNoopRedis();
    }

    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false, // Upstash doesn't support PING in TLS mode
      tls: redisUrl.startsWith('rediss://') ? {} : undefined,
    });

    redis.on('connect', () => console.log('✅ Redis connected'));
    redis.on('error', (err) => console.error('❌ Redis error:', err.message));
  }

  return redis;
}

// Noop Redis for local dev without Redis configured.
// Socket.IO will work fine on a single instance — you just won't have
// cross-instance pub/sub. Good enough for local development.
function createNoopRedis(): Redis {
  const noop = new Proxy({} as Redis, {
    get: (_target, prop) => {
      if (prop === 'on' || prop === 'off' || prop === 'once') return () => noop;
      if (prop === 'duplicate') return () => noop;
      if (prop === 'subscribe' || prop === 'psubscribe') return () => Promise.resolve();
      return () => Promise.resolve(null);
    },
  });
  return noop;
}
