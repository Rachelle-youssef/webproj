<<<<<<< HEAD
# LifeLink - step 5: blood and medicine donation platform

Web Programming I final project, built with the 3-tier architecture taught in the course:
**client (browser) → PL (Presentation layer) → BLL (Business logic layer) → DAL (Data access layer) → MySQL**.

**Progress:** The backend modules, role workspaces, expanded admin screens and interactive request map are included. Medicines cover donor submissions, medicine appeals, review, QR labels and scanning, requests and dispensing. Notifications and the community feed are included for all roles. Profile editing, password changes, password confirmation and eye controls are included. The final technical requirements and integration audit is complete; submission documents and demonstration preparation remain.

The testing and requirements guides are supplied separately to keep the original ZIP folder structure.

## Matched donor form fix — November 19, 2026

The admin can now close the matched-donor form with **Cancel**, or by pressing **Find matching donors** again. This sends no invitation. Reopening fetches current matching donors; pressing **Invite donor** still sends the selected invitation normally. The empty matching result can also be closed. A late response after navigating away is ignored.

This is a frontend-only update. For an existing student-readable installation, replace `frontend/Scripts/admin.js` and press Ctrl+F5. No database migration, dependency change or server restart is required for that file replacement. To use this full ZIP as a separate installation, copy your private `backend/.env` into its backend folder, then run `npm ci` and `npm start`.

## Student readability revision — November 19, 2026

This revision starts from the latest polished sessions version, including the dropdown fix. It simplifies the application code while keeping the same folders, file names, API endpoints, database schema and website design. It does not add Docker or Socket.IO.

### Run this version

If you are already using the polished version, stop the previous server, extract this ZIP into a new folder, and copy your existing private `backend/.env` into its backend folder. Run `npm ci` and `npm start` there, then press Ctrl+F5 in the browser. **No additional database migration is needed for this readability revision.** Your existing accounts and records stay in the database named in `.env`.

If you are upgrading from an older sessions ZIP that has not received the hospital-pin update, follow the hospital-pin migration instructions in the next section first. Never use `db:reset` to install a readability update.

### What became easier

- Controllers prepare DTO input, await the business-layer result and send the response on separate lines.
- DTOs show their fields explicitly with statements such as `this.email = email`.
- Account and hospital-location checks use named results and ordinary `if` statements.
- Donor buttons are chosen in `requestAction` and `donationActions` before their HTML is built.
- Admin queue selection uses a regular loop. Overview loading uses `async`/`await` instead of mixing an awaited promise chain with a conditional expression.
- Error feedback is split into small functions for finding changed messages and showing them. HTML escaping has a named character table.

Some files become longer because each step is visible. The goal is easier reading, not fewer characters. Database transactions, parameterised SQL, password hashing, session revocation, validation, request-race guards and parallel loading still serve the same purposes. Bundled third-party libraries remain unchanged.

### Follow one feature through the existing structure

Use **creating a blood request** as the first example:

1. `frontend/Scripts/app.js` reads the current page and mounts `requester.js`.
2. `frontend/Scripts/requester.js` collects the blood form and calls `api()`.
3. `frontend/Scripts/api.js` sends JSON to `/api/v1/blood-requests` using the session cookie.
4. `backend/src/app.js` runs the shared middleware and mounts the API routes.
5. `backend/src/PL/routes/bloodRequests.routes.js` chooses the controller after authentication, role and input checks.
6. `backend/src/PL/validators/blood.validators.js` defines valid request fields. The validation middleware puts the checked data in `req.valid`.
7. `backend/src/PL/controllers/bloodRequests.controller.js` runs:

   ```js
   const input = new BloodRequestInputDTO(req.valid);
   const result = await requestsBLL.create(req.user, input, req.ip);
   created(res, result);
   ```

   `input` carries the allowed fields. The next line asks the BLL to apply the project rules. The final line sends HTTP 201 with the response data.

8. `backend/src/DTO/blood.dto.js` defines those input/output objects.
9. `backend/src/BLL/bloodRequests.bll.js` checks the request limit, hospital-location rules and notification/audit information.
10. `backend/src/DAL/bloodRequests.dal.js` runs prepared SQL and saves related changes together in a transaction.
11. The result travels back through BLL and controller to the browser. The frontend displays the same confirmation and request list as before.

The same route → controller → BLL → DAL pattern is used for the other modules. DTOs carry data between the layers; they do not query MySQL.

### Where to find a feature

All backend paths below are inside `backend/src`.

| Feature | Start here | Follow into |
|---|---|---|
| Registration and login | `PL/controllers/auth.controller.js` | `BLL/auth.bll.js`, `DAL/users.dal.js`, `DTO/user.dto.js` |
| Session creation and logout | `PL/session.js` | `BLL/sessions.bll.js`, `DAL/sessions.dal.js` |
| Checking a signed-in user | `PL/middleware/auth.js` | `BLL/auth.bll.js` |
| Profile/password changes | `PL/controllers/users.controller.js` | `BLL/users.bll.js`, `DAL/users.dal.js` |
| Blood requests and matching | `PL/controllers/bloodRequests.controller.js` | `BLL/bloodRequests.bll.js`, `DAL/bloodRequests.dal.js` |
| Offers, invitations and collection | `PL/controllers/bloodDonations.controller.js` | `BLL/bloodDonations.bll.js`, `DAL/bloodDonations.dal.js` |
| Blood-bank stock | `PL/controllers/bloodStock.controller.js` | `BLL/bloodStock.bll.js`, `DAL/bloodStock.dal.js` |
| Medicine batches and QR PNGs | `PL/controllers/medicines.controller.js` | `BLL/medicines.bll.js`, `DAL/medicines.dal.js` |
| Medicine requests and dispensing | `PL/controllers/medicineRequests.controller.js` | `BLL/medicineRequests.bll.js`, `DAL/medicineRequests.dal.js` |
| Medicine appeals | `PL/controllers/calls.controller.js` | `BLL/calls.bll.js`, `DAL/calls.dal.js` |
| Notifications | `PL/controllers/notifications.controller.js` | `BLL/notifications.bll.js`, `DAL/notifications.dal.js` |
| Public feed/map | `PL/controllers/feed.controller.js` | `BLL/feed.bll.js`, `DAL/feed.dal.js` |
| Admin totals/audit history | `PL/controllers/admin.controller.js` | `BLL/admin.bll.js`, `DAL/admin.dal.js` |
| Rate limits and security headers | `PL/middleware/security.js` | `PL/routes/auth.routes.js`, `config/index.js` |
| Input validation | `PL/validators/` | `PL/middleware/validate.js` |
| Consistent error responses | `shared/errors.js` | `PL/middleware/errorHandler.js` |
| Swagger documentation | `PL/docs/openapi.yaml` | `PL/docs/swagger.js` |

