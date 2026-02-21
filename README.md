# Fluxbase ⚡
> **Serverless SQL, Powered by Firestore.**
> The modern, zero-config database platform bridging the gap between familiar SQL and NoSQL scale.

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Database](https://img.shields.io/badge/Storage-Firestore-orange)

## 🚀 Overview

Fluxbase is a next-generation DBaaS (Database-as-a-Service) built specifically for fast-moving startups and indie hackers. It provides a **custom server-based SQL parsing engine** that translates standard SQL queries (`SELECT`, `JOIN`, `UPDATE`, `INSERT`) directly into optimized Firestore NoSQL document operations.

You get the familiar, relational querying experience of PostgreSQL, combined with the infinite horizontal scale and zero-maintenance architecture of serverless document stores.

## ✨ Key Features

-   **⚡ Serverless SQL Engine**: Run complex SQL queries directly against your data without provisioning or managing a single DB instance.
-   **🔥 Pure Firestore Backend**: All data maps directly to Google Cloud Firestore (100% cloud-native, no local CSV fallback reliance).
-   **🔐 Scoped API Keys**: Generate granular, project-specific API keys to safely embed your database in external client-side or server-side applications.
-   **📊 Real-Time Analytics**: Built-in Vercel-style telemetry. Monitor `SELECT`, `UPDATE`, and `INSERT` distributions instantly via the dashboard.
-   **🎨 Premium IDE Dashboard**: A beautiful, dark-mode first Table Editor, raw SQL scratchpad, and schema visualizer built with Tailwind CSS and Radix UI.
-   **☁️ Edge-Ready**: Deploys instantly to Vercel.

## 🏗️ Architecture

Fluxbase utilizes a hybrid parsing architecture:
1. **The API Layer**: Requests are authenticated via scoped Bearer tokens at the edge.
2. **The AST Parser**: The `node-sql-parser` library converts raw SQL strings into a highly structured Abstract Syntax Tree (AST).
3. **The Execution Engine**: Our custom typescript `SqlEngine` iterates over the AST, maps the relational requests (like `JOIN` commands and aggregate `WHERE` clauses) into heavily memoized Firebase Admin SDK queries.
4. **The Storage Layer**: Data is persisted redundantly across GCP Firestore nodes. (Note: Legacy local-CSV caching has been completely deprecated for production stability).

---

## 🏁 Getting Started (Server Setup)

If you are hosting Fluxbase yourself, follow these instructions to spin up the server engine.

### Prerequisites
- Node.js 18+
- A Google Firebase Project (Firestore + Email Auth enabled)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/fluxbase.git
   cd fluxbase
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   Create a `.env.local` file with your Firebase Admin credentials.
   ```env
   FIREBASE_PROJECT_ID="your-project-id"
   FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com"
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourKeyHere\n-----END PRIVATE KEY-----\n"
   NEXT_PUBLIC_FIREBASE_API_KEY="your-public-api-key"
   ```

4. **Launch the Engine**
   ```bash
   npm run dev
   ```

---

## 📖 User Guide (Client Integration)

If you are connecting an external application to a Fluxbase project, use this guide to authenticate and execute SQL queries over HTTP.

### 🔐 Authentication

To query your database from an external application, you need an **API Key**. 
1. Log into your Fluxbase Dashboard.
2. Select your Project.
3. Navigate to **API & Settings** (`/api`) in the sidebar.
4. Click **"Create API Key"**.
5. Give your key a descriptive name.
6. **Copy the generated key immediately.** (For security, you won't be able to see it again).

Include your API Key in the `Authorization` header of all HTTP requests:
```http
Authorization: Bearer <YOUR_API_KEY>
```

### 🔌 The Execution API

Fluxbase exposes a single endpoint to handle all your database operations.

**Endpoint:** `POST https://your-fluxbase-deployment.com/api/execute-sql`

#### Request Format
```json
{
  "query": "YOUR SQL QUERY STRING HERE"
}
```
*Note: Because your API Key is scoped to a specific project, you do not need to pass a `projectId` in the JSON payload.*

#### Successful Response Format
A successful execution returns a JSON object containing the elapsed execution time, the affected/returned rows, and the array of column names.

```json
{
  "success": true,
  "executionTime": 42,
  "columns": ["id", "name", "email", "created_at"],
  "rows": [
    {
      "id": "123",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "created_at": "2024-03-21T10:00:00Z"
    }
  ]
}
```

---

## 🛠️ Supported SQL Operations

The Fluxbase parser engine translates standard SQL strings into targeted Firestore operations. Below is a list of supported operations.

### 1. SELECT Queries
```sql
SELECT * FROM users;
SELECT * FROM users LIMIT 10;
SELECT name, email FROM users;
SELECT * FROM users WHERE active = true;
```

### 2. Aggregate Queries & GROUP BY
```sql
SELECT status, COUNT(1) FROM tasks GROUP BY status;
```

### 3. INSERT Statements
The engine will automatically generate a UUID for the primary key if it is not provided.
```sql
INSERT INTO members (name, email, plan) VALUES ('John Smith', 'john@example.com', 'Premium');
```

### 4. UPDATE Statements
Modify existing records matching a criteria. The engine evaluates right-hand expressions against current row state.
```sql
UPDATE subscriptions SET status = 'cancelled' WHERE active = false;
UPDATE metrics SET total_views = total_views + 1 WHERE page_path = '/home';
```

### 5. DELETE Statements
```sql
DELETE FROM tasks WHERE completed = true;
```

---

## ⚡ Client-Side Performance & Caching

If you are querying Fluxbase from a frontend framework like **Next.js**, you can drastically improve your application's speed by utilizing framework-level caching instead of hitting the database on every render.

### 1. Enable Next.js Data Cache
By default, standard `fetch` POST requests bypass the CDN cache. You should explicitly tell Next.js to cache your `SELECT` queries for a short duration (e.g. 15 seconds) so that concurrent users instantly share the same result without hitting the API.

```javascript
// AVOID: cache: 'no-store' (Disables all caching)
const res = await fetch(endpoint, {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify({ query: "SELECT * FROM public_announcements" }),
    // NEXT.JS OPTIMIZATION:
    next: { revalidate: 15 } // Cache across all users for 15 seconds
});
```

### 2. Deduplicate Queries with React `cache()`
If multiple components on your page run the exact same SQL query (like fetching the user's profile), wrap the fetcher in React's `cache()` function. Next.js will only execute the database request **once** per page load.

```javascript
import { cache } from 'react';

// Wrap your executor
export const getGymProfile = cache(async (gymId) => {
    const res = await executeSql(`SELECT * FROM gyms WHERE id = '${gymId}'`);
    return res.rows[0];
});
```

### 3. Optimistic UI Updates
For mutations (`INSERT`, `UPDATE`), use React's `useOptimistic` hook to immediately update your local tables or UI components before the Fluxbase API responds. This eliminates perceived network latency for end-users.

---

## ⚠️ Engine Limitations

Because Fluxbase maps relational syntax to a NoSQL backend document store, certain complex relational operations are currently either limited or unsupported:

1. **Complex Joins**: `LEFT JOIN` and `INNER JOIN` are partially supported and processed in-memory. Joining three or more large tables simultaneously will result in degraded performance.
2. **Subqueries**: Nested `SELECT` statements (e.g., `WHERE id IN (SELECT id...)`) are not fully optimized.
3. **Pivots & Window Functions**: Functions like `ROW_NUMBER() OVER()` or `PIVOT` are not supported.

For the most performant experience, design your schema to require minimal cross-table joins.

---

## 🧑‍💻 Example Integrations

### Fetch API (Frontend JS / Next.js Client)
```javascript
const response = await fetch('https://fluxbase.yourdomain.com/api/execute-sql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer fb_live_xxxxxxxxxxxxxxxxxxxx'
  },
  body: JSON.stringify({
    query: "SELECT name, email FROM users WHERE role = 'admin'"
  })
});

const data = await response.json();
console.log(data.rows);
```

### Python (Requests)
```python
import requests

url = "https://fluxbase.yourdomain.com/api/execute-sql"
headers = {
    "Authorization": "Bearer fb_live_xxxxxxxxxxxxxxxxxxxx",
    "Content-Type": "application/json"
}
payload = {
    "query": "INSERT INTO events (type, user_id) VALUES ('login', '123')"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())
```

## 📄 License

This project is licensed under the MIT License.
