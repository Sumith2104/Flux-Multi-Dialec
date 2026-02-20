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

## 🛠️ Tech Stack

-   **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
-   **Storage**: Firebase Firestore (via Admin SDK)
-   **Auth**: Firebase Authentication (Single-Tenant)
-   **SQL Parsing**: `node-sql-parser`
-   **Design System**: Tailwind CSS + Shadcn UI + Framer Motion
-   **Data Vis**: Recharts

## 🏁 Getting Started for Developers

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

## 📚 End-User Documentation

If you are an end-user or developer integrating Fluxbase into your own external applications, please read the comprehensive **[User Documentation Guide (USER_GUIDE.md)](./USER_GUIDE.md)** for detailed instructions on acquiring API keys and writing HTTP DB queries.

## 📄 License

This project is licensed under the MIT License.
