# fluxbase

> Official JavaScript/TypeScript client SDK for [Fluxbase](https://github.com/Sumith2104/Fluxbase) — the developer-first, SQL-powered backend platform with real-time database subscriptions.

[![npm](https://img.shields.io/npm/v/fluxbase)](https://www.npmjs.com/package/fluxbase)
[![license](https://img.shields.io/npm/l/fluxbase)](LICENSE)
[![types](https://img.shields.io/npm/types/fluxbase)](https://www.npmjs.com/package/fluxbase)

---

## Features

- ⚡ **Real-Time Subscriptions** — Native Server-Sent Events (SSE). No websocket server needed.
- 🔗 **Chainable Query Builder** — `.select()`, `.insert()`, `.update()`, `.delete()`, `.eq()`, `.order()`, `.limit()`.
- 🛡️ **Fully Typed** — First-class TypeScript support with generics.
- 🌍 **Universal** — Works in React, Vue, Next.js, Svelte, Vanilla JS, and Node.js.
- 🔑 **API Key Auth** — Secure row-level access using your project's scoped API key.

---

## Installation

```bash
npm install fluxbase
```

---

## Quick Start

```typescript
import { createClient } from 'fluxbase';

const flux = createClient(
  'https://your-backend.vercel.app',  // Your Fluxbase backend URL
  'your-project-id',                  // Your Project ID
  'fl_your-api-key'                   // Your API Key
);
```

> You can find your **Project ID** and **API Key** in your Fluxbase Dashboard under **Settings → API Keys**.

---

## Reading Data

```typescript
// Fetch all rows from a table
const { data, error } = await flux.from('messages').select('*');

// Select specific columns
const { data } = await flux.from('users').select(['id', 'name', 'email']);

// Filter rows
const { data } = await flux
  .from('messages')
  .select('*')
  .eq('room_code', 'F8BYV1')
  .order('timestamp', 'desc')
  .limit(50);

// Fetch a single row
const { data } = await flux
  .from('users')
  .select('*')
  .eq('id', 'user-123')
  .single();
```

---

## Writing Data

### Insert

```typescript
// Insert a single row
const { success, error } = await flux.from('messages').insert({
  text: 'Hello World!',
  sender_name: 'Alice',
  room_code: 'F8BYV1',
});

// Insert multiple rows at once
await flux.from('messages').insert([
  { text: 'First message', sender_name: 'Alice', room_code: 'F8BYV1' },
  { text: 'Second message', sender_name: 'Bob', room_code: 'F8BYV1' },
]);
```

### Update

```typescript
const { success } = await flux
  .from('users')
  .eq('id', 'user-123')
  .update({ name: 'Updated Name' });
```

### Delete

```typescript
const { success } = await flux
  .from('old_messages')
  .eq('room_code', 'EXPIRED')
  .delete();
```

---

## Raw SQL

For complex queries beyond the query builder:

```typescript
const { data, error } = await flux.sql(
  'SELECT sender_name, COUNT(*) as total FROM messages GROUP BY sender_name'
);
```

---

## Real-Time Subscriptions

Subscribe to live database changes using Server-Sent Events (SSE). No polling. No websockets.

```typescript
const channel = flux
  .channel('chat', 'messages')       // channel name, table name
  .on('row.inserted', (payload) => {
    const newMessage = payload.data?.new;
    console.log('New message received:', newMessage);
  })
  .on('row.deleted', (payload) => {
    console.log('Message deleted');
  })
  .onConnect(() => console.log('🟢 Connected to real-time stream'))
  .onDisconnect(() => console.log('🔴 Disconnected'))
  .subscribe();

// Later, clean up
channel.unsubscribe();
```

### React Example

```tsx
import { useEffect, useState } from 'react';
import { createClient } from 'fluxbase';

const flux = createClient(
  process.env.NEXT_PUBLIC_FLUXBASE_URL!,
  process.env.NEXT_PUBLIC_FLUXBASE_PROJECT_ID!,
  process.env.NEXT_PUBLIC_FLUXBASE_API_KEY!
);

type Message = { id: number; text: string; sender_name: string };

export default function ChatRoom() {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    // Fetch initial history
    flux.from<Message>('messages').select('*').order('timestamp').limit(50)
      .then(({ data }) => setMessages(data || []));

    // Subscribe to new messages
    const channel = flux
      .channel('chat', 'messages')
      .on<Message>('row.inserted', (payload) => {
        const msg = payload.data?.new;
        if (msg) setMessages(prev => [...prev, msg]);
      })
      .subscribe();

    return () => channel.unsubscribe();
  }, []);

  return (
    <div>
      {messages.map(msg => (
        <p key={msg.id}><strong>{msg.sender_name}:</strong> {msg.text}</p>
      ))}
    </div>
  );
}
```

---

## Event Types

| Event           | Triggered When          |
|-----------------|-------------------------|
| `row.inserted`  | A new row is inserted   |
| `row.updated`   | An existing row is updated |
| `row.deleted`   | A row is deleted        |
| `*`             | Any of the above        |

---

## Environment Variables (Recommended)

Never hardcode secrets! Use environment variables:

```env
# .env.local (Next.js) or .env
NEXT_PUBLIC_FLUXBASE_URL=https://your-backend.vercel.app
NEXT_PUBLIC_FLUXBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FLUXBASE_API_KEY=fl_your-api-key
```

```typescript
const flux = createClient(
  process.env.NEXT_PUBLIC_FLUXBASE_URL!,
  process.env.NEXT_PUBLIC_FLUXBASE_PROJECT_ID!,
  process.env.NEXT_PUBLIC_FLUXBASE_API_KEY!
);
```

---

## Filter Operators

| Method              | SQL Equivalent    | Example                                 |
|---------------------|-------------------|-----------------------------------------|
| `.eq(col, val)`     | `col = val`       | `.eq('status', 'active')`               |
| `.neq(col, val)`    | `col != val`      | `.neq('role', 'admin')`                 |
| `.gt(col, val)`     | `col > val`       | `.gt('age', 18)`                        |
| `.gte(col, val)`    | `col >= val`      | `.gte('score', 100)`                    |
| `.lt(col, val)`     | `col < val`       | `.lt('price', 50)`                      |
| `.lte(col, val)`    | `col <= val`      | `.lte('quantity', 10)`                  |
| `.like(col, pat)`   | `col LIKE pat`    | `.like('name', 'John%')`                |
| `.ilike(col, pat)`  | `col ILIKE pat`   | `.ilike('email', '%@gmail.com')`        |

---

## License

MIT © [Sumith2104](https://github.com/Sumith2104/Fluxbase)
