# Fluxbase User Guide ⚡

Welcome to Fluxbase! This guide is for developers and end-users who want to connect their applications to a Fluxbase project and execute SQL queries against their cloud data.

## 🚀 Introduction

Fluxbase provides a simple, unified REST API that allows you to interact with your NoSQL Firestore data using standard, relational SQL. You don't need to learn complex SDKs or NoSQL data modeling patterns—just send SQL queries over HTTP, and our custom execution engine will handle the heavy lifting.

---

## 🔐 Authentication

To query your database from an external application, you need an **API Key**. 

### Generating an API Key
1. Log into your Fluxbase Dashboard.
2. Select your Project.
3. Navigate to **API & Settings** (`/api`) in the sidebar.
4. Click **"Create API Key"**.
5. Give your key a descriptive name.
6. **Copy the generated key immediately.** (For security, you won't be able to see it again).

### Using the API Key
Include your API Key in the `Authorization` header of all HTTP requests:
```http
Authorization: Bearer <YOUR_API_KEY>
```

---

## 🔌 The Execution API

Fluxbase exposes a single endpoint to handle all your database operations.

**Endpoint:** `POST https://your-fluxbase-deployment.com/api/execute-sql`

### Request Format

```json
{
  "query": "YOUR SQL QUERY STRING HERE"
}
```

*Note: Because your API Key is scoped to a specific project, you do not need to pass a `projectId` in the JSON payload.*

### Successful Response Format

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

### Error Response Format

If your SQL syntax is invalid, or if you attempt an unsupported operation, the API will return a `400 Bad Request` or `500 Internal Server Error` with an explanatory message.

```json
{
  "success": false,
  "error": "Syntax Error: Expected valid SQL keywords near..."
}
```

---

## 🛠️ Supported SQL Operations

The Fluxbase parser engine translates standard SQL strings into targeted Firestore operations. Below is a list of supported operations.

### 1. SELECT Queries
Retrieve data from one or more tables.

```sql
-- Retrieve all columns
SELECT * FROM users;

-- Limit results
SELECT * FROM users LIMIT 10;

-- Select specific columns
SELECT name, email FROM users;

-- Basic filtering
SELECT * FROM users WHERE active = true;

-- Text matching
SELECT * FROM users WHERE email = 'test@example.com';
```

### 2. Aggregate Queries & GROUP BY
The execution engine can perform basic grouping and counting in memory.

```sql
SELECT status, COUNT(1) FROM tasks GROUP BY status;
```
*(Note: Aggregations load matching documents into engine memory before computing. Avoid grouping unstructured text data across millions of rows).*

### 3. INSERT Statements
Insert structured data into your tables. The engine will automatically generate a UUID for the primary key if it is not provided.

```sql
-- Insert a single row
INSERT INTO members (name, email, plan) VALUES ('John Smith', 'john@example.com', 'Premium');
```

### 4. UPDATE Statements
Modify existing records matching a criteria. The engine evaluates right-hand expressions against current row state.

```sql
-- Simple assignment
UPDATE subscriptions SET status = 'cancelled' WHERE active = false;

-- Dynamic expressions (e.g. increments)
UPDATE metrics SET total_views = total_views + 1 WHERE page_path = '/home';
```

### 5. DELETE Statements
Remove records from a table.

```sql
DELETE FROM tasks WHERE completed = true;
```

---

## ⚠️ Engine Limitations

Because Fluxbase maps relational syntax to a NoSQL backend document store, certain complex relational operations are currently either limited or unsupported:

1. **Complex Joins**: `LEFT JOIN` and `INNER JOIN` are partially supported and processed in-memory. Joining three or more large tables simultaneously will result in degraded performance.
2. **Subqueries**: Nested `SELECT` statements (e.g., `WHERE id IN (SELECT id...)`) are not fully optimized.
3. **Pivots & Window Functions**: Functions like `ROW_NUMBER() OVER()` or `PIVOT` are not supported.

For the most performant experience, design your schema to require minimal cross-table joins.

---

## 🧑‍💻 Example Integrations

Here are examples of how to connect to Fluxbase from popular environments.

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
