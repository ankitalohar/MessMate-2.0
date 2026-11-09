# MessMate

MessMate is a React-based hostel dining application backed by an Express REST API and MongoDB. Students can view daily menus and submit breakfast, lunch, Tea Time, and dinner preferences. Admins can manage menus and accounts, review live meal counts, estimate food quantities, and send email notifications.

## Requirements

- Node.js 20 or newer
- npm
- MongoDB running locally or a MongoDB connection URI

## Local setup

From the repository root:

```powershell
Copy-Item .\server\.env.example .\server\.env
npm install
```

Edit `server/.env` and set a private `JWT_SECRET` (at least 32 characters) and an `ADMIN_REGISTRATION_KEY`. Generate random values with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set `MONGODB_URI` to your MongoDB instance. The example uses:

```text
mongodb://127.0.0.1:27017/MessMate
```

To start a local MongoDB process when MongoDB Database Server is installed:

```powershell
New-Item -ItemType Directory -Force C:\data\db
mongod --dbpath C:\data\db
```

Alternatively, start the MongoDB Windows service if you installed MongoDB as a service.

Open two terminals at the repository root:

```powershell
npm run dev:server
```

```powershell
npm run dev:frontend
```

The single Express API listens on `http://127.0.0.1:5000`; Vite runs on `http://127.0.0.1:5173` and proxies `/api` requests to it. Vite uses a strict port and reports an error rather than silently choosing another port. You can override the proxy target with `MESSMATE_API_TARGET` when starting Vite. The frontend can also be built with `npm run build`.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `5000`) |
| `MONGODB_URI` | MongoDB connection string; keep it server-side |
| `JWT_SECRET` | Secret used to sign session tokens; use 32+ random characters |
| `JWT_EXPIRES_IN` | Token lifetime (default `12h`) |
| `ADMIN_REGISTRATION_KEY` | Private key required for admin registration |
| `CLIENT_ORIGIN` | Allowed browser origins for direct API requests |
| `EMAIL_HOST`, `EMAIL_PORT` | SMTP host and port (`587` uses STARTTLS; `465` uses implicit TLS) |
| `EMAIL_USER`, `EMAIL_PASSWORD` | SMTP credentials; never put these in frontend code |
| `EMAIL_FROM` | Optional sender address/display name; defaults to `EMAIL_USER` |
| `FEEDBACK_NOTIFICATION_EMAIL` | Optional inbox for new student feedback alerts; defaults to the configured sender and then the MessMate notification inbox |

`server/.env` is ignored by Git. Do not commit it.
The API also allows the local development origins `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:3000`, and `http://127.0.0.1:3000`. `CLIENT_ORIGIN` adds comma-separated origins; wildcard origins are not used.

Student meal submission dates and deadlines use the server's fixed `Asia/Kolkata` time zone. Students submit preferences for the next eligible meal date by **10:00 PM IST on the preceding day**. At or after 10:00 PM, the submission date advances; these rules are backend-enforced and are not configurable through the browser or `.env`.

## First admin account

1. Set a strong `ADMIN_REGISTRATION_KEY` in `server/.env`.
2. Open the app and choose **Create account → Admin**.
3. Enter the invitation key to create the initial admin account.
4. Student registration does not require an invitation.

There is no hardcoded default admin account.
Student accounts must use an email address ending exactly in `@giet.edu`; the address is stored in lowercase. This restriction does not apply to administrators.

## MongoDB collections

The `MessMate` database uses these Mongoose collections:

- `users` — student/admin profiles, password hashes, and account status
- `menus` — daily vegetarian/non-vegetarian menus and date-scoped special-menu subdocuments
- `meals` — one student record per date with breakfast/lunch/Tea Time/dinner choices
- `notifications` — email delivery summaries and in-app announcements
- `foodpreparations` — actual quantities prepared, served, and discarded per meal item/date
- `feedbacks` — one student rating and comment per meal/date
- `inventoryitems` — current pantry stock and admin-attributed stock transactions
- `diningattendances` — aggregate actual attendance per meal date
- `studentdiningattendances` — individual QR/staff check-ins, unique per student/date/meal
- `diningqrtokens` — hashed, short-lived student QR tokens; expired records are removed by MongoDB TTL
- `fooddemandpredictions` — one baseline prediction snapshot per date and meal, with actual attendance updated separately
- `fooddonations` — donation reservations and pickup status tied to preparation surplus

Use MongoDB Compass with the same URI as `MONGODB_URI`. After registering users or submitting meal choices, refresh the matching collection to verify the stored documents. Passwords are bcrypt hashes and are never returned by the API.

