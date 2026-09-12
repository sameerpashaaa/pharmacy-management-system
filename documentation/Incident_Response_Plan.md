# Incident Response Plan
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## 1. Purpose

Define procedures for detecting, responding to, and recovering from security incidents that may affect the Pharmacy Management System and the data it holds.

---

## 2. Incident Classification

| Severity | Description | Examples |
|---|---|---|
| P1 — Critical | System down or data breach | DB compromise, ransomware, full outage |
| P2 — High | Significant functionality impacted | Auth bypass, major data corruption |
| P3 — Medium | Partial impact | Feature unavailable, suspicious activity |
| P4 — Low | Minor issue | Failed login spike, minor anomaly |

---

## 3. Incident Response Team

| Role | Responsibility |
|---|---|
| Incident Commander | Coordinates overall response |
| Security Lead | Technical investigation and containment |
| System Admin | Infrastructure access and recovery |
| Pharmacy Manager | Business impact assessment |
| Legal/Compliance Officer | Regulatory notification decisions |
| Communications Lead | Internal/external communications |

---

## 4. Response Phases

### Phase 1: Detection & Identification (0–15 min)
- Monitoring alerts (CloudWatch, SIEM) trigger notification.
- On-call engineer validates the incident.
- Incident severity classified.
- Incident ticket created; Incident Commander notified.

### Phase 2: Containment (15–60 min)
- Isolate affected systems (remove from network if needed).
- Revoke compromised credentials immediately.
- Preserve evidence (take snapshots before any changes).
- Block malicious IPs at WAF/firewall.

### Phase 3: Eradication (1–4 hours)
- Identify root cause (vulnerability, misconfiguration, compromised account).
- Remove malware / unauthorized access vectors.
- Patch vulnerability.

### Phase 4: Recovery (4–24 hours)
- Restore from verified clean backup (if needed).
- Re-enable systems with monitoring.
- Verify system integrity before returning to production.

### Phase 5: Post-Incident Review (within 72 hours)
- Timeline of events documented.
- Root cause analysis.
- Lessons learned and remediation actions.
- Update this plan if needed.

---

## 5. Regulatory Notification Timelines

| Regulation | Notification Timeline |
|---|---|
| GDPR | 72 hours to supervisory authority |
| HIPAA (US) | 60 days to HHS; immediate if large breach |
| DPDP Act (India) | As soon as practicable to DPBI |

---

## 6. Communication Templates

Templates for:
- Internal incident notification email
- Customer-facing breach notification
- Regulatory notification letter

*(Stored in `/documentation/templates/incident-response-templates/`)*

---

*Owner: [Security Team / CISO]*
*Next Review: March 2027*
