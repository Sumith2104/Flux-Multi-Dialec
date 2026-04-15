"""
test_pipeline.py — End-to-end pipeline test for Fluxbase ingestion.

Tests:
  1. Creates test table in Fluxbase
  2. Sends events to the producer API (/api/ingest)
  3. Waits for worker to process
  4. Queries Fluxbase to verify data arrived
  5. Prints a result summary

Usage:
  pip install httpx
  python test_pipeline.py
"""

import httpx
import time
import uuid
import json

# ─── CONFIG — fill these in ──────────────────────────────────────────────────
FLUXBASE_URL     = "https://fluxbase.vercel.app"
FLUXBASE_API_KEY = "flx_YOUR_API_KEY"          # Settings → API Keys
FLUXBASE_PROJECT = "YOUR_PROJECT_ID"           # your project ID
PRODUCER_URL     = "https://fluxbase.vercel.app"  # same app, /api/ingest

TABLE = "ingestion_test"
ROWS_TO_SEND = 50
# ─────────────────────────────────────────────────────────────────────────────

headers = {
    "Authorization": f"Bearer {FLUXBASE_API_KEY}",
    "Content-Type": "application/json",
}


def sql(query: str, params: list = []):
    """Run a SQL query on Fluxbase."""
    r = httpx.post(
        f"{FLUXBASE_URL}/api/execute-sql",
        headers=headers,
        json={"projectId": FLUXBASE_PROJECT, "query": query, "params": params},
        timeout=15,
    )
    return r.json()


def step(msg: str):
    print(f"\n{'─'*50}")
    print(f"  {msg}")
    print(f"{'─'*50}")


# ── STEP 1: Create test table ─────────────────────────────────────────────────
step("STEP 1 — Creating test table in Fluxbase")

result = sql(f"""
    CREATE TABLE IF NOT EXISTS {TABLE} (
        id          TEXT PRIMARY KEY,
        product     TEXT,
        quantity    INTEGER,
        price       FLOAT,
        region      TEXT,
        _batch_id   TEXT,
        _ingested_at TEXT,
        created_at  TEXT
    )
""")

if result.get("success"):
    print(f"  ✅ Table '{TABLE}' ready")
else:
    print(f"  ❌ Table creation failed: {result}")
    exit(1)


# ── STEP 2: Check initial row count ───────────────────────────────────────────
step("STEP 2 — Checking initial row count")

result = sql(f"SELECT COUNT(*) as count FROM {TABLE}")
initial_count = int(result.get("rows", [{}])[0].get("count", 0))
print(f"  📊 Rows before test: {initial_count}")


# ── STEP 3: Send events to producer ───────────────────────────────────────────
step(f"STEP 3 — Sending {ROWS_TO_SEND} rows to producer API")

products = ["laptop", "phone", "tablet", "headphones", "monitor"]
regions  = ["us-east", "eu-west", "ap-south", "ap-northeast"]

rows = [
    {
        "id":         str(uuid.uuid4()),
        "product":    products[i % len(products)],
        "quantity":   (i % 10) + 1,
        "price":      round(9.99 + i * 1.5, 2),
        "region":     regions[i % len(regions)],
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    for i in range(ROWS_TO_SEND)
]

t_start = time.monotonic()
r = httpx.post(
    f"{PRODUCER_URL}/api/ingest",
    json={"table": TABLE, "rows": rows},
    timeout=10,
)
latency = (time.monotonic() - t_start) * 1000

if r.status_code == 202:
    data = r.json()
    print(f"  ✅ Producer accepted {data['queued']} rows in {latency:.0f}ms")
    print(f"  📦 Batch ID: {data['batchId']}")
else:
    print(f"  ❌ Producer rejected: {r.status_code} {r.text}")
    exit(1)


# ── STEP 4: Wait for worker to process ────────────────────────────────────────
step("STEP 4 — Waiting for worker to process batch...")

print("  ⏳ Polling Fluxbase every 3s for up to 60s...")
deadline = time.monotonic() + 60
final_count = initial_count

while time.monotonic() < deadline:
    time.sleep(3)
    result = sql(f"SELECT COUNT(*) as count FROM {TABLE}")
    final_count = int(result.get("rows", [{}])[0].get("count", 0))
    new_rows = final_count - initial_count
    print(f"     → {new_rows}/{ROWS_TO_SEND} rows visible in DB...", end="\r")
    if new_rows >= ROWS_TO_SEND:
        break

print()


# ── STEP 5: Verify data ───────────────────────────────────────────────────────
step("STEP 5 — Verifying data in Fluxbase")

# Sample a few rows
result = sql(f"SELECT id, product, quantity, region, _batch_id FROM {TABLE} ORDER BY _ingested_at DESC LIMIT 5")
rows_found = result.get("rows", [])

print(f"  📋 Sample rows inserted:")
for row in rows_found:
    print(f"     {row}")

# Check for duplicates (idempotency test)
dup_result = sql(f"SELECT id, COUNT(*) as c FROM {TABLE} GROUP BY id HAVING COUNT(*) > 1")
duplicates = len(dup_result.get("rows", []))


# ── STEP 6: Summary ───────────────────────────────────────────────────────────
new_rows = final_count - initial_count
step("RESULT SUMMARY")
print(f"  Rows sent          : {ROWS_TO_SEND}")
print(f"  Rows in DB         : {new_rows}")
print(f"  Producer latency   : {latency:.0f}ms")
print(f"  Duplicates found   : {duplicates}")
print(f"  Data loss          : {'NONE ✅' if new_rows >= ROWS_TO_SEND else str(ROWS_TO_SEND - new_rows) + ' rows missing ❌'}")
print(f"  Idempotency        : {'✅ PASS' if duplicates == 0 else '❌ FAIL'}")
print()
if new_rows >= ROWS_TO_SEND and duplicates == 0:
    print("  🎉 PIPELINE TEST PASSED — System is working correctly!")
elif new_rows == 0:
    print("  ⚠️  Worker may not be running yet. Deploy Render worker first.")
else:
    print("  ⚠️  Partial success — worker may still be processing.")