Tea Time is an additive field on the existing meal and menu documents; existing collections are retained and no destructive migration is required. The October and November 2026 daily menus are inserted only for dates that do not already have a menu, so administrator-managed records are preserved. The November schedule is derived from the supplied Sunday-through-Saturday menu text. Special menus are embedded in the existing dated Menu document; no collection is added. A published special replaces only its selected meal categories for that date, and its VEG/NON-VEG lists remain compatible with student meal preferences.

## API endpoints

All endpoints are prefixed with `/api`.

| Method | Endpoint | Access |
| --- | --- | --- |
| `POST` | `/auth/register` | Public; admin registration requires the invitation key |
| `POST` | `/auth/login` | Public |
| `GET` | `/auth/profile` | Authenticated |
| `GET` | `/student/profile` | Student |
| `GET` | `/student/menu` | Student |
| `GET` | `/student/meals` | Student |
| `GET` | `/student/history` | Student; personal choices and feedback with date/meal filters |
| `GET` | `/student/attendance` | Student; own individual dining check-in history |
| `POST` | `/student/dining-qr` | Student; issue/rotate a 90-second attendance QR token |
| `POST` | `/student/meals` | Student; save one meal |
| `PUT` | `/student/meals` | Student; save one meal or all four preferences atomically |
| `GET` | `/student/notifications` | Student |
| `PATCH` | `/student/notifications/:id/read` | Student; mark an available notification read |
| `GET`, `PUT` | `/student/feedback` | Student; private own records, upsert by date and meal |
| `GET` | `/admin/users` | Admin |
| `PATCH` | `/admin/users/:id/status` | Admin |
| `GET` | `/admin/meals` | Admin |
| `GET` | `/admin/statistics` | Admin |
| `GET` | `/admin/food-quantity` | Admin |
| `GET`, `PUT` | `/admin/food-preparation` | Admin |
| `GET` | `/admin/feedback` | Admin |
| `PATCH` | `/admin/feedback/:id/reviewed` | Admin |
| `GET`, `POST` | `/admin/inventory` | Admin |
| `PATCH` | `/admin/inventory/:id` | Admin; update item details and alert thresholds |
| `POST` | `/admin/inventory/:id/transactions` | Admin; record receipt or usage |
| `GET`, `PUT` | `/admin/attendance` | Admin; aggregate actual count per date and meal |
| `GET` | `/admin/attendance/students?date=YYYY-MM-DD&meal=breakfast` | Admin; individual check-in roster |
| `POST` | `/admin/attendance/scan` | Admin; validate a student QR and record attendance |
| `POST` | `/admin/attendance/manual` | Admin; staff fallback by approved student roll number |
| `POST` | `/admin/food-demand/predict?date=YYYY-MM-DD` | Admin; calculate and save all four meal forecasts |
| `GET` | `/admin/food-demand?from=YYYY-MM-DD&to=YYYY-MM-DD&meal=lunch` | Admin; read saved prediction/actual history |
| `GET`, `POST` | `/admin/donations` | Admin; date filtered and reserves verified surplus |
| `PATCH` | `/admin/donations/:id/status` | Admin; update pickup status |
| `GET`, `POST`, `PUT` | `/admin/menu` | Admin |
| `POST` | `/admin/special-menus` | Admin; add a date-specific special menu |
| `PUT` | `/admin/special-menus/:id` | Admin; edit an occasion, date, meals, food items, or description |
| `PATCH` | `/admin/special-menus/:id/published` | Admin; publish or unpublish a special menu |
| `DELETE` | `/admin/special-menus/:id` | Admin; remove a special menu without deleting its regular date menu |
| `GET` | `/admin/notifications` | Admin |
| `POST` | `/admin/announcements` | Admin |
| `PATCH` | `/admin/announcements/:id` | Admin; update or publish/deactivate |
| `POST` | `/admin/send-email` | Admin |

Admin APIs verify the authenticated account role on the server. The admin meal report shows each registered student’s Breakfast, Lunch, Tea Time, and Dinner choice for the selected date. Food recommendations count confirmed eat choices only; skipped and unselected choices are reported separately, and EAT choices without a valid VEG/NON-VEG type are flagged as incomplete. The optional safety buffer defaults to 0% and can be supplied as the `bufferPercent` query parameter (0–100). Confirmed servings, additional buffer servings, and final planned quantities are displayed separately.