Database tables and relationships are in `backend/database/schema.sql` and `backend/database/erd.md`. The SQL connection, prepared-query helper and transaction helper are in `backend/src/DAL/db.js`.

Frontend page modules are in `frontend/Scripts`: `donor.js`, `requester.js`, `admin.js`, `medicineDonations.js`, `adminManagement.js`, `profile.js`, `requestMap.js` and `medicineScanner.js`. `app.js` chooses which one to mount. Styles stay in `frontend/Styles`, and the main HTML remains `frontend/Views/index.html`.

### JavaScript notation you will still see

| Notation | Meaning in this project |
|---|---|
| `const` / `let` | A variable that is not reassigned / one that can be reassigned. |
| `async` / `await` | Wait for an API/database operation before using its result. |
| `{ email, password }` | Read named properties from an object. |
| `this.email = email` | Store the value on this DTO object. |
| `array.map(...)` | Make a new array from the existing items. Often used to render a list. |
| `...input` | Copy the properties of an object. |
| `value?.name` | Read `name` only when `value` is not null/undefined. |
| `value ?? defaultValue` | Use the default only for null or undefined. |
| `value || defaultValue` | Use the default for any falsy value, including an empty string. |
| `Promise.allSettled(...)` | Load independent information together, retaining the successful results if one call fails. |

Start with one request end to end before reading the next feature. Keep a breakpoint in its controller, then follow the BLL and DAL calls. The test files in `backend/tests` show example inputs and expected behaviour.

## Workflow and interface polish — November 18, 2026

This is the latest release. It keeps server-side MySQL sessions, the community design and the `lifelink-step5/backend` and `lifelink-step5/frontend` layout.

### Upgrade the existing sessions version

1. Stop your Node server and extract this ZIP into a new folder.
2. Copy your existing private `backend/.env` into the new backend folder. Keep the database settings and session secret.
3. Open a terminal in that backend folder and run:

   ```powershell
   npm ci
   npm run db:migrate:hospital-pins
   npm start
   ```

4. Open `http://localhost:3000` and press Ctrl+F5. Existing hospital accounts should save their hospital pin once in **My account**. New hospitals choose it during registration.

The migration adds one boolean column to blood requests, is safe to run twice, and preserves accounts, donations, sessions and other existing records. It uses the administrator settings in `.env`. **Do not run `db:reset` or seed accounts to upgrade.** If you maintain a test database, also run `npm run db:migrate:hospital-pins:test`. Fresh installations already include the column in `db:setup`. The older sessions migration below is needed only when upgrading from the pre-session release.

### What changed

Dropdown lists use a downward-opening picker in browsers supporting customizable select controls (including current Chrome/Edge). Long lists scroll within the space below the field; older browsers retain their native control.

- Login still asks only for email and password. Signup no longer shows unexplained coordinate fields: hospitals pin their location on a map, and donors/patients need no signup coordinates.
- Hospitals reuse their saved name, city and pin for new requests, with an optional per-request override. Changing the profile pin leaves previous requests in place. Patients select the **treating hospital** pin; their home coordinates are never published automatically. Existing patient requests need their hospital pin confirmed once before appearing on the map. Request rows have one clear edit-pin action.
- Errors appear in a dismissible message inside the current viewport, while forms keep their relevant feedback. My account separates personal information from an expandable password form.
- Admin overview cards open the matching review queue directly. Review cards use labelled facts, prominent primary actions and collapsed rejection/cancellation forms.
- An unanswered invitation is described as an invitation when cancelled. Existing historical notifications retain their original text.
- A donor can offer again after withdrawing. The same donor/request record returns to pending, an audit entry records the new attempt, and the admin must accept it again. Re-offering never counts a donation as collected. Declined or admin-cancelled offers cannot be reopened by the donor.
- Map popups follow light/dark mode. Medicine QR lookup starts with image upload and manual lookup; the camera opens only when requested. Scanning and dispensing rules remain in place.

Verification for this release is recorded in `TEST-RESULTS.md`. Earlier sections below describe previous releases; their frontend-only upgrade instructions do not apply to this database-backed update.

## Network hero repair — November 18, 2026

The supplied network-patch.zip contained a new landing template, animation module and styles, but no Three.js assets and no app.js integration. The installed copy still served the old landing.js. This release includes the complete integration: app.js starts the scene when rendering Community home and disposes it on navigation; the updated landing.js supplies the network markup; network.css supplies its styles; and locally bundled Three.js 0.180.0 supplies the renderer and core module with its MIT license.

Open Community home to see Connecting Blood Donors / Supporting Patients / Saving Lives, with a central animated blood drop and donor, patient and medical-assistance nodes. The animation completes its introductory sequence in about five seconds of active animation time. Reduced-motion mode shows a still 3D scene. A static SVG network remains readable if Three.js/WebGL is unavailable or its context is lost. Label widths adapt to narrow panels. The library is loaded only when the home scene is mounted and requires no runtime CDN access.

For an existing installation, replace the frontend folder with the frontend from this release and press Ctrl+F5 in the browser. Keep backend and frontend as sibling folders. No new database migration, dependency installation or server restart is required for this frontend-only update. A separate complete frontend ZIP is also provided. The backend's 122 shipped files match the tested Step 11 sessions release byte for byte. Existing .env and database contents are not included in either ZIP and remain private.

