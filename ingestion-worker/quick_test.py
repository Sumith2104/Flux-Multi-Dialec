import asyncio
import os
import time
import uuid
import logging
from dotenv import load_dotenv

# Load env from .env first, then fallback to root .env.local
load_dotenv()
load_dotenv("../.env.local")

# Set required env vars for FluxbaseClient/Config
os.environ["FLUXBASE_PROJECT_ID"] = "c58d8053b4f7430b"
os.environ["FLUXBASE_API_KEY"] = "mock_key_for_testing"
os.environ["INGESTION_UNLOGGED_TABLES"] = "true"  # Test with unlogged tables

from fluxbase_client import FluxbaseClient
from simulate import uuid7

# Set up logging to see process logs
logging.basicConfig(level=logging.INFO)

async def main():
    client = FluxbaseClient()
    
    # Target table name
    table_name = "load_test_copy_v7"
    
    # 1. Sample row for schema creation
    sample_row = {
        "id": str(uuid7()),
        "product": "laptop",
        "quantity": 5,
        "unit_price": 499.99,
        "currency": "USD",
        "region": "us-east",
        "status": "pending",
        "customer_id": str(uuid7()),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    
    print(f"Creating/Ensuring table '{table_name}' exists as UNLOGGED...")
    await client.ensure_table_exists(table_name, sample_row)
    
    # 2. Generate rows
    total_rows = 500_000
    batch_size = 50_000
    num_batches = total_rows // batch_size
    
    print(f"Generating {total_rows:,} rows with sequential UUID v7 keys...")
    batches = []
    for b in range(num_batches):
        batch = []
        for _ in range(batch_size):
            batch.append({
                "id": str(uuid7()),
                "product": "laptop",
                "quantity": 5,
                "unit_price": 499.99,
                "currency": "USD",
                "region": "us-east",
                "status": "pending",
                "customer_id": str(uuid7()),
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })
        batches.append(batch)
        print(f" Generated batch {b+1}/{num_batches}...", end="\r")
    print("\nGeneration complete. Starting ingestion...")
    
    # 3. Ingest batches and measure speed
    start_time = time.monotonic()
    
    total_inserted = 0
    for idx, batch in enumerate(batches):
        batch_start = time.monotonic()
        res = await client.bulk_copy(table_name, batch)
        batch_elapsed = time.monotonic() - batch_start
        if res.get("success"):
            total_inserted += res["rowsAffected"]
            batch_rps = res["rowsAffected"] / batch_elapsed
            print(f" Batch {idx+1}/{num_batches} (size={len(batch):,}): Success in {batch_elapsed:.2f}s ({batch_rps:,.0f} rows/sec)")
        else:
            print(f" Batch {idx+1}/{num_batches}: FAILED: {res}")
            
    total_elapsed = time.monotonic() - start_time
    rps = total_inserted / total_elapsed
    
    print("\n" + "=" * 50)
    print(" INGESTION PERFORMANCE METRICS")
    print("=" * 50)
    print(f" Rows Inserted : {total_inserted:,}")
    print(f" Time Taken    : {total_elapsed:.2f}s")
    print(f" Throughput    : {rps:,.0f} rows/sec")
    print("=" * 50)
    
    # Close connections
    from fluxbase_client import close_http_client
    await close_http_client()

if __name__ == "__main__":
    asyncio.run(main())
