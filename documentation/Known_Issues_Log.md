# Known Issues Log
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## Purpose

This document tracks known issues, limitations, and workarounds for the current version of the Pharmacy Management System. It is updated with each release.

---

## Active Known Issues

| Issue ID | Version | Module | Description | Severity | Workaround | Target Fix |
|---|---|---|---|---|---|---|
| KI-001 | v1.0.0 | Integration | Cold chain MQTT broker requires manual configuration during initial setup | Medium | Follow Integration Design Document § 6 | v1.1.0 |
| KI-002 | v1.0.0 | Integration | EHR integration requires manual OAuth credential setup with EHR vendor | Medium | Contact EHR vendor for client ID/secret; enter in Settings → Integrations | v1.1.0 |
| KI-003 | v1.0.0 | Reports | Large report exports (> 10,000 rows) may take up to 60 seconds to generate | Low | Export in smaller date ranges | v1.1.0 |
| KI-004 | v1.0.0 | UI | Dashboard slow to load when > 500 active alerts present | Low | Archive resolved alerts regularly (Settings → Alert Management) | v1.1.0 |

---

## Resolved Issues (v1.0.0)

*No previously tracked issues — initial release.*

---

## Issue Template

When adding a new known issue, use this format:

| Field | Value |
|---|---|
| Issue ID | KI-[NNN] |
| Version Discovered | v[X.X.X] |
| Module | [Module name] |
| Description | Clear description of the issue and when it occurs |
| Severity | Critical / High / Medium / Low |
| Workaround | Step-by-step workaround if available |
| Target Fix Version | v[X.X.X] or TBD |
| Reporter | [Name] |
| Date Reported | [Date] |

---

## Notes

- This log is reviewed at the start of every sprint.
- Issues resolved in a release are moved to the "Resolved Issues" section with the fix version noted.
- Critical issues without a workaround are escalated to the emergency patch process.

---

*Owner: [QA Lead / Tech Lead]*
*Updated: Per sprint / release cycle*
