# Fluxbase ⚡
> **Serverless SQL Engine for Next.js Apps**
> The modern, zero-config database platform bridging the gap between familiar SQL and infinite scale.

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Database](https://img.shields.io/badge/Storage-PostgreSQL_&_MySQL-orange)

## 🚀 Overview

Fluxbase is a next-generation DBaaS (Database-as-a-Service) built specifically for fast-moving startups. It provides a **custom server-based SQL engine** that natively connects to AWS RDS instances, allowing you to instantly spin up isolated environments for PostgreSQL and MySQL directly from a beautiful UI dashboard.

You get the familiar, relational querying experience of PostgreSQL and MySQL, combined with a premium web-based table editor, visual schema designer, and zero-maintenance architecture.

## ✨ Key Features

-   **⚡ Dual-Engine Support**: Run native PostgreSQL or MySQL instances isolated by Tenant ID on AWS RDS.
-   **🔥 Native SQL Execution**: No abstraction layers. Write raw `SELECT`, `JOIN`, `UPDATE`, `INSERT` commands executed directly on bare-metal database drivers (`pg` and `mysql2`).
-   **🔐 Scoped API Keys**: Generate granular, project-specific API keys to safely embed your database in external client-side or server-side applications.
-   **📊 Real-Time Analytics**: Built-in Vercel-style telemetry. Monitor query traffic and events instantly via the dashboard.
-   **🎨 Premium IDE Dashboard**: A beautiful, dark-mode first Table Editor, ERD Visualizer, and raw SQL scratchpad built with Tailwind CSS and Radix UI.
-   **☁️ Webhooks**: Dispatch HTTP webhooks to external services whenever rows are modified in your tables.

## 🏗️ Architecture

Fluxbase utilizes a centralized routing architecture:
1. **The API Layer**: Requests are authenticated via scoped Bearer tokens at the edge.
2. **The Connection Pooler**: Core modules (`src/lib/pg.ts` and `src/lib/mysql.ts`) maintain highly available connection pools to master AWS RDS instances.
3. **The Schema Router**: Based on the project `dialect`, queries are dynamically routed via `USE project_xxx` (MySQL) or `search_path` (PostgreSQL) into isolated tenant schemas.

---

## 🏁 Getting Started (Self-Hosting Setup)

If you are hosting Fluxbase yourself, follow these instructions to spin up the server engine.

### Prerequisites
- Node.js 18+
- An AWS RDS PostgreSQL 16+ Instance
- An AWS RDS MySQL 8.0+ Instance

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Sumith2104/flux-productionbuild.git
   cd flux-productionbuild
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   Create a `.env.local` file with your AWS database credentials and NextAuth secrets.
   ```env
   # PostgreSQL Master Connection (Used for global state and PG projects)
   AWS_RDS_POSTGRES_URL="postgresql://username:password@your-rds-endpoint.amazonaws.com:5432/postgres"
   
   # MySQL Master Connection (Used for MySQL projects)
   AWS_RDS_MYSQL_URL="mysql://username:password@your-rds-endpoint.amazonaws.com:3306"

   # Authentication
   NEXT_PUBLIC_GOOGLE_CLIENT_ID="your-google-oauth-client-id"

   # SMTP (For email notifications/verifications)
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT=587
   SMTP_USER="noreply@yourdomain.com"
   SMTP_PASS="your-app-password"
   SMTP_FROM="Fluxbase <noreply@yourdomain.com>"
   ```

4. **Launch the Engine**
   ```bash
   npm run dev
   ```

5. **Open the Dashboard**
   Navigate to `http://localhost:3000` to create your first organization and project.

---

## 📖 User Guide (Client Integration)

If you are connecting an external application to a Fluxbase project, use this guide to authenticate and execute SQL queries over HTTP.

### 🔐 Authentication

To query your database from an external application, you need an **API Key**. 
1. Log into your Fluxbase Dashboard.
2. Select your Project.
3. Navigate to **API Keys** in the sidebar.
4. Click **"Create API Key"**.
5. Give your key a descriptive name and copy it.

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
  "query": "SELECT * FROM users LIMIT 10"
}
```
*Note: Because your API Key is scoped to a specific project, you do not need to pass a `projectId` in the JSON payload.*

#### ✅ Successful Response Format
A successful execution returns a JSON object with a nested `result` containing rows, column names, and execution metadata.

```json
{
  "success": true,
  "result": {
    "rows": [
      {
        "id": "123",
        "name": "Jane Doe",
        "email": "jane@example.com",
        "created_at": "2024-03-21T10:00:00.000Z"
      }
    ],
    "columns": ["id", "name", "email", "created_at"],
    "message": "Affected 1 rows"
  },
  "explanation": ["Executed via Native AWS MySQL in 42.10ms"],
  "executionInfo": {
    "time": "45ms",
    "rowCount": 1
  }
}
```

#### ❌ Error Response Format
If the query fails, the API returns a structured error. HTTP status is always `200` for query-level errors.

```json
{
  "success": false,
  "error": {
    "message": "Table 'users' doesn't exist",
    "code": "EXECUTION_ERROR",
    "hint": "Check syntax and table names."
  }
}
```

---

## ⚡ Client-Side Performance & Caching

If you are querying Fluxbase from a frontend framework like **Next.js**, you can drastically improve your application's speed by utilizing framework-level caching.

### 1. Enable Next.js Data Cache
Explicitly tell Next.js to cache your `SELECT` queries so concurrent users share the same result without double-hitting the API.

```javascript
// lib/fluxbase.js
const FLUXBASE_URL = process.env.FLUXBASE_API_URL;
const FLUXBASE_KEY = process.env.FLUXBASE_API_KEY;

export async function query(sql) {
  const res = await fetch(`${FLUXBASE_URL}/api/execute-sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FLUXBASE_KEY}`
    },
    body: JSON.stringify({ query: sql }),
    next: { revalidate: 15 } // Cache for 15 seconds across all users
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message);
  return data.result.rows; // Access rows from the nested result object
}
```

### 2. Deduplicate Queries with React `cache()`
Wrap the fetcher in React's `cache()` function so Next.js only executes the database request **once** per page load, even if multiple components call it.

```javascript
import { cache } from 'react';
import { query } from '@/lib/fluxbase';

export const getUsers = cache(async () => {
  return await query("SELECT * FROM users");
});
```

---

## 🧑‍💻 Example Integrations

### Python (Requests)
```python
import requests

url = "https://fluxbase.yourdomain.com/api/execute-sql"
headers = {
    "Authorization": "Bearer fb_live_xxxxxxxxxxxxxxxxxxxx",
    "Content-Type": "application/json"
}
payload = {
    "query": "SELECT name, email FROM users WHERE role = 'admin'"
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()

if data["success"]:
    rows = data["result"]["rows"]  # Access rows from nested result
    print(f"Found {len(rows)} rows")
    print(rows)
else:
    print(f"Error: {data['error']['message']}")
```

## 📄 License

This project is licensed under the MIT License.
