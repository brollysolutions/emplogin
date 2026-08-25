# Publishing Brolly Attendance to Google Play

Everything needed to get the app listed. Copy-paste content is in fenced blocks.

- **Package name:** `in.brollysolutions.attendance` (permanent once uploaded — it can never be changed)
- **Current version:** `versionCode 1`, `versionName "1.0"` in `frontend/android/app/build.gradle`
- **Permissions requested:** `INTERNET` only
- **AAB output:** `frontend/android/app/build/outputs/bundle/release/app-release.aab`

---

## Read this first — two things that can block or reverse the launch

### 1. Public listing may be the wrong choice for an internal HR tool

This app is for Brolly employees. A public Play listing means anyone worldwide can
install it, reach the login screen, and see your branding. That is allowed, but it
invites two problems: reviewers question apps whose entire function is behind a
login with no public value, and you inherit consumer-facing obligations
(data-safety scrutiny, account-deletion flows, support volume).

Google offers a better fit: **Managed Google Play private app**, published to your
organisation only, invisible to the public and not subject to the public-listing
review bar. It needs Google Workspace.

Only you can decide this. If you want the private route, tell me and this document
changes substantially — most of the store-listing content below becomes unnecessary.
The instructions below assume the **public** listing you asked for.

### 2. The app collects Aadhaar and PAN numbers plus ID document images

`Profile Details` stores `aadhar_number`, `pan_number`, `dob`, `address`, a profile
photo, and uploaded Aadhaar/PAN verification files.

Two consequences you should get advice on before publishing:

- **Play Data Safety.** This is sensitive personal data and must be declared. An
  incomplete declaration is one of the most common causes of takedowns, and it is
  checked against what the app actually does.
- **Indian law.** The Aadhaar Act restricts how private entities collect, store and
  display Aadhaar numbers, and the DPDP Act 2023 imposes duties on personal data.
  I am not able to give you legal advice, and this is exactly the kind of thing to
  put in front of someone who can before the app is public.

A narrower alternative worth considering: stop collecting Aadhaar entirely, or store
only the last four digits. It removes most of this risk and the attendance system
does not appear to need the full number.

---

## Step 1 — Create your upload key (you must do this, not me)

The keystore is the identity of your app. If you lose it you can never publish an
update; if it leaks, someone else can publish as you. I have not created it and
never handle its password.

Run this yourself. `!` at the Claude Code prompt runs it in this session:

```
keytool -genkeypair -v -keystore brolly-upload.jks -keyalg RSA -keysize 4096 -validity 10000 -alias brolly-upload
```

It will ask for a password and your organisation details. Use:

- **First and last name:** Brolly Software Solutions
- **Organizational unit:** Engineering
- **Organization:** Brolly Software Solutions
- **City / State / Country code:** your city, your state, `IN`

Then move `brolly-upload.jks` somewhere safe outside the repo, and **back it up**
(password manager or an encrypted drive — not this repository, not email).

`*.jks`, `*.keystore` and `keystore.properties` are now gitignored, so a key left
in `frontend/android/` will not be committed by accident.

> Turn on **Play App Signing** when you create the app in Play Console (it is the
> default). Google then holds the real signing key and this one is only your *upload*
> key — if you ever lose it, support can reset it. Without Play App Signing, a lost
> key ends the app permanently.

## Step 2 — Point Gradle at the key

Create `frontend/android/keystore.properties` (gitignored):

```properties
storeFile=C:/path/to/brolly-upload.jks
storePassword=<the password you chose>
keyAlias=brolly-upload
keyPassword=<the password you chose>
```

Use forward slashes in the path even on Windows — a `.properties` file treats `\`
as an escape character.

## Step 3 — Build the signed AAB

```
cd frontend
npm run build:app
npx cap sync android
cd android
./gradlew bundleRelease
```

Output: `app/build/outputs/bundle/release/app-release.aab`

Verify it is actually signed before uploading:

```
unzip -l app/build/outputs/bundle/release/app-release.aab | grep -E "META-INF/[A-Z0-9_-]+\.(RSA|SF)$"
```

Lines returned = signed. Nothing returned = still unsigned, so `keystore.properties`
was not found or a value in it is wrong.

**Every upload needs a higher `versionCode`.** Bump it in
`frontend/android/app/build.gradle` before each release — 1, 2, 3… Play rejects a
repeat. `versionName` is the human label ("1.0", "1.1") and is yours to choose.

---

## Step 4 — Store listing content

### App name (30 char limit)

```
Brolly Attendance
```

### Short description (80 char limit)

```
Clock in, track work hours, request leave and view your attendance history.
```

### Full description (4000 char limit)

```
Brolly Attendance is the official employee attendance portal for Brolly Software Solutions.

