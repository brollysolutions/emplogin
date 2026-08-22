/* Policy content for the Brolly Attendance Portal legal pages.
   Kept separate from legal.jsx so that file only exports a component
   (React Fast Refresh requirement).

   Everything an operator may want to change per-deployment lives in
   POLICY below; the document text follows. */

/* -- Operator-configurable facts ------------------------------ */
export const POLICY = {
  company: "Brolly Software Solutions",
  product: "Brolly Attendance Portal",
  version: "v2.0",
  effectiveDate: "22 August 2026",
  lastUpdated: "22 August 2026",
  // TODO: replace with the official HR / grievance mailbox before rollout.
  contactEmail: "hr@brollysolutions.in",
  jurisdiction: "India",
  timezone: "Asia/Kolkata (IST)",
  officeStart: "10:00 AM IST",
  standardDay: "8 hours",
  sessionHours: 12,
  annualLeave: 16,
  disputeWindowDays: 7,
  retentionYears: 8,
};

/* -- Documents ------------------------------------------------ */
export const DOCS = {
  terms: {
    label: "Terms & Conditions",
    title: "Terms & Conditions of Use",
    summary:
      "The rules for using the " + POLICY.product + ". They describe how the portal records your working day, what it expects from you, and what you can expect from it. They sit alongside your employment contract — they do not replace it.",
    sections: [
      {
        h: "1. Acceptance",
        p: [
          "The " + POLICY.product + " (" + POLICY.version + ") is an internal system operated by " + POLICY.company + " (“the Company”, “we”, “us”) for its employees and authorised administrators.",
          "By signing in you confirm that you have read and accept these Terms, the Privacy & Monitoring Policy, and the Acceptable Use Policy. If you do not accept them, do not sign in — raise the matter with your reporting manager or HR instead.",
          "These Terms take effect on " + POLICY.effectiveDate + " and apply every time you use the portal.",
        ],
      },
      {
        h: "2. Who may use the portal",
        p: [
          "Access is limited to people on the Company's active employee roster and to administrators the Company designates. The roster is the source of truth: when your record is added, changed, or removed there, your portal access follows it, usually within minutes.",
          "Your credentials are personal and non-transferable.",
        ],
        list: [
          "Keep your password confidential and do not reuse it on unrelated services.",
          "Never sign in on someone else's behalf, and never let anyone sign in as you.",
          "Tell an administrator immediately if you believe your account has been used by someone else.",
        ],
      },
      {
        h: "3. Sessions and devices",
        p: [
          "Signing in creates a server-side session that stays valid for up to " + POLICY.sessionHours + " hours before it expires and asks you to sign in again.",
          "You may be signed in on more than one device. Signing out — on any device — ends the session everywhere; your other devices will notice on their next check and return to the login screen. An administrator can also revoke a session, for example when a device is lost or when you leave the Company.",
          "The portal stores a session marker in your browser's local storage so that reopening a tab does not sign you out. Clearing your browser data will sign you out.",
        ],
      },
      {
        h: "4. How your working time is recorded",
        p: [
          "The portal records the working day from the moment you clock in until you clock out: start time, end time, break periods, total hours, and any hours beyond the standard day of " + POLICY.standardDay + ", which are recorded as extra hours.",
          "While you are clocked in, the portal sends a periodic heartbeat so the server knows the session is still live. This is the point most worth being clear about:",
        ],
        list: [
          "The work timer counts continuously once you clock in. A lost connection, a closed laptop lid, or a missed heartbeat is never subtracted from your hours.",
          "Connectivity gaps are written to an offline log purely as a record of what the network did — not as a deduction, and not as an accusation.",
          "Only breaks you start yourself are deducted, and each break is logged with its own start and end time.",
          "If a session is still open when the day rolls over, an automated job closes it using your last recorded heartbeat as the clock-out time and marks the record as auto-completed, so an open session never inflates your hours.",
        ],
      },
      {
        h: "5. Attendance expectations",
        p: [
          "The standard office start time is " + POLICY.officeStart + ". If you have not clocked in by then, the system emails you an automatic reminder. It is a reminder, nothing more — it is sent by a scheduled job, not by a person watching you, and it is skipped on Sundays, on holidays declared by an administrator, and for anyone on approved leave.",
          "Clock in when you actually start work and clock out when you actually stop. Deliberately misrepresenting your attendance — including asking a colleague to clock in for you — is a disciplinary matter.",
        ],
      },
      {
        h: "6. Tasks",
        p: [
          "Administrators may assign tasks to you through the portal. The system records when a task was assigned, when you first opened it, and when you marked it complete.",
          "Where a task asks for evidence of completion, you may attach a screenshot or image. Only files you choose and upload yourself are stored — the portal never captures your screen on its own.",
        ],
      },
      {
        h: "7. Leave and holidays",
        p: [
          "Each employee is allotted " + POLICY.annualLeave + " leaves per year by default; your actual balance is shown on your dashboard and may differ where your contract or a manager's adjustment says so.",
          "Leave is applied for in the portal and takes effect only once an administrator approves it. On approval the balance is deducted automatically, and Sundays falling inside a leave period are not counted against it. Holidays are declared centrally by an administrator and apply to everyone.",
          "An application that has not yet been approved is not leave. Do not treat a pending request as permission to be absent.",
        ],
      },
      {
        h: "8. Messages and notifications",
        p: [
          "The portal includes direct and group messaging between employees and administrators, and it sends email notifications for things like attendance reminders, task assignment, and leave decisions.",
          "Messages sent through the portal are Company records on Company systems. Use the channel for work, keep it civil, and assume it is retained.",
        ],
      },
      {
        h: "9. Accuracy of your record, and disputes",
        p: [
          "You can see your own attendance, hours, tasks, leave balance, and performance scorecard at any time. That is deliberate: you are shown the same record your employer is shown.",
          "Please check it. If something looks wrong — a missing clock-out, a break that was not yours, hours that do not match your day — raise it with your reporting manager or an administrator within " + POLICY.disputeWindowDays + " working days, so it can be corrected while everyone still remembers the day in question.",
          "Only an administrator can amend a record, and amendments are made on the record itself rather than by deleting history.",
        ],
      },
      {
        h: "10. Acceptable use",
        p: [
          "Use the portal for its purpose, honestly, and without interfering with it or with anyone else's use of it. The full list of expectations and prohibitions is set out in the Acceptable Use Policy, which forms part of these Terms.",
        ],
      },
      {
        h: "11. Company property and confidentiality",
        p: [
          "The portal, its content, and the records it holds are the property of the Company. Attendance data, rosters, task details, and messages are internal information.",
          "Do not copy, export, publish, or forward portal data outside the Company except where your role requires it and you are authorised to do so. Exports generated by the portal (for example attendance spreadsheets) remain Company data after they leave the screen.",
        ],
      },
      {
        h: "12. Availability and changes to the service",
        p: [
          "We aim to keep the portal available during working hours, but it is provided on an as-is basis without a guaranteed uptime. Maintenance, deployments, and outages can happen; when a new version ships, open tabs refresh themselves to pick it up.",
          "If the portal is unavailable when you need to clock in or out, tell your reporting manager as soon as you can so the record can be corrected manually.",
        ],
      },
      {
        h: "13. Suspension and withdrawal of access",
        p: [
          "The Company may suspend or withdraw access where these Terms are breached, where an account is compromised, where the roster no longer lists you as active, or on the end of your employment. Withdrawal of access does not delete records already created; retention is covered by the Privacy & Monitoring Policy.",
        ],
      },
      {
        h: "14. Relationship to your employment",
        p: [
          "These Terms govern the use of a piece of software. They do not vary your employment contract, your statutory entitlements, or any applicable labour law, and nothing in them removes a right you hold under law.",
          "Where these Terms and your employment contract genuinely conflict, the employment contract and applicable law prevail.",
        ],
      },
      {
        h: "15. Changes to these Terms",
        p: [
          "We may update these Terms as the portal changes. The revision date at the top of this page always reflects the current version, and material changes will be communicated through the portal or by email. Continuing to use the portal after a change means you accept the revised Terms.",
        ],
      },
      {
        h: "16. Governing law and contact",
        p: [
          "These Terms are governed by the laws of " + POLICY.jurisdiction + ", and the courts of " + POLICY.jurisdiction + " have jurisdiction over any dispute arising from them.",
          "Questions about these Terms go to your reporting manager, to an administrator through the portal's messaging, or to " + POLICY.contactEmail + ".",
        ],
      },
    ],
  },

  privacy: {
    label: "Privacy Policy",
    title: "Privacy & Monitoring Policy",
    summary:
      "What the portal records about you, why, who can see it, how long it is kept — and, just as importantly, what it deliberately does not record.",
    sections: [
      {
        h: "1. Who is responsible",
        p: [
          POLICY.company + " is the data fiduciary for the personal data processed in the " + POLICY.product + ". The portal runs on infrastructure the Company controls, and the server operates on " + POLICY.timezone + ".",
          "This policy covers the portal only. It does not cover other Company systems, your personal accounts, or anything you do outside the portal.",
        ],
      },
      {
        h: "2. What the portal records",
        p: ["The portal holds the following categories of data about you:"],
        list: [
          "Identity and profile — name, employee ID, department, designation, date of birth, joining date, work location, contact number, email address, and a profile photograph where you upload one.",
          "Identity documents — Aadhaar and PAN numbers and, where HR requires them, images of those documents. These are sensitive and carry the additional safeguards in section 8.",
          "Attendance and timing — clock-in and clock-out times, total hours, extra hours, break start and end times, connectivity gaps recorded in the offline log, current status, and the heartbeat timestamp showing when the portal last saw your session as live.",
          "Work records — tasks assigned to you, when you opened them, when you completed them, and any screenshot or file you attach as evidence of completion.",
          "Leave and absence — leave applications, dates, the reason you give, approval status, reviewer comments, and your remaining balance.",
          "Messages — direct and group messages you send in the portal, including images, with timestamps and read status.",
          "Session and access records — the session token, an approximate device label, session creation and expiry times, and when the session was last seen. Standard server logs may also record the request time and IP address.",
        ],
      },
      {
        h: "3. What the portal does not do",
        p: ["The monitoring in this system is deliberately narrow. The portal does not:"],
        list: [
          "Capture, record, or stream your screen. The only screenshots stored are ones you attach to a task yourself.",
          "Log your keystrokes, mouse movement, or idle time.",
          "Access your camera or microphone.",
          "Track your GPS location or movement. The location field on your profile is a text field about your work base, entered by you or by HR.",
          "Read your browsing history, your files, your personal email, or anything outside the portal tab.",
          "Score or rank you on anything other than the attendance, task, and leave data described above.",
        ],
        note:
          "The heartbeat is often misunderstood, so plainly: it is a small periodic signal saying “this session is still open”. It carries no information about what you are doing, and a gap in it never reduces your recorded hours.",
      },
      {
        h: "4. Why we process it",
        p: ["Each category is processed for a specific, stated purpose:"],
        list: [
          "To operate attendance and timekeeping, and to calculate hours, overtime, and leave balances — necessary for the performance of your employment contract.",
          "To administer payroll, statutory records, and audits — necessary for compliance with legal obligations that apply to the Company as an employer.",
          "To manage and assign work, and to give you and your manager the same view of it — a legitimate interest in running the business.",
          "To secure the system — session validation, revocation, and fraud prevention.",
          "To send operational notifications you would otherwise have to be chased for, such as attendance reminders and leave decisions.",
          "We do not use your data for advertising, we do not sell it, and we do not profile you for any purpose outside employment administration.",
        ],
      },
      {
        h: "5. Who can see it",
        p: [
          "You can see your own complete record at any time from your dashboard — the same figures your employer sees. Aggregate rankings visible to colleagues show performance standings only; they do not expose your profile documents, leave reasons, or private messages.",
          "Administrators and authorised HR personnel can see attendance, tasks, leave, and profile records for the employees they administer, because approving leave and running payroll requires it.",
          "Outside the Company, data is shared only with the service providers that make the portal work, and only to the extent they need:",
        ],
        list: [
          "The email provider used to deliver notification and reminder mail.",
          "Google Sheets, which holds the employee roster the portal reconciles against.",
          "The hosting provider running the Company's server and database.",
          "Anyone we are legally required to disclose to — for example a statutory authority, an auditor, or a court order.",
        ],
      },
      {
        h: "6. Where it is stored",
        p: [
          "Records are stored in the Company's own database on Company-controlled infrastructure, together with uploaded files such as profile photos, identity documents, task screenshots, and chat images. Traffic between your browser and the server is encrypted in transit.",
        ],
      },
      {
        h: "7. How long it is kept",
        list: [
          "Attendance, leave, and payroll-relevant records: for the duration of your employment and for up to " + POLICY.retentionYears + " years afterwards, in line with statutory record-keeping obligations.",
          "Profile details and identity documents: for the duration of your employment and for as long afterwards as a statutory or contractual obligation requires; they are deleted or archived once that period ends.",
          "Task records and their attachments: for the duration of your employment, subject to any project or audit requirement.",
          "Messages: retained while operationally useful, and longer where an investigation, dispute, or legal obligation requires it.",
          "Session records: sessions expire after " + POLICY.sessionHours + " hours; expired and revoked sessions are cleared periodically.",
          "Where a dispute, investigation, or legal claim is live, the relevant records are retained until it concludes, even if a period above has elapsed.",
        ],
      },
      {
        h: "8. Security",
        p: [
          "Passwords are stored as one-way hashes and cannot be read back by anyone, including administrators; a forgotten password is reset by a single-use link that expires within an hour, never by someone reading your old one.",
          "Sessions are server-side and revocable, so access can be cut off immediately across every device. Administrative endpoints are restricted to administrator sessions.",
          "Access to identity documents is limited to authorised HR and administrator accounts. You are asked to upload them only where HR genuinely requires them; if you believe a document on your profile is no longer needed, ask for it to be removed.",
          "No system is perfectly secure. If you suspect a breach — of your account or of the portal — report it to an administrator immediately so the session can be revoked.",
        ],
      },
      {
        h: "9. Cookies and local storage",
        p: [
          "The portal uses your browser's local storage to remember that you are signed in and to keep the dashboard usable across tabs. It sets no advertising cookies and loads no third-party analytics or tracking scripts. Clearing local storage signs you out and loses nothing else.",
        ],
      },
      {
        h: "10. Your rights",
        p: [
          "Subject to applicable law, including the Digital Personal Data Protection Act, 2023 where it applies to you, you may:",
        ],
        list: [
          "Access the personal data the portal holds about you — most of it is already on your dashboard, and the rest can be requested.",
          "Ask for inaccurate or incomplete data to be corrected, including an attendance record you believe is wrong.",
          "Ask for data to be erased where it is no longer needed and no legal obligation requires us to keep it.",
          "Raise a grievance about how your data is handled, and receive a response.",
          "Withdraw consent where processing rests on consent rather than on contract or legal obligation — noting that core attendance recording is a condition of employment, not an optional extra.",
        ],
        note:
          "To exercise any of these, contact " + POLICY.contactEmail + " or message an administrator in the portal. We will respond within a reasonable period and, where we cannot do what you ask, we will tell you why.",
      },
      {
        h: "11. Changes to this policy",
        p: [
          "If the portal starts collecting something new, this page is updated before or when that happens, and the revision date at the top changes. Material changes are communicated through the portal or by email — we do not expect you to re-read this page to discover them.",
        ],
      },
      {
        h: "12. Contact",
        p: [
          "Questions, requests, and grievances about privacy go to " + POLICY.contactEmail + ", or to an administrator through the portal's messaging.",
        ],
      },
    ],
  },

  use: {
    label: "Acceptable Use",
    title: "Acceptable Use Policy",
    summary:
      "A short, practical list of what is expected of you inside the portal — and what will be treated as misuse.",
    sections: [
      {
        h: "1. Scope",
        p: [
          "This policy applies to everyone with access to the " + POLICY.product + ", including administrators. It forms part of the Terms & Conditions.",
        ],
      },
      {
        h: "2. What is expected",
        list: [
          "Clock in when you start work and clock out when you finish; start a break when you take one.",
          "Keep your profile details current, and correct them when they change.",
          "Check your own record regularly and report anything that looks wrong.",
          "Keep your password private and sign out on shared or public devices.",
          "Keep messages professional and relevant to work.",
          "Report bugs, outages, and suspected security problems rather than working around them quietly.",
        ],
      },
      {
        h: "3. What counts as misuse",
        list: [
          "Clocking in or out for another person, or asking someone to do it for you.",
          "Falsifying attendance, breaks, task completion, or a leave reason.",
          "Sharing credentials, or using an account that is not yours.",
          "Attempting to access, alter, or delete records belonging to other employees without authorisation.",
          "Probing, scanning, or attempting to bypass the portal's authentication, session handling, or administrative controls.",
          "Exporting or forwarding portal data outside the Company without authorisation.",
          "Uploading unlawful, harassing, or malicious content, including in messages and task attachments.",
          "Automating, scripting, or otherwise interfering with the portal to distort what it records.",
        ],
      },
      {
        h: "4. Administrators",
        p: [
          "Administrator access exists to run attendance, tasks, and leave — not to browse. Look at an employee's record when there is a work reason to, act on it transparently, and correct records openly rather than quietly. Administrator actions are attributable and may be reviewed.",
        ],
      },
      {
        h: "5. Consequences",
        p: [
          "Misuse may lead to access being suspended, to correction of the affected records, and to disciplinary action under the Company's normal procedures. Serious cases — falsified time records, unauthorised access to colleagues' data, deliberate data exfiltration — may also carry legal consequences.",
          "If you are unsure whether something is acceptable, ask an administrator before you do it.",
        ],
      },
    ],
  },
};

export const ORDER = ["terms", "privacy", "use"];
export const HASH_FOR = { terms: "#/terms", privacy: "#/privacy", use: "#/acceptable-use" };