Administrators may configure per-serving ingredient quantities for each meal and diet type in the existing dated menu editor. Enter one item per line as `ingredient name | quantity | unit`, using `g`, `kg`, `ml`, `L`, or `piece`. These values are optional and must be based on the mess's actual measurements; estimates are omitted or marked incomplete until configured. Estimates use confirmed, categorized EAT choices only and do not represent actual consumption or inventory deductions. The optional ingredient fields are stored on the existing Menu documents; no collection migration is required. Older menu updates that omit these fields preserve the saved ingredient configuration.

**Special Menu Management** is available as a separate section in the existing Admin Dashboard. Select one or more meal categories, enter vegetarian and non-vegetarian items, preview the occasion, then save as a draft or publish. Published menus appear on the student dashboard with a SPECIAL MENU badge. A date cannot contain duplicate occasion names, and published special menus cannot replace the same meal category at the same time. The regular menu editor only updates regular menu fields and preserves special-menu subdocuments.

The student dashboard keeps meal choices as a draft until **Save My Meal Preferences** is selected. The authenticated student identity is taken from the session on the backend; the request cannot choose a different student. The existing `/api/student/meals` PUT endpoint accepts all four choices in `meals` and writes them as one atomic update to the existing unique student/date meal record.

The Admin Dashboard's **Food prep & waste** section records actual preparation quantities through `PUT /api/admin/food-preparation` and reads them through `GET /api/admin/food-preparation`. Entries are unique by date, meal, and normalized food-item name, so editing an entry updates it. Prepared, served, remaining, discarded, and unaccounted-surplus quantities are kept distinct and never combined across different units. The selected-date summary and a bounded date-range view include daily prepared/served/discarded totals and the most-discarded items; no financial waste estimate is shown because ingredient cost data is not configured. Records do not alter student preferences, ingredient estimates, or inventory. Access is restricted to authenticated admins. Existing databases gain the additive `foodpreparations` collection and its unique index when the model is first used; no existing collection or record is migrated or deleted.

Students can submit or update a 1–5 star rating and optional comment at **Feedback & Ratings** (`/feedback`). Reviews are unique per authenticated student, meal, and date and are persisted before any email attempt. Admins can filter, search, page through, and mark reviews as reviewed from the Admin Dashboard; reviews are never deleted from that interface. A new review attempts an email to `FEEDBACK_NOTIFICATION_EMAIL`, or falls back to the configured `EMAIL_USER` and then the documented notification inbox address. Email errors are safely logged and do not undo the saved review. Automated tests skip real delivery; SMTP delivery must be verified separately with configured credentials.

Students can browse their own preference and rating data at **My Dining History** (`/student/history`); the API scopes both collections to the authenticated student. Individual meal attendance is shown separately in **My Dining QR** on the student dashboard and is never inferred from meal preferences. Student **Notifications** (`/student/notifications`) shows active in-app announcements and successful email notices, tracks unread state per student, and supports marking notices read. Admins can publish, edit, or deactivate in-app announcements from **Notifications & Announcements** in the existing dashboard. This announcement composer is in-app only; email delivery is available separately through the existing admin email form. Announcement expiry and student audience are stored on the existing notifications collection.

Admin **Inventory Management** stores pantry items, quantities, units, suppliers, purchase/expiry dates, and configurable low-stock thresholds. Receipts and usage are saved in an item transaction history, attributed to the authenticated admin. Stock usage is atomic and cannot take quantities below zero; inventory units are not inferred or converted. The feature does not deduct ingredients automatically from meal plans, and adds the `inventoryitems` collection without changing existing data.

Admin **Dining Attendance** retains the existing aggregate actual count per meal/date. **Dining Attendance Scanner** additionally records individual check-ins in a separate collection. Each student QR contains only a random token, expires after 90 seconds, and is rotated on refresh; MongoDB stores its SHA-256 hash, and the backend rechecks active account and approved student authorization at scan time. The scan endpoint accepts no student ID, while the admin-only camera fallback looks up an approved active student by roll number. The unique student/date/meal index prevents duplicate check-ins. Scans are accepted only in the existing meal schedule (Breakfast 6:30–8:30 AM, Sunday/holiday Breakfast 8:00–9:30 AM, Lunch 12:30–2:30 PM, Tea Time 6:00–7:00 PM, Dinner 8:00–9:45 PM; Asia/Kolkata). The database stores scan instants as UTC dates; meal dates and displayed times use Asia/Kolkata.

