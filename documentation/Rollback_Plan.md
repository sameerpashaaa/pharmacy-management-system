# Rollback Plan
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Purpose

Define the procedure to safely revert a failed production deployment to the previous stable version.

---

## 2. Rollback Decision Criteria

Initiate rollback if, within 30 minutes of deployment:
- P1/P2 errors spike above 2% error rate.
- Critical business function is broken (cannot log in, cannot dispense, cannot receive stock).
- Database migration caused data issues.
- Smoke tests fail on production.

**Decision authority:** On-call engineer + Pharmacy Manager (for business impact confirmation).

---

## 3. Rollback Procedures

### 3.1 Application Rollback (ECS Blue/Green)

```bash
# Get previous task definition revision
aws ecs describe-services --cluster pms-cluster --services pms-api \
  --query 'services[0].taskDefinition'

# Roll back to previous task definition
aws ecs update-service \
  --cluster pms-cluster \
  --service pms-api \
  --task-definition pms-api:<PREVIOUS_REVISION>

# Verify
aws ecs describe-services --cluster pms-cluster --services pms-api \
  --query 'services[0].runningCount'
```

Expected time: **5–10 minutes**.

### 3.2 Database Migration Rollback

```bash
# Roll back last migration
npx knex migrate:rollback --env production

# Verify current migration version
npx knex migrate:currentVersion --env production
```

> [!CAUTION]
> Only roll back migrations if the new migration has not yet been used to write data in production. If data was written with the new schema, a data migration may be needed — involve the DBA.

### 3.3 Emergency: Full Restore from Backup

If rollback is insufficient (data corruption):
1. Initiate database restore from last verified backup (see Backup & DR Plan).
2. Redeploy previous Docker image tag from ECR.
3. Estimated time: **1–3 hours**.

---

## 4. Post-Rollback Steps

1. Notify all users of rollback via in-app announcement + email.
2. Investigate root cause of deployment failure.
3. Fix and test in staging before re-attempting deployment.
4. Document rollback event in incident log.
5. Update deployment checklist if a step was missed.

---

## 5. Rollback Communication Template

```
Subject: [ACTION] PMS System Rollback - [Date]

The Pharmacy Management System has been rolled back to version [X.X.X] 
due to [brief reason].

All data entered after [timestamp] should be reviewed for accuracy.

The team is investigating the root cause. An update will be provided by [time].

For urgent issues, contact [on-call number].
```

---

*Owner: [DevOps Team]*
*Next Review: March 2027*
