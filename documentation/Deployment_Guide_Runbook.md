# Deployment Guide / Runbook
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Pre-Deployment Checklist

- [ ] All tests passing in staging environment
- [ ] UAT sign-off received
- [ ] Database migrations reviewed and tested
- [ ] Environment variables verified for target environment
- [ ] Backup taken of current production database
- [ ] Rollback plan ready
- [ ] Maintenance window communicated to users
- [ ] Monitoring dashboards ready

---

## 2. Deployment Architecture

```
GitHub (main branch)
    │
    ▼
GitHub Actions CI/CD Pipeline
    ├── Run tests
    ├── Build Docker image
    ├── Push to ECR / Container Registry
    └── Deploy to AWS ECS / Azure Container Apps
            │
            ▼
        Load Balancer
            │
        ┌──┴──┐
    App Server  App Server (auto-scaled)
            │
        PostgreSQL RDS (managed)
        Redis ElastiCache
```

---

## 3. Step-by-Step Deployment

### Step 1: Run CI Pipeline
```bash
git checkout main
git pull origin main
git tag -a v1.x.x -m "Release v1.x.x"
git push origin v1.x.x
# GitHub Actions triggers automatically
```

### Step 2: Verify Build in CI
- Open GitHub Actions → confirm all steps pass: lint → test → build → push image.

### Step 3: Apply Database Migrations
```bash
# SSH to bastion host or use CI migration step
npx knex migrate:latest --env production
```
Verify migration: `npx knex migrate:currentVersion`

### Step 4: Deploy Application
```bash
# Via GitHub Actions (automated) OR manual:
aws ecs update-service --cluster pms-cluster --service pms-api --force-new-deployment
```

### Step 5: Post-Deployment Smoke Tests
```bash
curl -f https://api.pms.example.com/health
# Expected: { "status": "ok", "version": "1.x.x" }
```

Run smoke test suite: `npm run test:smoke -- --env=production`

### Step 6: Monitor
- Watch CloudWatch / Datadog dashboards for 15 minutes post-deployment.
- Check error rate, latency, and DB connection pool.

---

## 4. Environment Variables (Production)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | JWT signing secret (from AWS Secrets Manager) |
| `JWT_REFRESH_SECRET` | Refresh token secret |
| `AWS_S3_BUCKET` | File storage bucket name |
| `SENDGRID_API_KEY` | Email delivery |
| `TWILIO_ACCOUNT_SID` | SMS alerts |
| `EHR_API_URL` | EHR/EMR integration base URL |

All secrets are injected from AWS Secrets Manager / Azure Key Vault — NOT hardcoded.

---

## 5. Health Check Endpoints

| Endpoint | Expected Response |
|---|---|
| `GET /health` | `{ "status": "ok" }` |
| `GET /health/db` | `{ "status": "ok", "latency_ms": X }` |
| `GET /health/redis` | `{ "status": "ok" }` |

---

*Owner: [DevOps Team]*
*Next Review: Per release*
