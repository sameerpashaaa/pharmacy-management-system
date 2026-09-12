# Monitoring & Logging Documentation
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Overview

This document describes the monitoring, alerting, and logging strategy for the PMS infrastructure and application.

---

## 2. Monitoring Stack

| Tool | Purpose |
|---|---|
| AWS CloudWatch / Azure Monitor | Infrastructure metrics (CPU, memory, DB) |
| Datadog / Grafana | Application performance monitoring (APM) |
| Uptime Robot / Pingdom | External uptime monitoring |
| PagerDuty | On-call alerting and escalation |
| Sentry | Application error tracking |

---

## 3. Key Metrics Monitored

### Infrastructure
| Metric | Warning Threshold | Critical Threshold |
|---|---|---|
| CPU utilization | > 70% for 5 min | > 90% for 2 min |
| Memory utilization | > 75% | > 90% |
| Disk usage | > 70% | > 85% |
| DB connections | > 80% of max | > 95% of max |
| Redis memory | > 70% | > 90% |

### Application
| Metric | Warning Threshold | Critical Threshold |
|---|---|---|
| API response time (p95) | > 800ms | > 2000ms |
| Error rate (5xx) | > 1% | > 5% |
| Login failure rate | > 10/min | > 50/min |
| Dispensing transaction errors | > 0 | Any critical |

### Business
| Metric | Alert Condition |
|---|---|
| Audit log write failure | Any failure → immediate alert |
| Schedule X transaction failure | Any failure → immediate alert |
| Cold chain breach | Temperature out of range |
| Backup failure | Any daily backup failure |

---

## 4. Logging Strategy

### Log Levels
```
ERROR   — Unhandled exceptions, critical failures
WARN    — Recoverable issues, deprecated usage
INFO    — Business events (stock received, drug dispensed)
DEBUG   — Development only (disabled in production)
```

### Structured Log Format (JSON)
```json
{
  "timestamp": "2026-09-12T21:00:00.000Z",
  "level": "INFO",
  "service": "pms-api",
  "requestId": "uuid",
  "userId": "uuid",
  "action": "DRUG_DISPENSED",
  "drugId": "uuid",
  "batchId": "uuid",
  "quantity": 5,
  "message": "Drug dispensed successfully"
}
```

### Log Retention
| Log Type | Retention | Storage |
|---|---|---|
| Application logs | 90 days hot; 1 year cold | CloudWatch Logs / S3 |
| Audit logs | 7 years | Immutable S3 |
| Security logs | 3 years | CloudWatch + SIEM |
| Infrastructure logs | 30 days | CloudWatch |

---

## 5. Alerting & On-Call

- **PagerDuty** handles on-call rotation.
- P1/P2 alerts: immediate page to on-call engineer.
- P3 alerts: Slack notification + next business day review.
- Escalation: 15 min no-ack → escalate to team lead.

---

## 6. Dashboards

| Dashboard | Audience | URL |
|---|---|---|
| Infrastructure health | DevOps | [Grafana/CloudWatch link] |
| Application APM | Dev + DevOps | [Datadog link] |
| Business metrics | Pharmacy Manager | PMS Admin Panel |
| Security events | Security Team | [SIEM link] |

---

*Owner: [DevOps Team]*
*Next Review: March 2027*
