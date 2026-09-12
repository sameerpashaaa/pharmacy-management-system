# Backup & Disaster Recovery Plan
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Recovery Objectives

| Metric | Target |
|---|---|
| **RTO** (Recovery Time Objective) | < 4 hours |
| **RPO** (Recovery Point Objective) | < 1 hour (max 1 hour of data loss) |

---

## 2. Backup Strategy

### 2.1 Database (PostgreSQL)

| Backup Type | Frequency | Retention | Storage |
|---|---|---|---|
| Full backup | Daily (2:00 AM) | 30 days | AWS S3 / Azure Blob (encrypted) |
| Incremental (WAL) | Every 15 minutes | 7 days | S3 same region |
| Weekly full backup | Sunday 1:00 AM | 1 year | S3 cross-region |
| Monthly snapshot | 1st of month | 3 years | Cold storage (Glacier / Archive) |

### 2.2 Application Files & Uploads

| Item | Frequency | Retention | Storage |
|---|---|---|---|
| S3 / Blob files | Continuous replication | 30 days versioned | Cross-region S3 |
| Audit log files | Continuous (append-only) | 7 years | Immutable S3 bucket |

### 2.3 Configuration & Infrastructure

- Infrastructure defined as code (Terraform) — stored in Git.
- Application config backed up with each deployment snapshot.

---

## 3. Backup Verification

- Daily automated restore test to staging environment.
- Weekly manual restore test by operations team.
- Monthly full disaster recovery drill.
- Backup integrity check (SHA-256 hash verification) on every backup.

---

## 4. Disaster Recovery Scenarios

### Scenario 1: Database Corruption
1. Detect via monitoring alert.
2. Stop application writes.
3. Restore from latest verified backup (WAL replay to minimize data loss).
4. Validate data integrity.
5. Resume application. Estimated RTO: **1–2 hours**.

### Scenario 2: Application Server Failure
1. Auto-scaling triggers replacement instance (if cloud-hosted).
2. Load balancer routes traffic to healthy instances.
3. Manual re-deployment if auto-scaling fails. Estimated RTO: **15–30 min**.

### Scenario 3: Full Region/Datacenter Failure
1. Activate DR site in secondary region.
2. Update DNS to point to DR environment.
3. Restore from cross-region backup.
Estimated RTO: **3–4 hours**.

### Scenario 4: Ransomware Attack
1. Immediately isolate all affected systems.
2. Do NOT pay ransom.
3. Restore from immutable offline backup (pre-attack).
4. Engage forensics team.
Estimated RTO: **4–8 hours**.

---

## 5. DR Runbook

Detailed step-by-step runbook for each scenario is maintained in:
`/documentation/runbooks/disaster-recovery-runbook.md`

---

## 6. Testing Schedule

| Activity | Frequency | Owner |
|---|---|---|
| Backup restore test | Weekly | DevOps |
| Full DR drill | Quarterly | DevOps + Pharmacy Manager |
| RTO/RPO measurement | After each drill | DevOps |

---

*Owner: [DevOps / Infrastructure Team]*
*Next Review: March 2027*