## Step 11 with server-side sessions — November 16, 2026

This is a separate revision of Step 11. It uses `express-session` 1.19.0 and MySQL, replacing the previous JWT authentication. The frontend is unchanged and the calendar is not included. The ZIP keeps the original `lifelink-step5/backend` and `lifelink-step5/frontend` layout.

### Upgrade an existing Step 11 installation

1. Stop the previous Node server and extract this ZIP to a new folder.
2. Copy your private `backend/.env` into the new `backend` folder. Keep the same database settings; your accounts and passwords do not change. The existing `JWT_SECRET` setting is accepted for compatibility as the session-signing secret. You can rename that setting to `SESSION_SECRET`. If both are supplied, `SESSION_SECRET` takes priority.
3. In the new `backend` folder run:

   ```powershell
   npm ci
   npm run db:migrate:sessions
   npm start
   ```

The migration uses `DB_ROOT_USER` and `DB_ROOT_PASSWORD` from your private `.env` to add one table. It is safe to run again and preserves existing data. Do not use `db:reset` or seed demo accounts to upgrade. The API still connects with its limited database account. For an existing test database, also run `npm run db:migrate:sessions:test` before `npm test`.

Open the same address as before (`http://localhost:3000` by default). Sign in again once: the earlier JWT cookie cannot authenticate with this revision. Swagger remains at `/api/docs`. For a brand-new database, follow the installation guide below with `.env.example`, `SESSION_SECRET` and `npm run db:setup`.

### How the sessions work

`express-session` still uses a cookie named `ll_session`. It contains a signed random session ID, not the account details or a JWT. MySQL stores the login data in `sessions`. Each browser/private window can have its own session. The database stores a SHA-256 digest of the ID, so its stored key cannot itself be used as a browser cookie.

- Login and registration regenerate the ID and finish saving the session before returning success.
- Logout deletes that session row and clears its cookie. Replaying the old cookie returns 401; other browsers remain signed in.
- Password changes atomically update the password/version and delete all previous sessions, then issue a new ID for the browser changing the password.
- Deactivation deletes every session for that account and increments its version. Reactivation requires a fresh login; old cookies do not start working again.
- Every protected request checks the account's current status, role and session version in MySQL. Roles and passwords are never stored in session data.
- Sessions expire `SESSION_HOURS` after login (default 8). Activity does not extend that time. Expired rows are removed on the next successful session save. There is no in-memory session store or background cleanup timer.
- Anonymous requests do not create session rows. Cookies are HttpOnly, SameSite=Strict, restricted to `/api` and Secure in production. Production requires HTTPS; if TLS terminates at a reverse proxy, configure Express's trust proxy for that deployment before using it.
- The existing CSRF header, role checks, request validation and rate limits remain in place. A session-store outage returns the standard 503 error instead of falsely reporting successful login/logout.

### Reading the session code

Start at `backend/src/app.js`: `sessionMiddleware()` runs before API routes and supplies `req.session`. In `PL/controllers/auth.controller.js`, login verifies credentials through the BLL and awaits `startSession(req, user, sessionVersion)`.

Then read `PL/session.js` for regenerate/save/destroy and the small Express store adapter; `BLL/sessions.bll.js` for ID hashing; `DTO/session.dto.js` for the saved fields; and `DAL/sessions.dal.js` for the prepared SQL. The sequence is **PL → BLL → DAL → MySQL**, with DTOs carrying the session data. `PL/middleware/auth.js` reads the session and asks `BLL/auth.bll.js` to load and check the current user. Password and deactivation revocation live in transactions in `DAL/users.dal.js`.

To see that logins are saved in MySQL, run this query in your configured database:

```sql
SELECT s.user_id, u.full_name, s.session_version, s.expires_at
FROM sessions s JOIN users u ON u.id = s.user_id
ORDER BY s.expires_at DESC;
```

Sign the same test account into a normal and private window: there should be two rows for that account. Log out of one window and rerun the query: only its row disappears. The other window stays signed in. Restart Node without logging out: an unexpired session still works because its data is in MySQL. Changing the password leaves one renewed session and requires the other window to sign in again.

The earlier audit and release history below describe their dated builds. The previously generated report PDF/Word files describe the earlier authentication and must be updated before submission to describe this session revision. This ZIP's code and the current verification section of `TEST-RESULTS.md` are the source for the updated explanation.

## Step 11: requirements and integration audit

The November 14, 2026 audit checked the three-page project brief, including its rubric. The separate REQUIREMENTS-CHECKLIST-FINAL.md maps requirements to implementation evidence and remaining deliverables. It records technical checks rather than an instructor grade or proof of submission.

Medicine donation and request routes now delegate HTTP handling to medicines.controller.js and medicineRequests.controller.js, matching the other modules. Routes retain authentication, role checks and validation; controllers call the same BLL functions and return the same replies. The architecture tests also check controller use and absence of circular local JavaScript imports. Website behavior, database schema and endpoint URLs are unchanged.

Swagger now includes MedicineCategory, MedicineBatch, AvailableMedicine and MedicineRequest response schemas, list metadata and unique medicine operation IDs. These document the existing API; no request format or response payload changed. All 55 registered API operations match OpenAPI, all local references resolve and all 15 schema tables appear in the ERD.

A fresh isolated database installation, admin creation and demo seed passed. The full backend suite passed 299 tests in 19 suites. All ten browser scripts passed, covering 94 workflow groups plus 13 admin queue views and 21 responsive checks. The final OpenAPI suite passed its 55 endpoint checks again after the documentation edits. TEST-RESULTS.md records the limits, including synthetic camera testing and the outstanding development-tool dependency findings.

Keep your existing backend/.env and database, install dependencies with npm ci and start with npm start from backend. No reset, migration or API URL change is required. Press Ctrl+F5 after restarting. The final report, illustrated manuals and presentation are still separate deliverables; a previously submitted formal proposal was not available to verify.

