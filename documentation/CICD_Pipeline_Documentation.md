# CI/CD Pipeline Documentation
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Overview

The PMS uses **GitHub Actions** for Continuous Integration and Continuous Deployment, with automated testing, Docker image builds, and deployment to AWS ECS.

---

## 2. Pipeline Architecture

```
Developer pushes code
        │
        ▼
[PR Created / Pushed]
        │
        ▼
CI Pipeline (GitHub Actions)
  ├── Lint (ESLint)
  ├── Unit & Integration Tests (Jest)
  ├── Security Scan (npm audit + Snyk)
  └── Build Check
        │
        ▼ (on merge to develop)
Deploy to Staging
  ├── Build Docker Image
  ├── Push to ECR
  ├── Run DB Migrations (staging)
  ├── Deploy to ECS (staging)
  └── Run Smoke Tests
        │
        ▼ (on merge to main / release tag)
Deploy to Production
  ├── Require manual approval (GitHub Environments)
  ├── Build Docker Image
  ├── Push to ECR
  ├── Run DB Migrations (production)
  ├── Deploy to ECS (production - Blue/Green)
  └── Run Smoke Tests
```

---

## 3. GitHub Actions Workflow Files

### `.github/workflows/ci.yml` — Runs on every PR
```yaml
name: CI
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm audit --audit-level=high
```

### `.github/workflows/deploy-staging.yml` — On push to develop
```yaml
name: Deploy Staging
on:
  push:
    branches: [develop]
jobs:
  deploy:
    environment: staging
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build & Push Docker image
        run: |
          docker build -t pms-api:${{ github.sha }} .
          aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
          docker push $ECR_URI/pms-api:${{ github.sha }}
      - name: Deploy to ECS Staging
        run: aws ecs update-service --cluster pms-staging --service pms-api --force-new-deployment
```

---

## 4. Secrets Management in CI

All secrets stored in **GitHub Secrets** / **GitHub Environments**:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `DATABASE_URL_STAGING` / `DATABASE_URL_PRODUCTION`
- `JWT_SECRET`

Never logged; never echoed in workflow output.

---

## 5. Branch Strategy

| Branch | Purpose | Auto-deploy to |
|---|---|---|
| `feature/*` | Feature development | None |
| `develop` | Integration branch | Staging |
| `main` | Production-ready | Production (with approval) |
| `hotfix/*` | Emergency fixes | Production (with approval) |

---

## 6. Deployment Strategy

- **Staging:** Rolling deployment.
- **Production:** **Blue/Green deployment** via AWS CodeDeploy to ensure zero-downtime.

---

*Owner: [DevOps Team]*
*Next Review: March 2027*
