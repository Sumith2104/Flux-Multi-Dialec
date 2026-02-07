# Fluxbase - Database Practice Web App

> **Data Management Redefined.**
> The modern, AI-powered spreadsheet and data analysis tool. Manage projects, create tables, and unlock insights with natural language queries.

## 🚀 Overview

Fluxbase is a comprehensive web application designed to help students and developers practice database management and SQL execution without the hassle of setting up local database servers. It provides a familiar spreadsheet-like interface combined with powerful SQL capabilities, supporting multiple dialects (PostgreSQL, MySQL, Oracle) and AI-driven assistance.

## ✨ Key Features

-   **Multi-Dialect SQL Support**: seamlessly switch between PostgreSQL, MySQL, and Oracle syntax.
-   **AI-Powered Assistant**: Convert natural language questions into complex SQL queries using Google's Genkit.
-   **Spreadsheet Interface**: Edit data inline with a familiar grid view, supports bulk operations.
-   **Visual Database Design**: Automatically generated ERD diagrams that update as your schema evolves.
-   **Instant API Generation**: capable of generating REST endpoints for your tables instantly.
-   **Data Integrity & Safety**: Strict row validation, primary key enforcement, and a "Panic Button" to reset databases.
-   **Secure Authentication**: Robust login and signup with email and social providers (Google, GitHub), featuring password strength indicators.
-   **Project Management**: Organize your work into distinct projects with isolated schemas and data.

## 🛠️ Tech Stack

-   **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/) & [Shadcn UI](https://ui.shadcn.com/)
-   **Animations**: [Framer Motion](https://www.framer.com/motion/)
-   **Backend / Database**: [Firebase](https://firebase.google.com/) (Auth, Firestore)
-   **AI / LLM**: [Genkit](https://firebase.google.com/docs/genkit)
-   **SQL Parsing**: `node-sql-parser`
-   **Data Grid**: `recharts` & `@mui/x-data-grid`

## 🏁 Getting Started

Follow these steps to set up the project locally.

### Prerequisites

-   Node.js 18+
-   npm or yarn

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/fluxbase.git
    cd fluxbase
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment:**
    Create a `.env.local` file in the root directory and add your Firebase and Genkit credentials:
    ```env
    NEXT_PUBLIC_FIREBASE_API_KEY=...
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
    # ... other firebase config
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```

5.  **Open the app:**
    Visit `http://localhost:3000` (or `http://localhost:9004` if configured) in your browser.

## 📂 Project Structure

```bash
src/
├── app/                  # Next.js App Router pages
│   ├── (app)/            # Authenticated app routes (Dashboard, Editor)
│   ├── api/              # API Routes (SQL execution, Auth)
│   └── page.tsx          # Landing Page
├── components/
│   ├── auth/             # Login/Signup dialogs
│   ├── layout/           # Navbar, Sidebar, Dock
│   ├── ui/               # Reusable UI components (Buttons, Inputs)
│   └── ...
├── lib/                  # Utility functions, Firebase init, Types
└── ai/                   # Genkit AI configurations
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

Built with ❤️ by Sumith
