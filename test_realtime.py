"""
Fluxbase Real-Time Latency Tester
----------------------------------
Inserts a row into the 'messages' table via /api/execute-sql (SQL INSERT).
Open the Fluxbase table editor in your browser, run this script,
and measure how long it takes for the new row to appear.

Fill in FLUXBASE_API_KEY and PROJECT_ID below before running.
"""

import requests
import uuid
from datetime import datetime, timezone

# ─── FILL THESE IN ───────────────────────────────────────────────────────────
FLUXBASE_BASE_URL = "https://fluxbase.vercel.app"   # or https://your-deployed-url.com
FLUXBASE_API_KEY  = "fl_ac052534c39981abe51a830569e7209d25f9deb56ef50662"                         # Your API key (Settings → API Keys)
PROJECT_ID        = "c58d8053b4f7430b"                         # Your project ID (from editor URL)
# ─────────────────────────────────────────────────────────────────────────────

ENDPOINT = f"{FLUXBASE_BASE_URL}/api/execute-sql"


def insert_message(content: str) -> requests.Response:
    """Insert a single row into messages using a raw SQL INSERT."""
    headers = {
        "Authorization": f"Bearer {FLUXBASE_API_KEY}",
        "Content-Type":  "application/json",
    }

    # Uses parameterized query — safe from SQL injection
    query = (
        "INSERT INTO messages "
        "(gym_id, sender_id, receiver_id, sender_type, receiver_type, content, created_at) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7)"
    )

    payload = {
        "projectId": PROJECT_ID,
        "query":     query,
        "params": [
            "test-gym-id",
            "py-tester",
            "admin",
            "member",
            "admin",
            content,
            datetime.now(timezone.utc).isoformat(),
        ]
    }

    return requests.post(ENDPOINT, headers=headers, json=payload, timeout=15)


def run_test(count: int = 5, delay_between: float = 4.0):
    import time

    if not FLUXBASE_API_KEY or not PROJECT_ID:
        print("❌  Fill in FLUXBASE_API_KEY and PROJECT_ID at the top of this script.")
        return

    print(f"\n🚀  Real-time latency test — inserting {count} row(s) into 'messages'")
    print(f"    Keep your browser open at: {FLUXBASE_BASE_URL}/editor?projectId={PROJECT_ID}")
    print(f"    👉  Start a stopwatch when you see '✅  API confirmed' — stop it when the row appears in the table.\n")
    print("─" * 65)

    for i in range(1, count + 1):
        send_time = datetime.now(timezone.utc)
        content   = f"[TEST {i}/{count}] Sent at {send_time.strftime('%H:%M:%S.%f')[:-3]} UTC"

        print(f"[{i}/{count}] ⏱  Sending at: {send_time.strftime('%H:%M:%S.%f')[:-3]} UTC")

        try:
            resp      = insert_message(content)
            api_ms    = (datetime.now(timezone.utc) - send_time).total_seconds() * 1000

            if resp.status_code in (200, 201):
                data = resp.json()
                exec_time = data.get("executionInfo", {}).get("time", "?")
                print(f"         ✅  API confirmed in {api_ms:.0f}ms  (DB exec: {exec_time})")
                print(f"         👀  Watch browser — row should appear NOW. Content: \"{content}\"")
            else:
                print(f"         ❌  API error {resp.status_code}: {resp.text}")
        except requests.exceptions.RequestException as e:
            print(f"         ❌  Request failed: {e}")

        print()

        if i < count:
            print(f"         ⏳  Next insert in {delay_between}s…")
            time.sleep(delay_between)

    print("─" * 65)
    print("✅  Done. Measure the gap between '✅ API confirmed' and when the row appeared in your browser.")


if __name__ == "__main__":
    # count          = how many rows to insert
    # delay_between  = seconds between inserts (give yourself time to reset stopwatch)
    run_test(count=5, delay_between=5.0)
