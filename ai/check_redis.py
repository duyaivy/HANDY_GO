import os
import redis

client = redis.Redis.from_url(
    os.environ["REDIS_URL"],
    socket_connect_timeout=5,
    socket_timeout=5,
)

print("Redis connection:", client.ping())