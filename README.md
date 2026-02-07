# ⚡ Fluxbase

Fluxbase is a modern, self-hosted data management platform featuring a spreadsheet-like interface for intuitive project and data handling.
Built with Next.js, React, and Tailwind CSS, it delivers a fast, responsive UI for creating and managing complex data tables.
Key features include an AI-powered SQL editor, a draggable ERD visualizer for database schema, and automated API generation.
Designed for performance and control, Fluxbase empowers developers to manage their data with simplicity and power on their own infrastructure.

> ⚠ **Note:** Fluxbase is built to run **only on a dedicated server or your own computer**.  
> It will not work properly on platforms like Vercel, Render, Railway, or inside Docker containers, because those environments don't provide reliable local file storage.

---
## 🖥️ Recommended Hardware

Fluxbase is lightweight but benefits from stable, persistent storage and a decent processor.
Here’s what we recommend:

### Recommended for Production (Dedicated Server / VPS)

- CPU: Quad-core or better (Intel Xeon, AMD Ryzen, or similar)
- RAM: 4–8 GB (more if you have many users/projects)
- Storage: 20+ GB SSD (fast read/write improves performance)
- OS: Ubuntu 22.04 LTS or similar Linux distro (most reliable for servers)
- Backup: External storage or automated snapshot backup recommended
---

## ✨ Features

- 🗂 **Multi-Project Management** – Create, switch, and organize multiple projects with ease.  
- 🔑 **Reliable Data Handling** – Every record has its own unique ID, so updates and deletes never break anything.  
- 🖥 **Clean & Modern UI** – Built with Next.js, Tailwind CSS, and shadcn/ui for a seamless experience.  
- ⚡ **Fast CRUD Operations** – Add, edit, delete, and view data instantly — no page reloads.  
- 🌐 **Self-Hosted** – Run it on your computer, VPS, or private server for full control.  
- 🔌 **Future-Friendly** – Easily extendable to connect to external databases or APIs later.  

---

## 📂 Project Structure

```
Fluxbase/
├── docs/                # Documentation and planning
├── src/
│   ├── ai/              # AI-related helpers and logic
│   ├── app/             # Next.js App Router pages & APIs
│   ├── components/      # Reusable UI building blocks
│   ├── database/        # Data storage & unique ID handling
│   ├── hooks/           # Custom React hooks
│   └── lib/             # Utility functions & helpers
│   └── middleware.ts    # Session/auth middleware
├── next.config.ts       # Next.js configuration
├── package.json         # Dependencies & scripts
├── tailwind.config.ts   # Tailwind setup
├── tsconfig.json        # TypeScript configuration
└── README.md
```

---

## 🧩 Tech Stack

Fluxbase is built with a modern, production-ready stack:

### Frontend
- **Next.js 14+ (App Router)** – React-based full-stack framework  
- **TypeScript** – Strongly typed JavaScript for better reliability  
- **Tailwind CSS** – Utility-first styling for fast UI building  
- **shadcn/ui** – Accessible, prebuilt UI components  
- **Lucide Icons** – Clean, customizable icon set  

### Backend
- **Next.js API Routes** – Lightweight server-side logic  
- **Custom Storage Layer** – Manages data persistence and unique row IDs  
- **Middleware** – Auth/session handling and route protection  

### Tooling & Ops
- **PostCSS** – For Tailwind & CSS transformations  
- **ESLint + TypeScript** – Code quality and linting  
- **PM2** – Keeps production server alive  
- **NGINX/Caddy (Optional)** – For HTTPS & reverse proxy setups  

---

## 🚀 Getting Started

### Requirements

- **Node.js v18+**
- **npm** or **yarn**
- A dedicated server or computer where you control file storage

### Installation

```bash
git clone https://github.com/SumithU2104/Fluxbase.git
cd fluxbase
npm install
```

### Local Development

```bash
npm run dev
```

Open your browser and go to **http://localhost:3000**.

### Production Server

```bash
npm run build
npm start
```

Keep it running in the background:

```bash
npm install -g pm2
pm2 start npm --name "Fluxbase" -- run start
```

(Optional) Configure NGINX or Caddy to serve Fluxbase under HTTPS.

### Environment Variables

Create `.env.local` in the root folder:

```bash
PORT=3000
# Add other env vars here
```

---

## 🌍 Deployment Options

- 🖥 Dedicated servers (Linux, macOS, Windows)  
- ☁ Cloud services (Render, DigitalOcean, Railway, AWS EC2)  
- 📦 Containers (Docker support can be added for one-command deploys)  

---

## 👥 Contributing

Got ideas or fixes? Open an issue or create a pull request — contributions are welcome!

---
