# 💧 Water

> A personal water intake tracker with smart push notifications.

## Overview

Water is a full-stack Progressive Web App (PWA) designed to keep your hydration habits on track. It leverages the Web Push Protocol to send actionable reminders directly to your device during your waking hours, ensuring you never miss a glass.

### 📸 Interface

<div align="center">
  <img src="public/readme/ui.png" alt="Application UI" width="80%" />
  <p><em>Minimalist interface for quick logging</em></p>
  
  <br />

  <img src="public/readme/notification.png" alt="Push Notification" width="300" />
  <p><em>Interactive notifications for one-tap logging</em></p>
</div>

---

## ✨ Key Features

- **Smart Reminders:** Push notifications sent via VAPID protocol.
- **Timezone Aware:** Respects your sleep schedule—alerts only active 8 AM - 10 PM (user's local time/customizable).
- **Interactive Actions:** Log water directly from the notification without opening the app.
- **PWA Ready:** Install on iOS, Android, or Desktop for a native app experience.
- **Automated:** Background jobs powered by GitHub Actions.

## 🛠️ Tech Stack

| Component    | Technology          |
| :----------- | :------------------ |
| **Backend**  | NestJS              |
| **Database** | PostgreSQL + Prisma |
| **Frontend** | Vanilla JS (PWA)    |
| **Deploy**   | Vercel              |

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- PostgreSQL Database
- VAPID Keys (for push notifications)

### 1. Setup Environment

Create a `.env` file in the root directory:

```env
DATABASE_URL="postgresql://user:pass@localhost:5432/water"
APP_SECRET="super_secret_key"
CRON_SECRET="scheduler_secret_key"

# Web Push Keys
VAPID_PUBLIC="your_public_key"
VAPID_PRIVATE="your_private_key"
VAPID_SUBJECT="mailto:admin@example.com"
```

### 2. Installation

```bash
# Clone the repo
git clone https://github.com/mapleleafu/water.git
cd water

# Install dependencies
npm install

# Setup database
npx prisma migrate dev
```

### 3. Run Application

```bash
# Start development server
npm run dev

# Build for production
npm run build
npm run start:prod
```

## 🤖 Automation

Reminders are triggered via an external scheduler to keep the app resource-efficient.

- **Workflow:** `.github/workflows/scheduler.yml`
- **Trigger:** Calls `/trigger-reminders` every 2 hours.

---
