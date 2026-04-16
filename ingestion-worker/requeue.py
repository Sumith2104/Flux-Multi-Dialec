import asyncio
import os
import json
from upstash_redis.asyncio import Redis

# Using credentials directly from workers environment
UPSTASH_URL = "https://sharing-warthog-96713.upstash.io"
UPSTASH_TOKEN = "gQAAAAAAAXnJAAIncDE2ZGZlOTdiZjk5YmM0MDdjYTEzMDQ5Njk1ZWI5NTU5MXAxOTY3MTM"

async def requeue():
    redis = Redis(url=UPSTASH_URL, token=UPSTASH_TOKEN)
    
    dlq_key = "orders_dlq"
    queue_key = "orders_queue"
    
    # Get current depth
    dlq_size = await redis.llen(dlq_key)
    if dlq_size == 0:
        print("✅ DLQ is already empty.")
        return

    print(f"🔄 Re-queueing {dlq_size} items from {dlq_key} to {queue_key}...")
    
    count = 0
    # Process in chunks of 50 to maintain performance
    while True:
        # Move one item from DLQ to Main Queue
        # We use RPOPLPUSH (atomic) to ensure no data loss during the move
        item = await redis.rpop(dlq_key)
        if not item:
            break
            
        await redis.lpush(queue_key, item)
        count += 1
        if count % 100 == 0:
            print(f"   ⠼ Moved {count}/{dlq_size}...")

    print(f"✅ SUCCESS: Moved {count} items back to the main queue.")
    print("🚀 Your workers will now pick them up and process them with the new fix!")

if __name__ == "__main__":
    asyncio.run(requeue())
