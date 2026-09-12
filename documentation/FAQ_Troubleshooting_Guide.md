# FAQ / Troubleshooting Guide
**Pharmacy Management System**
*Version: 1.0 | Date: September 2026*

---

## General Questions

**Q: I forgot my password. How do I reset it?**
A: Click **"Forgot Password"** on the login page. Enter your registered email address. You will receive a password reset link valid for 15 minutes. If you don't receive it, check your spam folder or contact your system administrator.

**Q: Why is my account locked?**
A: Accounts are automatically locked after 5 consecutive failed login attempts. The lockout lasts 15 minutes. After that, you can try again. Contact the admin if you need immediate access.

**Q: How do I set up MFA?**
A: Go to **Profile → Security → Enable MFA**. Scan the QR code with Google Authenticator or Microsoft Authenticator. Enter the 6-digit code to confirm setup.

---

## Dispensing Issues

**Q: I can't dispense a drug — it says "Prescription not found."**
A: Check that the prescription ID was entered correctly. If using a barcode scanner, try manual entry. If the prescription is from the EHR, confirm it has been fully created there (some EHR systems have a processing delay of 1–2 minutes).

**Q: The system is blocking my dispensing with "Batch Expired."**
A: The selected batch has expired. The system prevents dispensing of expired drugs automatically. Check if there is a non-expired batch available in stock. If so, the system will automatically select it via FEFO.

**Q: I need to dispense a Schedule X drug but the second authorization field isn't appearing.**
A: Only drugs classified as Schedule X in the drug master require dual authorization. If this is a Schedule X drug and the field isn't appearing, verify the drug's schedule classification — contact the admin to correct it if needed.

---

## Stock & Inventory Issues

**Q: Stock levels don't match the physical count. What should I do?**
A: Go to **Stock → Adjustments** and create an adjustment entry with the appropriate reason code (e.g., DATA_ERROR or BREAKAGE). For large discrepancies, contact the Pharmacy Manager who must approve adjustments over 50 units.

**Q: I received a GRN but stock didn't update.**
A: Verify the GRN was fully submitted (status = RECEIVED, not DRAFT). If it shows RECEIVED but stock hasn't updated, contact the system admin — this may be a sync issue.

**Q: Why is there a red expiry warning on a batch that has 45 days left?**
A: The system shows warnings at 60 days and critical alerts at 30 days. A batch at 45 days will show an orange ⚠️ warning. This is expected behavior to help you prioritize dispensing that batch first.

---

## Procurement Issues

**Q: I can't select a supplier when creating a PO.**
A: The supplier may not be approved yet. Go to **Procurement → Suppliers**, find the supplier, and check their status. Only **Approved** suppliers appear in the PO dropdown.

**Q: My PO has been sitting in "Pending Approval" for days.**
A: PO approval requires an admin or Procurement Head. Send a reminder to your admin, or escalate via your hospital's standard process. You can also check **Procurement → Pending Approvals** to see the approval queue.

---

## Reporting Issues

**Q: My report download is empty.**
A: Verify the date range is correct and that there are transactions within that period. If data should exist, contact your system admin to check if there is a data export issue.

**Q: I need a custom report that isn't available.**
A: Contact your system administrator with the specific data requirements. Custom report requests are logged and scheduled based on priority.

---

## Technical Issues

**Q: The system is slow or pages aren't loading.**
A: Check your internet connection. If the issue persists, check if the system status page shows any active incidents: `https://status.pms.example.com`. Contact the IT helpdesk if the problem continues.

**Q: I'm getting a "403 Forbidden" error.**
A: This means your role doesn't have permission for that action. Verify your role with the system admin. If you believe you should have access, request a role update.

---

*Maintained by: [System Administrator / Support Team]*
*Last Updated: September 2026*
