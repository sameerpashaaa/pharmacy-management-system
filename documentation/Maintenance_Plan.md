# Maintenance Plan
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Maintenance Types

| Type | Description | Frequency |
|---|---|---|
| Corrective | Bug fixes and error corrections | As needed |
| Preventive | Routine checks, updates, backups | Scheduled |
| Adaptive | Updates due to OS/dependency changes | As needed |
| Perfective | Performance tuning, feature enhancements | Quarterly |

---

## 2. Scheduled Maintenance Activities

### Daily (Automated)
- [ ] Database backup (full + WAL)
- [ ] Audit log integrity check
- [ ] Expiry and reorder alert job run
- [ ] System health check (health endpoint)
- [ ] Log shipping to S3

### Weekly (Automated + Manual Review)
- [ ] Backup restore test to staging
- [ ] Security scan (npm audit, Snyk)
- [ ] Review error logs for anomalies
- [ ] Review failed integration attempts
- [ ] Database query performance check (slow query log)

### Monthly
- [ ] Apply OS security patches (scheduled maintenance window)
- [ ] Review and rotate secrets (if approaching rotation schedule)
- [ ] Review user accounts (deactivate inactive users)
- [ ] Database VACUUM and index maintenance
- [ ] Review monitoring alert thresholds
- [ ] Generate monthly compliance report

### Quarterly
- [ ] Full disaster recovery drill
- [ ] Dependency upgrade review (minor/patch versions)
- [ ] Review and update SOPs and documentation
- [ ] Physical infrastructure inspection (if on-premise)
- [ ] Review RBAC permissions for all users

### Annual
- [ ] Penetration testing
- [ ] Full secret rotation
- [ ] Major dependency upgrades (Node.js LTS, PostgreSQL major version)
- [ ] Staff access review and recertification
- [ ] SLA review with stakeholders

---

## 3. Maintenance Windows

| Environment | Maintenance Window |
|---|---|
| Production | Sundays 01:00–04:00 IST |
| Staging | Any time (with 1-hour notice) |

Users are notified 48 hours in advance via in-app notification and email for any production maintenance.

---

## 4. SLA Targets

| Metric | Target |
|---|---|
| System uptime | ≥ 99.5% monthly |
| Critical bug fix | Within 24 hours |
| High bug fix | Within 72 hours |
| Medium bug fix | Within 2 weeks |
| Planned maintenance notification | 48 hours notice |

---

## 5. Maintenance Log

| Date | Type | Description | Performed By | Duration |
|---|---|---|---|---|
| [Date] | Preventive | Monthly OS patch | [Name] | [Duration] |

---

*Owner: [DevOps Team / System Administrator]*
*Next Review: March 2027*
