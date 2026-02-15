# Flux ⚡
> **Data Management Redefined.**
> The modern, AI-powered spreadsheet and serverless SQL database.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Vercel](https://img.shields.io/badge/Vercel-Ready-black)

## 🚀 Overview

Flux is a next-generation data platform that combines the ease of a spreadsheet with the power of a SQL database. Built for the modern web, it features a **custom server-based SQL engine** that runs entirely on serverless functions (Vercel/Next.js), backed by Firestore for scalar storage.

Whether you are a developer needs a quick backend or a data analyst looking for AI-driven insights, Flux provides a unified interface to manage your data.

## ✨ Key Features

-   **🧠 AI-Powered**: Integrated with Google Genkit for natural language queries and data insights.
-   **⚡ Serverless SQL Engine**: Run complex SQL queries (`SELECT`, `WHERE`, `JOIN`) directly on your data without managing a database server.
-   **🔐 Scoped API Keys**: Generate project-specific API keys to safely access your data from external applications.
-   **📂 CSV Import**: robust, serverless-compatible CSV importer that streams data directly to Firestore batches.
-   **🎨 Modern UI**: Built with Tailwind CSS, Radix UI, and Framer Motion for a premium, IDE-like experience.
-   **☁️ Vercel Ready**: Optimized for serverless deployment with no local filesystem dependencies.

## 🛠️ Tech Stack

-   **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
-   **Language**: TypeScript
-   **Database**: Firebase Firestore (via Admin SDK)
-   **Auth**: Firebase Authentication
-   **AI**: Google Genkit
-   **Styling**: Tailwind CSS + Shadcn/UI
-   **Parsing**: `node-sql-parser`

## 🏁 Getting Started

### Prerequisites
-   Node.js 18+
-   Firebase Project (with Firestore enabled)

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/flux.git
    cd flux
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment**
    Create a `.env.local` file with your Firebase credentials (see `VERCEL_DEPLOY.md` for details).

4.  **Run Locally**
    ```bash
    npm run dev
    ```

## ☁️ Deployment

Flux is designed to be deployed on **Vercel**.

👉 **[Read the Vercel Deployment Guide](./VERCEL_DEPLOY.md)** for detailed instructions on setting up environment variables and Service Accounts.

## 🔌 API Usage

Flux provides a powerful SQL API for your projects.

### Execute SQL
**Endpoint**: `POST /api/execute-sql`

```bash
curl -X POST https://your-app.vercel.app/api/execute-sql \
  -H "Authorization: Bearer YOUR_SCOPED_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT * FROM users WHERE active = true"
  }'
```

*Note: When using a Scoped API Key, you do not need to provide a `projectId`.*

## 📄 License

This project is licensed under the MIT License.