**Smart Food Demand Prediction** is an honest baseline, not a trained ML model. It counts only unique `eat` preferences for active, approved student accounts; `skip` and `not-selected` remain distinct. The historical rate prefers same-weekday history from the prior 365 days. With individual scans it counts only scanned students who had selected EAT. Older aggregate attendance can contribute only as a capped estimate and is labeled as such. With no history, the baseline assumes all current EAT selections attend and marks confidence insufficient. A preparation recommendation is shown only when actual served quantities exist in `g` or `kg` and matching actual attendance is available; grams per attendee are calculated from those records, then the total is rounded up to the next 0.5 kg. QR attendance is never treated as measured food consumption. Each date/meal forecast is saved once with EAT count, day, prior attendance, rate, predicted attendance, and data availability; later attendance updates the actual field without rewriting the prediction. No historical records are generated. The feature is integrated above the existing Food Preparation & Waste records, and the chart only shows saved prediction history. No Python service or trained model is included.

Admin **Food Donations** reserves only the remaining unserved, undiscarded quantity recorded in food preparation. Reserved quantities cannot be overcommitted; cancellation releases them, while pending/completed donations remain reserved. Storage, use-by date, recipient, and pickup status are recorded, but the feature does not certify food safety. Existing aggregate attendance and donation records are retained; the new features add only their own collections and indexes.

`server/server.js` is the only Express entry point. It imports the existing route modules from `backend/routes/`; `server/config/db.js` opens the single Mongoose connection before the API begins listening. To start it directly from the `server` directory, run `node server` (or `node server.js`).

## Email notifications

Configure `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, and `EMAIL_PASSWORD` in `server/.env` before sending mail. For Gmail, use `smtp.gmail.com` on port `587` (STARTTLS) or `465` (implicit TLS), and use an app password rather than the account password. The transport security mode is selected from the port; `EMAIL_SECURE` is not needed. In development the API verifies the SMTP connection and authentication before sending. Failures are logged with safe SMTP error codes only; credentials and provider response text are not logged or returned. The API sends to active student accounts individually, records delivery counts, and makes successful/partial notifications visible in the student dashboard. SMTP credentials are never sent to the browser.

## Verification

1. Run `npm install`, then start MongoDB and both development commands above.
2. Register an admin with the server-side invitation key and create menus for the meal dates students will select.
3. Register a student. Before 10:00 PM IST, choose vegetarian/non-vegetarian options or skip Breakfast, Lunch, Tea Time, or Dinner for tomorrow, then save preferences. After the cutoff, the dashboard advances to the next eligible date.
4. Sign in as admin and confirm the student, meal status, statistics, and food quantities reflect those choices.
5. Submit before 10:00 PM IST, then try to edit that same meal date at or after the deadline; the API should reject the update while preserving saved choices for viewing.
6. Configure SMTP and send an email notification; verify its delivery result and the student's in-app notification.
7. Verify admin routes reject student tokens and inspect MongoDB collections in Compass. Admin statistics, meal details, and food quantities use the selected meal date.
8. Run `npm run build` and `npm audit` to check the frontend build and dependencies.
13. In Admin Dashboard, open **Special Menu Management**, add an occasion for a date, select one or more meals, preview, and publish. Verify only those meal cards are replaced on the student dashboard; edit, unpublish, and delete the special menu and confirm the regular dated menu remains intact.
9. Sign in as an approved active student and open **My Dining QR**. Confirm the QR contains no profile details, refresh it to rotate the token, and verify the attendance table is scoped to that student.
10. During a meal's IST serving window, sign in as admin, open **Dining Attendance Scanner**, allow camera access, and scan the student QR. Confirm the check-in appears in student history and the admin roster. Repeat the scan to verify duplicate rejection; use a random or expired token to verify invalid QR rejection. If camera access is unavailable, test the admin-only roll-number fallback.
11. Scan the same student at a different meal and verify it creates a separate record. Deactivate a test account or make its authorization pending, then verify its QR is rejected. Inspect `studentdiningattendances` and confirm there is at most one record per student/date/meal.
12. Submit real EAT preferences and record real check-ins, then open **Food Preparation & Waste → Smart Food Demand Prediction**. Compare EAT, prediction, actual check-ins, and historical g/kg served data. With no matching history, verify the confidence/data label and unavailable consumption estimate; no fake attendance or consumption records should appear.

## Project layout

```text
frontend/
  src/
    api/
    auth/
    components/
    pages/
    styles.css
  index.html
  package.json
  vite.config.js
backend/
  controllers/
  middleware/
  models/
  routes/
  utils/
server/
  config/
  .env.example
  package.json
  server.js
package.json
```
