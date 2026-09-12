# Environment Setup Documentation
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Environments Overview

| Environment | Purpose | URL |
|---|---|---|
| Development | Local developer machines | http://localhost:3000 |
| Staging | QA and integration testing | https://staging.pms.example.com |
| Production | Live system | https://pms.example.com |

---

## 2. Prerequisites

- Node.js v20.x LTS
- npm v10.x
- Docker & Docker Compose v2.x
- PostgreSQL 15.x (or Docker)
- Redis 7.x (or Docker)
- Git

---

## 3. Local Development Setup

### Step 1: Clone Repository
```bash
git clone https://github.com/your-org/pharmacy-management-system.git
cd pharmacy-management-system
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment
```bash
cp .env.example .env.development
# Edit .env.development with your local values
```

**Required `.env.development` variables:**
```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://pms_user:password@localhost:5432/pms_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-local-dev-secret-min-32-chars
JWT_REFRESH_SECRET=your-local-refresh-secret
SENDGRID_API_KEY=SG.xxxxx (can be dummy in dev)
TWILIO_ACCOUNT_SID=AC... (optional in dev)
```

### Step 4: Start Docker Services
```bash
docker-compose up -d postgres redis
```

### Step 5: Run Database Migrations & Seeds
```bash
npx knex migrate:latest --env development
npx knex seed:run --env development
```

### Step 6: Start Application
```bash
npm run dev
# API available at http://localhost:3000
```

---

## 4. Staging Environment Setup

Staging is deployed automatically via GitHub Actions on merge to `develop` branch. Manual steps:

```bash
# Apply migrations to staging DB
npx knex migrate:latest --env staging
# Trigger deployment via CI or:
aws ecs update-service --cluster pms-staging --service pms-api-staging --force-new-deployment
```

---

## 5. Docker Compose (Local)

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: pms_dev
      POSTGRES_USER: pms_user
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"

  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

---

## 6. Useful Commands

```bash
npm run dev          # Start dev server with hot reload
npm run test         # Run all unit/integration tests
npm run test:e2e     # Run Playwright E2E tests
npm run migrate      # Run DB migrations
npm run seed         # Seed test data
npm run lint         # ESLint check
npm run build        # Production build
```

---

*Owner: [DevOps / Backend Team]*
*Next Review: March 2027*