## Step 10: medicine QR scanner

Admins can open **Scan medicine QR** from the workspace navigation or Medicine inventory. Start camera asks for camera permission and prefers a phone's rear camera. It does not request audio. The camera stops after reading a code, after Stop camera, when leaving the page or when the tab becomes hidden. A late permission response also releases its camera tracks. Camera access requires HTTPS or localhost; see the [browser camera documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

Without a camera, choose a PNG, JPG or WebP QR image up to 10 MB, or enter a batch number. Images are decoded on the device using a local copy of [jsQR 1.4.0](https://github.com/cozmo/jsQR), whose license is bundled under frontend/Assets/jsqr. The decoder is loaded only when starting a camera scan or choosing an image. No runtime CDN dependency or image upload is added.

The existing label format is lifelink:medication:BATCH_ID:exp:YYYY-MM-DD. The scanner rejects unrelated QR contents, impossible dates and invalid IDs instead of following scanned URLs. It loads GET /api/v1/medicines/:id with the current admin session, then displays the name, recorded status, available and donated quantities, expiry date, description and admin note. QR number and expiry are compared with the current record. A mismatch is flagged. A manual lookup explicitly says that no QR label was checked.

Approved batches with stock and an expiry after today in Lebanon show Stock available. Pending, rejected, expired, empty or mismatched batches show their reason for being unavailable. The scanner's date display uses Asia/Beirut, the project's default APP_TIME_ZONE. A scan is an inventory lookup, not medicine-quality verification. It never approves, dispenses or changes stock. Use Medicine review for requests and handoffs; the backend still rechecks stock, expiry and permissions there. Existing API endpoints and backend files are unchanged.

Install by stopping the previous server, extracting this cumulative ZIP to a new folder and copying your existing backend/.env into its backend folder. Keep backend and frontend side by side. Run npm ci and npm start from backend, then press Ctrl+F5. Keep the same API URL and database. No migration or reset is needed.

Quick manual check:

1. Log in as an admin. In Medicine inventory, choose View QR label for an approved batch and save the PNG.
2. Open Scan medicine QR and choose the saved PNG under Read a QR image. The current batch number, expiry, status and quantity should appear.
3. Enter the same number under Know the batch number? The same current record should appear, labelled as a manual lookup.
4. To try the camera, show the label on another device or print it. Choose Start camera, allow permission and hold the whole QR code in view. The camera stops when the label is read.
5. Check that scanning did not change inventory. Dispensing remains a separate action in Medicine review.

## Password confirmation and eye controls

Sign-up now includes a required Confirm password field. Both entries must match exactly before registration is submitted. Editing either entry clears a previous mismatch error. Confirmation stays in the form and is not sent to or stored by the API.

Login, sign-up and password change have an eye button inside every password field. Each button reveals or hides only its own field. Mouse, touch, Enter and Space work, with accessible Show/Hide labels. Eye buttons do not submit forms or change password values. Fields start hidden when opening a form. Successful password changes clear all three password values and reset every eye to the hidden state.

The shared implementation is frontend/Scripts/passwordFields.js and frontend/Styles/password.css. app.js uses it for login/sign-up; profile.js uses it for password changes. All 114 backend files, dependencies and the database schema remain unchanged from the preceding profile release.

Install in the same backend/frontend folder structure. Keep your existing backend/.env, run npm ci and npm start from backend, then refresh with Ctrl+F5. No migration or API URL change is needed.

## Step 9: profile editing and password changes

Open My account from any role's workspace. The page loads the latest saved profile before enabling its forms. Edit your full name, city and optional phone, then choose Save changes. Discard changes restores the last saved details. Email, role and donor blood type remain read-only. Saving a name also updates the header and avatar. Only changed fields are sent, which avoids overwriting unrelated details edited in another session.

Donors can switch Available for blood donation on/off. This controls donor matching and invitations; it does not change blood type, donation history or the waiting period. Every role can optionally edit latitude and longitude under Location for matching. Fill both coordinates, or clear both together. Zero is a valid coordinate. Profile coordinates do not move hospital request pins; those remain attached to individual requests.

You can remove an optional phone by leaving it blank. This release fixes the profile validator so explicit null/blank phones and a null coordinate pair are actually saved as null rather than silently ignored. Numeric coordinates are still range-checked, and partial pairs are rejected. Sign-up validation is unchanged. Swagger documents the nullable profile fields. No schema migration is needed.

For passwords, enter the current password, a new password of 8–128 characters and its confirmation. The new password must differ from the current one. Each eye icon changes only the visibility of its own field. On success, the fields are cleared, this browser remains signed in and other sessions must sign in again. The old password stops working. Password values are not stored in localStorage. During the change, the forms, Log out and Refresh controls are briefly disabled and background count checks are paused to avoid an old request signing this device out during cookie renewal.

Source guide: frontend/Scripts/profile.js builds and handles the account forms; profile.css styles them; app.js connects profile updates to the header and the session-cookie guard. The existing PATCH /api/v1/users/me and PATCH /api/v1/users/me/password APIs are used. Backend changes are limited to profile validation, Swagger clarification and regression tests. The blood-stock constraint test now establishes its own zero-stock baseline inside its rollback transaction instead of relying on test execution order.

Installation stays the same: stop the old server, extract this ZIP to a new folder, copy your existing backend/.env, then run npm ci and npm start from backend. Press Ctrl+F5. Keep your existing API URL and database. No database reset or migration is required.

Quick manual check

1. Sign in and open My account. Edit your name/city/phone, save and refresh. Confirm that the saved values and header name remain updated.
2. Clear the optional phone and save; it should remain blank after refresh. For a donor, toggle availability and save.
3. Try mismatched new passwords or a wrong current password. The form should explain the problem without claiming success.
4. To demonstrate multiple sessions, sign a test account into a normal browser window and a private window. Change its password in the normal window. That window stays signed in; refreshing the private window should require sign-in with the new password.

The requirements review is complete. Next work is the report, user manual, installation guide and presentation.

## Step 8: notifications and community feed

Every signed-in role can open Notifications and Community feed from the workspace navigation. The bell beside the user controls opens Notifications and shows the total unread count across all pages and categories. Counts above 99 display as 99+; the accessible label retains the full count. The count checks again when opening a page, returning to the tab and every 60 seconds while the tab is visible. An open inbox keeps its unread total in sync with the header. Message rows refresh when filters change, a read action completes or the shared refresh icon is used.

The inbox has All/Unread/Read filters, eight notification categories, newest/oldest order and ten rows per page. Mark as read updates one notification. Mark all as read updates every notification belonging to the signed-in user, including records outside the current filter/page. Opening the related workspace is a separate action. Historical notification links are mapped to the correct role's blood, medicine or account workspace; stored links are never opened as arbitrary URLs. Each workspace keeps its own filters and pagination.

Community feed shows completed blood donations and reviewed medicine donations, including medicine batches since dispensed. Filter by blood/medicine and newest/oldest order, and browse ten activities per page. Quantities come from the existing feed API. Donor identities, contacts and home locations are not included in feed records. The feed is available to signed-in users.

The pages use the same #8B1019 design, ivory/green surfaces, responsive layout and light/dark themes. There is still one shared Refresh icon. Notification writes show failures, disable repeated submissions and reload the committed result. If the unread-count service fails, the count is shown as unavailable instead of zero. Session expiry returns to login.

Read frontend/Scripts/notifications.js for the inbox, feed.js for the feed and communityView.js for date, icon, pagination and related-workspace helpers. app.js connects the routes and badge. community.css contains the new page styling. Step 8 left all 114 backend files, the schema, package manifest and lockfile unchanged. Step 9 adds the profile validation fixes described above.

Installation: stop the old server, extract this ZIP to a new folder and copy your existing backend/.env into its backend folder. Run npm ci and npm start from backend, then press Ctrl+F5. The API URL and database settings remain yours. No migration or database reset is needed.

Quick manual check

1. Sign in with any existing account. Open Notifications using the bell or workspace navigation.
2. Compare the unread banner with the bell count. Filters change the list count, while the unread total still covers all categories and pages.
3. Mark one unread item as read and check that the count decreases. Try Mark all as read while a filter is active; it covers all your notifications.
4. Open Community feed, choose Blood donations and then Medicine donations, and try the order and page controls.
5. In a separate browser/private window, use admin to accept an offer or review medicine. Return to the donor window for the updated badge, then use Refresh to load the message. Acceptance is distinct from collection: blood activity appears in the feed only after actual collection is confirmed.

Profile editing, the QR scanner and the requirements review are included in this cumulative release. Submission documents and demonstration preparation are still pending.

## Shared blood-red design

The primary brand color is now deep blood red, #8B1019. Community home, donor/patient/hospital/admin workspaces, account pages, login and registration share the same ivory surfaces, Georgia headings, forest-green accents, flat cards, buttons and form controls. The map keeps its detailed Lebanon boundary and uses the shared palette for its panels and blood pins. Light/dark themes, narrow phone layouts and reduced motion remain supported.

Read frontend/Styles/theme.css for shared colors and components. The tokens at the top control the whole application, including --action-bg for blood-red buttons, --blood for readable text, --bg/--card for surfaces and --medicine-action for medicine buttons. Dark mode keeps the same blood-red action backgrounds and uses lighter text accents for contrast. home.css now reuses these tokens rather than defining a separate palette. workspace.css still defines the workspace's layout and component structure.

The earlier shared-design update changed presentation only, preserving account permissions, requests, statuses, collection and handoff rules. Its 114 backend files were unchanged at that stage. Extract the ZIP with the same backend/frontend structure, keep your existing backend/.env, run npm ci and npm start from backend and refresh with Ctrl+F5. No database migration is needed.

## Community home redesign

Community home now has an ivory, crimson and forest-green design with editorial typography, a bundled Lebanon connection illustration, blood and medicine feature panels, community totals, blood-stock cards, a three-step guide and keyboard-accessible FAQs. The layout adapts from 320-pixel phones to desktop screens and supports light/dark themes and reduced motion. Fonts and artwork require no third-party requests.

Visitors can register or log in. Signed-in users get role-specific links to their blood and medicine pages, request map and workspace. The sidebar returns when opening a workspace. The illustration is decorative; actual open requests remain on Request map. Community totals and all eight blood-stock cards use the existing stats API, with clear unavailable states when it cannot load.

Read frontend/Scripts/landing.js for the homepage content, frontend/Styles/home.css for the scoped styles and frontend/Assets/community-lebanon.svg for the artwork. The app's data-screen attribute selects the homepage layout without interfering with pagination controls. That redesign kept all 114 backend files byte-identical to the preceding detailed-boundary release.

Install using the same backend/frontend folder structure. Copy your existing backend/.env into the extracted backend folder, run npm ci and npm start there, then press Ctrl+F5. No database migration is needed.

## Step 7: donor blood dashboard

All accounts open Overview after signing in. It shows live activity for the signed-in role and links to the Blood and Medicines pages. Donors open Blood donations to see their waiting period, compatible open requests and donation history. Donors can offer blood to a request or to the blood bank, respond to invitations, and withdraw pending or accepted offers. Admin acceptance and physical receipt remain separate stages.

Run npm ci and npm start from backend using your existing .env. The frontend and backend folders must remain side by side. No database migration is needed. To try the dashboard, sign in with any donor. Maya (maya@lifelink.test) and Karim (karim@lifelink.test) use Demo12345 if you seeded the demo accounts. Actual requests and eligibility depend on your database.

Donors open Medicine donations to submit a batch and track its status. Patients and hospitals have separate Blood requests and Medicines pages. Admins have Blood coordination for blood requests, matching, offers, collection and stock handoffs, and Medicine review for batch reviews and medicine handoffs. Use the queue selector within the appropriate admin page.

The admin workspace also includes Accounts, Blood stock, Medicine inventory, Medicine appeals and Audit history. Accounts supports search, role/status filters and activation or deactivation with confirmation. Blood stock includes adjustments with reasons and movement history. Medicine inventory includes batch status filters and QR labels for approved batches. Medicine appeals can be published and closed, and donors can submit linked donations from their Medicine donations page. Admins can publish blood appeals and browse completed, cancelled and declined history using the queue selectors.

Each signed-in account has one circular-arrow Refresh icon beside Log out. It reloads the current page and fetches current data. Unsaved form entries are cleared. The workspace navigation is a sidebar on larger screens and a wrapping navigation bar on smaller screens. Log in and Sign up have separate pages. Admin QR scanning is included in this cumulative release.

## Interactive request map

Every signed-in role can open Request map in the workspace navigation. It displays open hospital/admin blood requests with explicitly supplied hospital coordinates. Blood type, urgency and partial-city filters are applied by the API before pagination. Each page contains up to 20 requests. Requests sharing the same coordinates have a grouped pin, and the request list shows each request separately. Use Show on map to focus a request or Fit shown requests to frame the current page.

The map opens with all of Lebanon visible and a surrounding margin. A country-shaped mask hides neighboring countries and the sea, leaving map tiles visible only inside Lebanon. The blank surrounding margin keeps the full outline visible. Requests whose coordinates fall outside the Lebanon land boundary are excluded before pagination. The shared boundary file is bundled with the application. The detailed outline uses 16,083 vertices from the Central Administration of Statistics Lebanon / HDX, distributed as public-domain data through [geoBoundaries gbHumanitarian](https://www.geoboundaries.org/api/current/gbHumanitarian/LBN/ADM0/). It replaces the earlier 312-point outline. The map mask and country outline disable extra Leaflet simplification, and the API uses the same boundary for location checks.

Hospital accounts choose a point on the map when creating a blood request. Admins have the same picker when publishing a blood appeal. Clicking or dragging the hospital pin fills the coordinates automatically. Manual coordinates are available under Coordinates (optional). A hospital location must be selected before submitting these forms.

For an existing active request, use Set hospital location on its request card, click the hospital point and save. Hospitals may edit their own pending/open requests, and admins may edit active requests through Blood coordination. A hospital request becomes publicly mapped once it is open and has a location inside Lebanon. Location changes have an audit event and preserve the request's status and unit counts.

Donors continue through Blood donations to make an eligible, compatible offer. Patients and hospitals continue through Blood requests, and admins through Blood coordination. The map uses the existing location-privacy rules. Patient-created requests, pending/closed requests and records without hospital coordinates are excluded.

Leaflet 1.9.4 is bundled under frontend/Assets/leaflet with its license. The background uses OpenStreetMap tiles and visible attribution. Background tiles need internet access. If tiles or the library cannot load, the request list remains available. Map-image requests use the origin referrer policy, while scripts remain same-origin. [Leaflet reference](https://leafletjs.com/reference-1.9.4.html), [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/)

The map API keeps its existing URL and response format. It accepts blood_type_id, urgency and city filters. PATCH /api/v1/blood-requests/{id}/location saves a hospital point inside Lebanon. Swagger documents the new endpoint and access rules. No schema changes are needed.

To install this update in an existing project, stop the old server, extract this ZIP to a new folder and copy your private backend/.env into the new backend folder. Run npm ci and npm start from backend, then reload the website with Ctrl+F5. The lockfile includes body-parser 2.4.0, which fixes a high-severity request-parser advisory. No database migration is needed for this update if you already installed the blood acceptance migration.

This release passed 289 automated backend tests and 32 browser workflow groups, comprising six location-picker groups, 10 map groups and 16 blood, medicine and admin regression groups. The admin history views also retain the 13-queue checks from the preceding release. Browser tests used isolated MySQL databases and separate Chrome sessions. Map layout checks covered widths of 390, 768 and 1440 pixels, including light and dark themes. Automated map tests use substitute tile images and do not send automated pan/zoom traffic to OpenStreetMap. The accompanying TEST-RESULTS.md describes coverage, dependency advisories and remaining work.

## Readable code update

Application-owned JavaScript, CSS, HTML and API documentation are expanded into readable formatting. Controllers have named functions, short aliases use descriptive names, and conditions and loops have explicit blocks. The frontend entry point uses ordinary module-level functions. API contracts, database schema and dependencies are unchanged. Vendor libraries keep their original distributed files.

Start reading frontend/Scripts/app.js to follow navigation and forms, then frontend/Scripts/api.js for requests to the backend. The remaining frontend modules each implement a workspace or shared component. Follow a backend feature from PL/routes to PL/controllers, then BLL for rules and DAL for database queries. DTO files describe the data passed between those layers. For example, blood request creation follows bloodRequests.routes.js, bloodRequests.controller.js, bloodRequests.bll.js and bloodRequests.dal.js.

The map frames the whole country with extra space. A theme-aware mask hides map tiles outside Lebanon. Hospital points are still restricted to Lebanon, and Show on map still focuses the selected request. Keep your existing backend/.env when installing this cumulative update.

## Step 6: frontend foundation

If you already run the dispensing release, stop its server, extract this ZIP to a new folder, and copy your private backend/.env there. From backend run npm ci and npm start. Open http://localhost:3000/ (or the configured PORT). No database migration is needed for step 6.

The website files live in the sibling frontend folder. Express serves them on the same address as the API. The landing page uses the original LifeLink layout and theme with live donation totals and blood stock. Use Log in or Sign up. The account page shows the signed-in name, role and donor blood type. If you seeded demo accounts, Maya signs in with maya@lifelink.test and Demo12345. Refresh to verify the session and use Log out to end it. Swagger remains at /api/docs.

Step 6 connected the landing page, registration and sign-in.

## Acceptance fix: upgrade your existing database

This fixed version adds `pending -> accepted -> completed` for blood donations. **Stop the old server, extract this ZIP to a NEW folder and copy your existing private backend/.env into the new backend folder.** Open a terminal there and run:

```powershell
npm ci
npm run db:migrate:acceptance
npm start
```

The migration uses your existing DB_ROOT_USER / DB_ROOT_PASSWORD to alter only the donation status enum and add accepted_at. It preserves all existing users, requests, statuses, units and donation dates. Existing completed donations (including Sara's test donation 4) remain completed. Running it again is safe. No reset is required. Back up important data before a schema upgrade. If migration fails, fix the MySQL administrator settings before starting this version.

For a new installation, db:setup already includes the new schema; no separate migration is necessary. For an existing test database, run `npm run db:migrate:acceptance:test` before `npm test`.

New API: `PATCH /api/v1/blood-donations/{id}/accept` (admin, X-Requested-With: LifeLink, no body). It returns 200, status accepted and accepted_at, sends the donor a notification and records an audit event. It changes no blood units, eligibility or public feed events. `/confirm` now requires accepted status and means physical donation received after screening. Confirming a pending offer returns 409. Donor invitation acceptance still creates pending; the admin must accept it separately. Donors can withdraw accepted appointments, and admins can cancel them with a reason.

Admin queues: `GET /blood-donations?status=pending` for review; `?status=accepted` for awaiting collection. Dashboard adds accepted_donations. The role dashboards are planned for step 7.

See the separately supplied ACCEPTANCE-FIX-GUIDE.md for the next manual test.

## Medicine donation submission and review

If you are upgrading from the tested acceptance fix, extract this release to a new folder, copy your private backend/.env, then run npm ci and npm start from backend. That earlier medicine update used the existing tables. For this server-session revision, run the migration described at the top of this README before starting.

Open Swagger at http://localhost:3000/api/docs/. Sign in as a donor and call GET /medicines/categories. Use a returned category ID to submit a batch with POST /medicines. Example:

```json
{"name":"Test medicine","category_id":1,"quantity_donated":3,"expiry_date":"2030-01-01"}
```

Use a date after today. Write operations require X-Requested-With: LifeLink. The response is 201 with status pending and quantity_available 0. GET /medicines lists the donor's own submissions. Admins can see all submissions and filter by status.

As admin, use PATCH /medicines/{id}/review with {"decision":"approve"} after checking the batch, or {"decision":"reject","note":"Reason for rejection"}. Approval makes the donated quantity available. Rejection leaves zero available. The donor receives a notification, and the decision is recorded in the audit log. An already reviewed donation returns 409.

### QR labels

Sign in as admin in Swagger and call GET /medicines/{id}/qr with the ID of an approved batch. A 200 response returns a PNG image. Swagger can display or download it. Scan the image to read the batch ID and expiry date. Then use GET /medicines/{id} to verify the batch record and its current status. Pending and rejected batches return 409 when you request a label.

### Medicine requests

Sign in as a patient (recipient) or hospital and run GET /medicines/available. It lists approved batches with stock and an expiry date after today, with no donor identity or review details. Copy the batch ID and submit POST /medicine-requests with X-Requested-With: LifeLink and {"medicine_id":1,"quantity":2}, replacing 1 with your batch ID. A successful response is 201 with a pending request. GET /medicine-requests shows the signed-in patient or hospital their own requests. Admins can see all requests and filter by status.

Pending requests do not reserve or deduct stock.

### Dispensing

Once medicine is physically handed out, sign in as admin and call PATCH /medicine-requests/{id}/dispense with X-Requested-With: LifeLink and no body. Use the request ID. The response is 200 with status approved and quantity_available for the batch after dispensing. An exhausted batch becomes dispensed and disappears from the available catalog. The requester is notified and the audit log records the handoff.

Dispensing checks expiry and stock again, locks the request and batch, and updates both together. A repeated attempt or a request that exceeds the remaining stock returns 409. This update needs no database migration if the previous medicine release is already running.

## What you need

- Node.js 24 LTS, **version 24.7 or later** (https://nodejs.org). Check with `node -v`. Earlier versions lack the built-in Argon2 password hashing and the API will refuse to start.
- MySQL Community Server 9.7 LTS or 8.4 LTS (https://dev.mysql.com/downloads/mysql/)
- Visual Studio Code, and MySQL Workbench if you want to look inside the database

## First-time setup

All commands run in a terminal opened in the `backend` folder.

1. Copy the settings file: `copy .env.example .env` on Windows, or `cp .env.example .env` on macOS/Linux.
2. Edit `.env`:
   - `DB_ROOT_PASSWORD`: your MySQL root password.
   - `DB_PASSWORD`: invent a long password (12+ characters) for the API's own MySQL account.
   - `SESSION_SECRET`: paste the output of `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters) for the first admin account.
   - Wrap any value that contains `#` or spaces in double quotes, for example `DB_PASSWORD="abc#123"`.
3. Run:
   ```
   npm install
   npm run db:setup        # creates the database: 16 tables, 27 foreign keys, 13 check constraints
   npm run admin:create    # creates the admin account; then delete ADMIN_PASSWORD from .env
   npm run db:seed         # optional: demo accounts, blood stock, requests and donations
   npm start
   ```
4. Open http://localhost:3000: the page shows the LifeLink landing page with database-backed totals and blood stock.

**Coming from an earlier step?** Step 4 added a column to the blood stock history, so rebuild both databases once (they only hold demo data):

```
npm run db:reset
npm run admin:create
npm run db:seed
npm run db:reset:test
```

`npm run db:reset` deletes the database and builds it again (all data is lost).

## Accounts

| Who | Email | Password |
| --- | --- | --- |
| Admin | the `ADMIN_EMAIL` from `.env` | the `ADMIN_PASSWORD` you chose |
| Donors (after `db:seed`) | maya@ / karim@ / sara@ / rami@lifelink.test | Demo12345 |
| Hospital (after `db:seed`) | hospital@lifelink.test | Demo12345 |
| Recipient (after `db:seed`) | nour@lifelink.test | Demo12345 |

Admins cannot sign up through the website; `npm run admin:create` is the only way to make one.

## Try it in the API docs

Open http://localhost:3000/api/docs while the API runs.

1. Open **POST /auth/login**, click **Try it out**, and set `X-Requested-With` to `LifeLink`.
2. Use `{ "email": "maya@lifelink.test", "password": "Demo12345" }` and click **Execute**: you are signed in (the browser keeps the cookie).
3. **GET /auth/me** now returns Maya's profile, and **GET /users** answers 403 because Maya is not an admin. Sign in as the admin and it lists every account.

With the demo data, try the blood feature:

| Sign in as | Try | What you should see |
| --- | --- | --- |
| sara@lifelink.test (O-) | GET /blood-requests | The 3 open requests (O- can be given to everyone), the SOS first |
| karim@lifelink.test (A+) | GET /blood-donations/eligibility | Not eligible: he donated today, so he waits 56 days |
| the admin | GET /blood-requests?status=pending | The B- request waiting for review |
| the admin | GET /blood-requests/4/matches | Donors for Nour's AB+ request, nearest first |
| the admin | PATCH /blood-donations/1/accept, then PATCH /blood-donations/1/confirm | Sara's donation confirmed; the SOS request gets 1 unit |
| the admin | POST /blood-requests/1/dispense with `{"blood_type_id": 8, "units": 2}` | 2 O- units from the blood bank; the SOS request is fulfilled |
| the admin | GET /blood-stock/movements | Where every unit came from and went |

## Run the tests

The tests use a separate database (`lifelink_test`), so they never touch your real data.

```
npm run db:reset:test   # once, and again whenever the schema changes
npm test
```

Verified for this version: **266 tests passed across 18 suites**, including acceptance lifecycle and session/concurrency checks. See `STEP-5-GUIDE.md` for the test environment.

`tests/architecture.test.js` checks the 3-tier rules on every run: the PL never uses the DAL, the BLL knows nothing about HTTP or MySQL, and only the DAL contains SQL.

## The 3-tier architecture (course slides 103–106)

```
CLIENT ──request──> PL ──DTO──> BLL ──DTO──> DAL ──SQL──> MySQL
       <─response── PL <─DTO─── BLL <─DTO─── DAL <─rows──
```

| Layer | Folder | Role | Never does |
| --- | --- | --- | --- |
| Presentation (PL) | `src/PL` | Website files; receives requests, validates them, security checks, forwards to the BLL, returns the response | Query the database |
| Business logic (BLL) | `src/BLL` | The rules: passwords, who may do what, what is allowed | Touch HTTP, cookies or SQL |
| Data access (DAL) | `src/DAL` | The only code that queries MySQL; transactions; turns MySQL errors into business errors | Contain business rules |
| DTO | `src/DTO` | Objects that carry data between layers; no logic | Anything else |

Every API request passes through, top to bottom:

```
security headers -> CORS -> rate limit -> JSON body (max 100 KB) -> cookies -> CSRF check
-> PL route -> [sign-in check -> role check] -> validation -> PL controller
-> BLL -> DAL -> MySQL
-> reply { "data": ... }  or  { "error": { "code", "message", "details" } }
```

## Project layout

```
lifelink/
  backend/
    database/schema.sql        all tables, keys, constraints, indexes and reference data
    database/erd.md            entity-relationship diagram (Mermaid)
    scripts/
      setup-db.js              creates the database and the API's MySQL account
      create-admin.js          creates the first admin account (through the BLL)
      seed-demo.js             adds demo accounts (through the BLL)
    src/
      server.js                starts the app (checks MySQL first, stops cleanly on Ctrl+C)
      app.js                   wires the layers together and orders the security layers
      config/index.js          reads and checks .env
      shared/                  business errors and the Node.js version check, used by all layers
      DTO/                     data transfer objects: user, audit, paging, health
      PL/                      PRESENTATION LAYER
        routes/                which URL reaches which controller
        controllers/           receive the request, build a DTO, call the BLL, send the reply
        validators/            request validation rules
        middleware/            security headers, CORS, rate limit, CSRF, sign-in and role checks,
                               validation runner, logging, error replies
        docs/                  openapi.yaml and the Swagger UI page
        session.js, respond.js the session cookie and the reply format
      BLL/                     BUSINESS LOGIC LAYER
        auth.bll.js            sign-up, sign-in, session checks, admin creation
        users.bll.js           profiles, passwords, account management
        bloodRequests.bll.js   who may create, see, review and cancel requests; SOS alerts; units from stock
        bloodDonations.bll.js  offers, invitations, answers, confirmations; the 8-week rule
        bloodStock.bll.js      stock levels, history, manual corrections
        bloodRules.js          the blood rules in one place (56 days, 5 active requests...)
        reference.bll.js       blood types for forms
        health.bll.js          is everything up?
        password.js            Argon2id password hashing
        dates.js, notices.js   dates in Lebanon's time zone; building alerts
      DAL/                     DATA ACCESS LAYER
        db.js                  connection pool, prepared statements, transactions, paging, error translation
        users.dal.js           users and donor profiles
        bloodRequests.dal.js   requests, donor matching (distance in km), compatibility
        bloodDonations.dal.js  donations
        bloodStock.dal.js      stock levels and their history
        notifications.dal.js   stores alerts
        reference.dal.js       blood types
        audit.dal.js           audit log
        health.dal.js          database ping
    tests/                     feature tests, security, database, architecture, documentation + unit tests
    .env.example               settings template (copy to .env)
    package.json
```

Each feature has one file per layer, for example sign-in: `PL/routes/auth.routes.js` → `PL/controllers/auth.controller.js` → `BLL/auth.bll.js` → `DAL/users.dal.js`.

Never share, commit or zip your `.env` file: it holds your passwords.

## Known notes

- `npm audit` reports 0 problems in the packages the API runs on. It lists moderate warnings inside Jest (the test tool, development only) from the `sprintf-js` package, which has no fixed version yet; they never reach production.















=======
# webproj
>>>>>>> 3501672c4bd0325479397c675a231022d82be5bf