It gives every team member a single place to record their working day and keep track of their own attendance record, whether they are in the office or working from home.

CLOCK IN AND OUT
Start your working day with a single tap. The timer runs continuously while you work, and pausing for a break is recorded separately so your active hours stay accurate. Your current state is always visible at a glance.

TRACK YOUR HOURS
See your active working time, break time and overtime against an eight-hour daily goal. A progress bar shows how much of the day you have completed and how much is left.

ATTENDANCE HISTORY
Review every day you have worked, with clock-in and clock-out times, total hours, break time, overtime and the tasks you recorded. Your full history is available whenever you need it.

LEAVE AND WORK-FROM-HOME REQUESTS
Submit a leave request or a work-from-home request with dates and a reason, and follow it through to approval. Pending requests can be edited or cancelled. When an administrator responds, their comment appears alongside the request.

HOLIDAY CALENDAR
See the company holiday list so you can plan around it, with new entries highlighted.

SUPPORT CHAT
Message your administrator directly from the app when something needs sorting out.

PROFILE
Keep your employment details up to date in one place.

BUILT FOR PHONES
Navigation sits within thumb reach at the bottom of the screen. The clock-in control is on the first screen, with no scrolling. Your attendance history is laid out as one card per day rather than a table squeezed onto a small screen.

WHO THIS APP IS FOR
This app is for current employees of Brolly Software Solutions and requires an account issued by your employer. It is not a general-purpose time-tracking app and you cannot sign up from within it. If you are an employee and cannot sign in, contact hr@brollysolutions.in.

PRIVACY
Attendance data recorded in this app is visible to your employer's administrators, as described in the in-app Privacy and Monitoring Policy. The policy, the Terms and Conditions and the Acceptable Use Policy are all available from the sign-in screen before you log in.

Brolly Software Solutions
hr@brollysolutions.in
```

### Category and tags

- **App category:** Business
- **Tags:** Attendance, Time tracking, HR, Employee, Productivity

### Contact details

- **Email:** `hr@brollysolutions.in`
- **Website:** `https://brollysolutions.in`
- **Privacy policy URL:** `https://brollysolutions.in/login/#/privacy` *(verified live and rendering)*

---

## Step 5 — App access (do not skip this)

**The single most common rejection for an app like this.** Every screen is behind a
login, so a reviewer who cannot sign in sees only a login form and rejects the app
as broken or incomplete.

In **App content → App access**, choose *All or some functionality is restricted*
and add:

- **Name:** Employee login
- **Username / Password:** a dedicated demo employee account — create a real one in
  your roster for this purpose
- **Any other instructions:**

```
This app is the internal attendance portal for employees of Brolly Software Solutions. Accounts are issued by the employer; there is no public sign-up.

Sign in with the credentials above to reach the employee dashboard. From there:
- "Work" tab: tap Start Working to begin a session and see the timer run.
- "Logs" tab: past attendance records, one card per day.
- "Requests" tab: submit a leave or work-from-home request.
- "Holidays" tab: the company holiday calendar.
- "Chat" tab: message an administrator.

The Terms, Privacy and Acceptable Use policies are reachable without signing in, from the links at the bottom of the sign-in screen.
```

Use a demo account you are willing to have a stranger sign into. Do not give a real
employee's credentials, and do not use the administrator account.

---

## Step 6 — Data safety form

Answer honestly and completely; this is checked against actual app behaviour.

**Overall:**

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS) |
| Do you provide a way for users to request that their data is deleted? | **Yes** — via `hr@brollysolutions.in`, per the Privacy Policy |

**Data types to declare.** For every row: *Collected = Yes, Shared = No, Processed
ephemerally = No, Required (not optional), Purpose = App functionality* — plus
Account management where noted.

| Category | Data type | Notes |
|---|---|---|
| Personal info | Name | Employee name |
| Personal info | Email address | Login identifier — also *Account management* |
| Personal info | User IDs | Employee ID / username — also *Account management* |
| Personal info | Address | Profile |
| Personal info | Other info | **Date of birth, Aadhaar number, PAN number** |
| Photos and videos | Photos | Profile photo and uploaded Aadhaar / PAN document images |
| Messages | Other in-app messages | Support chat with administrators |
| App activity | Other actions | Clock-in / clock-out times, break time, task notes, leave requests |

**Do not** declare Location, Contacts, Calendar, Financial info, Health, or
Device/Advertising IDs — the app requests none of them and over-declaring causes
its own review problems.

> The `device_label` sent at login is the browser user-agent string, used to name
> the session in the device list. It is not an advertising or hardware identifier.
> It falls under **App activity → Other actions**, already covered above.

---

## Step 7 — Content rating questionnaire

Category: **Utility, Productivity, Communication or Other**

| Question | Answer |
|---|---|
| Violence, sexual content, profanity, drugs, gambling | **No** to all |
| Does the app share the user's location with other users? | **No** |
| Does the app allow users to interact or exchange content? | **Yes** — support chat with administrators only |
| Is that interaction between users unmoderated? | **No** — employees can only message their own administrator |
| Does the app allow users to purchase digital goods? | **No** |
| Does the app contain ads? | **No** |

Expected outcome: **Everyone / PEGI 3 / IARC 3+**.

## Step 8 — Remaining declarations

| Section | Answer |
|---|---|
| Target audience | **18 and over** — employees only. Not designed for children. |
| Ads | **No ads** |
| In-app purchases | **None** |
| Government app | **No** |
| Financial features | **None** |
| Health apps | **No** |
| News app | **No** |
| COVID-19 contact tracing | **No** |
| Data deletion | Provide `hr@brollysolutions.in` as the contact route |

---

## Step 9 — Graphics you still need

Play will not let you publish without these. I have not produced them — they need
your logo at proper resolution.

| Asset | Spec | Status |
|---|---|---|
| App icon | 512 × 512 PNG, 32-bit, no transparency | **Needed** — the launcher icon in the repo is a low-resolution placeholder crop |
| Feature graphic | 1024 × 500 PNG or JPG, no transparency | **Needed** |
| Phone screenshots | 2–8 images, 16:9 or 9:16, each side 320–3840 px | **Needed** |

For screenshots, the four that show the app best: the Work tab with the timer
running, the Logs tab showing day cards, the Requests form, and the Holidays list.
I can capture these at a clean phone resolution from the running app whenever you
want — say the word.

> The launcher icon currently shipping is an upscaled crop of the wordmark umbrella.
> It will look soft at 512 × 512. Replace it with the original vector or a
> high-resolution export before publishing.

## Step 10 — Release notes

```
First release of the Brolly Attendance mobile app.

- Clock in and out, with break time tracked separately
- Live daily timer against an eight-hour goal
- Full attendance history, one card per day
- Leave and work-from-home requests with approval status
- Company holiday calendar
- Direct chat with your administrator
```

---

## Suggested release path

Do not go straight to production.

1. **Internal testing** — up to 100 testers by email, available in minutes, no
   review wait. Put it in front of a few employees on real phones first.
2. **Closed testing** — a wider group from your team.
3. **Production** — after the data-safety and Aadhaar questions above are settled.

New Play developer accounts registered as individuals must run a closed test with
at least 12 testers for 14 days before production access is granted. Organisation
accounts are exempt. Check which type yours is, because it changes your timeline
considerably.

---

## Checklist

- [ ] Decide public listing vs Managed Google Play private app
- [ ] Get advice on Aadhaar/PAN collection before going public
- [ ] Create and back up the upload keystore (**you**)
- [ ] Write `frontend/android/keystore.properties`
- [ ] Build the signed AAB and verify the signature block exists
- [ ] Create the app in Play Console with Play App Signing enabled
- [ ] Create a demo employee account for reviewers
- [ ] Fill App access with those credentials and the instructions above
- [ ] Complete the Data safety form
- [ ] Complete the content rating questionnaire
- [ ] Produce icon, feature graphic and screenshots
- [ ] Replace the placeholder launcher icon
- [ ] Upload to Internal testing first
- [ ] Rotate `ADMIN_PASSWORD` — it was public in an earlier web bundle
- [ ] Stop the Google Apps Script returning the password column to anonymous callers
