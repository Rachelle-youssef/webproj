# Matched-donor form fix verification — November 19, 2026

Six focused Chrome/API integration groups passed using a separate MySQL QA database, `lifelink_invite_fix`, on port 33329 and app port 3002:

1. Eligible matched donors load with the correct expanded state.
2. Cancel closes the form, restores keyboard focus and sends no invitation.
3. The find button reopens and toggles the form closed without refreshing.
4. The no-matching-donors result can be dismissed.
5. A delayed matching response cannot insert the form onto another page.
6. Intentional submission after reopening sends exactly one invitation, with invited status and the correct donor/request through the API.

No browser JavaScript errors occurred. Only `frontend/Scripts/admin.js` and these release notes differ from the previous student-readable ZIP. The backend, API, dependencies, database schema, other frontend files and existing tests are byte-identical. The earlier 333-backend-test and 59-browser-group verification applies to that preceding release; those broad suites were not repeated for this one-file frontend fix. The user's live database was not modified.

---

# Student readability revision verification — November 19, 2026

This revision changes readability in the latest polished sessions release. It uses isolated `lifelink_student` and `lifelink_student_test` databases on the private QA MySQL instance (port 33329), with a separate app on port 3002. The user's live app and database were not modified.

- **333 backend tests passed across 21 suites.** The shipped test files were not weakened or rewritten for the refactor.
- **30 browser workflow groups passed:** 16 connected blood/medicine/admin/profile/map workflows and 14 QR regression groups. They cover signup, hospital pin reuse and editing, patient hospital pins, profile/password changes, session revocation, admin deep links, visible errors, cancelled invitation wording, withdrawal/re-offering and fresh acceptance, actual collection counted once, medicine review/dispensing, QR upload/manual/camera paths and responsive light/dark layouts.
- The browser map checks used substitute local tiles. Camera tests used simulated frames and permission cases; a physical webcam and live tile-server availability were not tested.
- All **55 API operations / 51 paths**, 31 schemas and 289 internal references still match and resolve. The ERD contains the same **16 tables, 27 foreign keys and 13 check constraints**.

The final archive verification checks that the file/folder manifest, dependencies, database schema, SQL/DAL code, routes, styles, HTML, bundled assets and existing tests match the preceding polished ZIP. Only the documented source readability changes and release notes are permitted to differ. Earlier results below are historical coverage and are not additional tests for this revision.

---

# Workflow and interface polish verification — November 18, 2026

Verified against isolated MySQL 8.0.46 QA databases on port 33329 and a separate Express server on port 3002. The user's live database was not changed.

- **333 automated backend tests passed across 21 suites.** Coverage includes hospital signup and pin validation, saved-pin reuse, patient home-location privacy, request ownership, invitation wording, withdrawal/re-offer transactions, fresh acceptance, concurrent re-offers and audit rollback. The earlier test forbidding all recipient pin edits was replaced by ownership and explicit hospital-pin checks.
- Dropdown follow-up: 24 Chrome variants passed across 390/768/1440 pixel widths, light/dark themes, upper/lower field positions and first/later selected options. Checked downward placement, scroll, keyboard selection, form values and Escape. This was a CSS-only change; backend tests were not repeated.

- **30 browser workflow groups passed:** 16 connected interface/workflow groups and 14 focused QR regression groups. These are this release's counts; historical counts below are not added to them.
- The 16 workflow groups cover role-specific registration, profile/password changes and session revocation, hospital pin reuse and edits, patient hospital pins, admin queue links and organised review actions, visible errors, re-offering, invitation wording, light/dark map popups, medicine review/dispensing, compact QR lookup and actual blood collection counted once. Responsive checks covered 390, 768 and 1440 pixel layouts in both themes.
- The 14 QR groups cover actual PNG decoding, current batch availability, expired/pending/rejected/depleted batches, incorrect label expiry, invalid/foreign/damaged images, permission and missing-camera errors, simulated video frames, camera cleanup, stale/failed lookups, role restrictions and session expiry. QR layout checks span 320–1440 pixels.
- The additive hospital-pin migration ran twice against a populated copy of the previous sessions schema. Row counts and SHA-256 fingerprints of **every original column in all 16 tables** remained identical. The new column defaults to false, keeping legacy patient coordinates off the public map until explicitly confirmed.

Map browser tests substituted local tiles, so they establish pin workflows and popup styling rather than live OpenStreetMap availability. Camera tests used simulated video; a physical webcam was not exercised. These results establish the covered workflows, not production load capacity.

The archive excludes private environment files, installed dependencies, logs and QA records. The prior network hero and session implementations remain included. Earlier verification notes below are release history.

---

# Network hero verification — November 18, 2026

Eight focused Chrome workflow groups passed: local renderer/core loading under the existing CSP; complete animated intro; unchanged public stats/stock and entry links; disposal and single-scene recreation after navigation; no Three.js downloads on direct login; reduced-motion rendering; missing-library fallback; context-loss fallback; and responsive label bounds at 320, 390, 768 and 1440 pixels in light/dark themes (responsive variants are one workflow group).

Screenshots of the complete desktop, phone and fallback pages were visually reviewed. Tests used a separate temporary frontend server and read-only synthetic API fixtures. No user accounts, sessions or database records were changed during these tests. All 122 backend files match the previous session release; its 314-test backend result below is historical coverage and was not rerun for this frontend update. Other workspace scripts and styles are preserved from the installed frontend.

---

# Server-side session revision verification

Verified November 16, 2026 against a separate MySQL 8.0.46 instance on port 33329, using only isolated QA databases. The user's live database was not changed.

- **314 automated tests passed across 20 suites.** Five former JWT-specific tests were replaced by 20 persistent-session tests; all other backend feature coverage remains.
- **38 browser workflow groups passed:** 10 connected blood/medicine/admin workflows, six supplemental groups, 15 profile and multiple-session groups, and seven password-control groups.
- Real Node process restart: an existing login remained authenticated after the process restarted. Logout then invalidated replay of that cookie.
- Additive migration ran twice against a populated copy of the original 15-table Step 11 database. Row counts and SHA-256 fingerprints of every original table remained identical; only the empty sessions table was added.
- Current schema: **16 tables, 27 foreign keys, 13 check constraints**. Every table appears in the ERD. All **55 API operations / 51 paths**, 31 response schemas and 289 internal schema references still match and resolve.
- The production dependency audit reported **zero advisories** on the verification date. This is a point-in-time check.
- Frontend files are byte-identical to the selected audited Step 11 baseline; the calendar is absent. The new ZIP retains the original folder layout and excludes `.env`, installed dependencies, logs and QA data.

Session checks cover separate browser identities, replacement of a browser's previous account session, ID regeneration, hashed IDs in MySQL, no password/role/email in saved data, anonymous traffic without session writes, forged signatures and old JWT rejection, fixed expiry, expired-row cleanup, login persistence across Express instances and process restart, deletion on logout, cookie replay rejection, logout independence, password-driven revocation and current-browser renewal, deactivation/reactivation, stale writes/touches and store failures without leaking private errors or reporting false success.

Browser checks cover registration, four roles, request approval, offers/acceptance/actual collection, medicine review and dispensing, QR image display, appeals, stock and incompatible handoff rejection, matching/invitations/cancellations, account deactivation, ownership and pagination. Profile checks cover all roles, edits and error recovery, independent sessions and password changes; password-control checks include confirmation, keyboard/click eye controls and responsive light/dark layouts.

The tests establish the covered behaviors, not production load capacity. Production HTTPS and reverse-proxy setup require testing in the actual hosting environment. The earlier results below are retained as release history; they are not additional test counts for this revision.

---

# LifeLink test results and final technical audit

Current update tested on November 14, 2026, using Windows, Node.js 24.21.0, MySQL 8.0.46 and headless Google Chrome.

## Current update: requirements and integration audit

| Check | Result |
| --- | --- |
| Full backend suite after controller separation | 299 tests across 19 suites passed |
| OpenAPI suite after medicine schema documentation edits | All 55 endpoint checks passed again |
| Fresh database/admin/demo setup | Passed on the new isolated lifelink_finalaudit database |
| Main connected blood/medicine/admin flows | 10 browser groups passed |
| Supplemental flows | 6 browser groups passed |
| Profiles and independent sessions | 15 browser groups passed |
| Notifications and feed | 16 browser groups passed |
| Medicine QR scanner | 14 browser groups passed |
| Admin history | 13 queue views and 21 responsive checks passed |
| Map and location picker | 10 and 6 browser groups passed |
| Community home | 10 browser groups passed |
| Password confirmation and eyes | 7 browser groups passed |
| Registered API operations vs OpenAPI | All 55 operations matched across 51 paths |
| Local OpenAPI references | All 289 references resolved; 31 reusable schemas |
| ERD vs schema | All 15 table names matched; fresh setup confirmed 26 foreign keys and 13 checks |
| Online production dependency audit | 0 reported advisories |
| Online full dependency audit | 19 development-tool findings: 3 low, 16 moderate; 0 high/critical |

The browser results comprise 94 named workflow groups plus the 13 admin queue views and 21 admin responsive checks. All ten scripts exited successfully. Selected backend race tests verify that duplicate/competing handoffs, medicine reviews and donation completions cannot apply stock changes twice. Browser contexts verify separate user identities and password-driven session revocation. This does not establish production-load capacity.

Two medicine controllers were added and the corresponding routes now delegate to them. BLL/DAL rules, validation and response payloads are unchanged. Architecture tests now enforce controller delegation and reject circular local JavaScript imports. Four medicine response schemas and the corresponding OpenAPI success envelopes were added to document existing data. Frontend files and the database schema are unchanged from the QR release.

Backend tests used lifelink_profile_test; browser tests used the fresh lifelink_finalaudit database. Both are on the isolated MySQL process at port 33329; the test app used port 3002. The user's application/database/accounts were not changed. Test credentials, .env, logs, QA scripts and generated data remain excluded from the ZIP. npm audit was run against the locked dependencies on November 14; the remaining findings are in development tooling and no dependency downgrade was applied.

Physical camera hardware, other browser engines, real phones, deployed HTTPS and production-load testing remain unverified. Map tests substitute tiles and do not prove live provider uptime. The final report, screenshot-based manuals, installation/configuration/operation guide and presentation are still needed. The separate REQUIREMENTS-CHECKLIST-FINAL.md maps these findings to the brief and rubric.

The earlier release evidence follows below, with its original dates and counts.

## Previous update: medicine QR scanner

- All 14 connected scanner browser workflow groups passed with the real API and isolated MySQL data.
- Actual PNG labels from GET /medicines/:id/qr decode and match the latest record. A real handoff changes the displayed quantity on the next scan; scanning itself does not write stock.
- Pending, rejected, expired and empty batches remain unavailable. Label/record expiry mismatches are flagged. Foreign URLs, invalid IDs, impossible dates and missing records fail clearly.
- Unreadable, damaged and wrong-type image files recover without retaining an old result. Descriptions are escaped. Failed lookups clear previous details, and stale responses cannot replace a newer result.
- Camera requests occur only after Start camera, with audio disabled. Permission denial, no camera, Stop camera, successful decoding, navigation, a hidden tab and a late permission response were checked. All acquired tracks are stopped.
- The camera path was exercised with synthetic browser camera streams containing real QR pixels, not with physical webcam hardware. Image uploads and live backend lookups were real. A physical-camera check remains appropriate on the device used for the demonstration.
- Anonymous users, donors and recipients cannot access the scanner or its existing admin-only batch/QR endpoints. An expired admin session returns to login.
- Layouts and the single shared Refresh icon were checked at 320, 390, 768 and 1440 pixels in light and dark themes. Desktop and phone screenshots were visually reviewed.
- The 10 existing connected blood/medicine/admin browser groups and seven password-control groups passed again.

All 114 backend files are byte-identical to the password-controls release. The earlier 297 backend tests were not rerun for this frontend-only change. The database schema, API contracts, package manifest and lockfile are unchanged. Tests used only the isolated lifelink_profile database on port 33329 and an app on port 3002. The user's working database and accounts were not changed. Test data, credentials, logs and QA scripts are excluded from the ZIP. The bundled frontend jsQR decoder and its license are the only new third-party asset.

## Previous update: confirmation and password eye controls

- Seven focused browser groups passed for login, registration and password change.
- Confirmation is required; mismatches are blocked before the API request. Editing either entry clears a previous mismatch. Only one password is sent to the API, with exact whitespace preserved.
- Each eye controls one field. Mouse clicks, nested SVG clicks, Enter and Space work without submitting. Accessible labels and pressed states reflect visibility; returning to a form starts with passwords hidden.
- Password updates succeed with visible fields, then clear all values and reset the three eyes. The current session remains valid, the other test session is revoked and the old password is rejected.
- Input/button bounds and horizontal overflow were checked at 320, 390, 768 and 1440 pixels in light and dark themes for all three forms.
- All 15 profile workflow groups and 10 main connected blood/medicine/admin regression groups passed again.

All 114 backend files are byte-identical to the preceding profile release. The backend suite was not rerun for these frontend-only changes; its earlier 297-test result is recorded below. The schema, dependencies, API contracts and URL are unchanged. Tests used the isolated lifelink_profile database at port 33329 and a test app at port 3002. The user's working application and account passwords were not changed.

## Previous update: profile editing and password changes

| Check | Current result |
| --- | --- |
| Backend | 297 tests passed across all 19 suites |
| New profile browser workflows | 15 connected workflow groups passed |
| Inbox/feed regression | All 16 connected workflow groups passed |
| Community home regression | All 10 workflow groups passed |
| Existing blood/medicine/admin regression | 10 main and six supplemental workflow groups passed |
| Map/location regression | 10 map and six location-picker workflow groups passed |
| Admin history | All 13 queues and 21 responsive checks passed |
| Profile layouts | All four roles checked at 320, 390, 768 and 1440 pixels in light and dark themes |

The profile groups cover anonymous access, fresh data loading, all-role saves, protected fields, header updates, phone removal/persistence, discard, unchanged submissions, validation before writing, zero coordinates, coordinate removal, availability-driven donor matching, preservation of donor blood type/history, hospital request-pin independence, sparse multi-session updates, escaped names, failed saves, repeated-click protection, password confirmation, unchanged/wrong passwords, visibility toggling, password service errors, actual session renewal, invalidation of other sessions, rejection of the old password, stale unread responses during renewal, late profile responses, expired sessions and responsive layouts.

Six backend regression cases were added for optional phone and coordinate editing. The existing negative-stock test now initializes its own stock baseline within its rollback transaction, making it independent of data left by other suites. The schema, dependencies and endpoint URLs are unchanged. Sign-up validation is unchanged. Profile phone and coordinate null-clearing now work and are documented in Swagger.

Tests used a dedicated lifelink_profile database and lifelink_profile_test database on the isolated local MySQL instance at port 33329, with a test app at port 3002. The user's port-3000 application, working accounts, passwords and database were not changed. Map checks used substitute tiles. Test credentials and data are excluded from the ZIP.

Earlier release evidence follows below.

## Previous update: notifications and community feed

The new pages use the existing notifications and feed APIs. All 114 backend files are byte-identical to the preceding release. No schema, dependency or API contract changed.

| Check | Current result |
| --- | --- |
| Backend | 291 tests passed across all 19 suites against a fresh, isolated test database |
| New inbox/feed workflows | 16 connected workflow groups passed |
| Community home | All 10 workflow groups passed again, including all role links and narrow-screen logout |
| Existing blood/medicine/admin workflows | 10 main plus six supplemental groups passed |
| Map and location picker | 10 map plus six location workflow groups passed |
| Admin history | All 13 queues and 21 responsive page checks passed |
| New page layouts | Notifications, feed and signed-in home checked for all four roles at 320, 390, 768 and 1440 pixels in light and dark themes |

New coverage includes real request/offer/collection and medicine-review/dispensing events; empty inbox; global unread counts versus filtered rows; oldest/newest order; pagination; final-unread-row page clamping; mark-one persistence; mark-all across every owned page; independent account counts; failed writes; committed writes followed by failed reloads; unknown-count fallback; escaped message/title markup; safe role-specific links; feed privacy and category filters; empty/error feed states; late responses after navigation; focus-triggered badge refresh; synchronized header/inbox totals; 99+ display; repeated-click protection; mobile layouts; expired sessions and logout.

Testing used a new private MySQL instance at port 33329 with dedicated lifelink_community and lifelink_community_test databases, plus a test server at port 3002. No user working database or port-3000 application was changed. Automated map tests used substitute tile images. The private test environment and QA records are excluded from the ZIP.

Manual checks and installation steps are in README.md. The evidence below records earlier releases unless a check is explicitly listed above as rerun.

## Previous update: shared blood-red workspace design

- 224 design checks passed: 28 public/role screens at widths 320, 390, 768 and 1440, in light and dark themes. Checks cover shared color tokens, heading fonts, navigation, horizontal overflow and screenshots.
- All 10 Community home workflow groups passed again, including database-backed totals, stock rows, unavailable states, escaping, keyboard FAQ controls and all four account roles.
- All 32 connected regression workflow groups passed again: 10 main blood/medicine/admin, six supplemental, six hospital location-picker and 10 map groups.
- All 13 admin queues and 21 responsive admin-page checks passed. Completed history remains read-only and each signed-in page retains the shared refresh control.
- Sampled body text, primary buttons, active navigation and card captions passed contrast checks of at least 4.5:1. The checks also exercised automatic OS light/dark preferences without a saved theme. This is a targeted check, not a complete accessibility certification.
- The shared action background is #8B1019 in both themes. Dark mode uses brighter text accents while retaining the deep-red button and logo surfaces.
- All 114 backend files are byte-identical to the preceding Community home release. The backend suite was not rerun for these presentation-only changes. No dependencies or schema changed.

Testing used the isolated local QA database. The user's working database and accounts were not changed. Automated map checks used substitute tiles. Earlier release evidence follows below.

## Previous update: Community home

Homepage verification passed in 10 browser groups

- Database-backed totals, all eight stock rows and the bundled SVG illustration.
- Section navigation and FAQ controls, including keyboard interaction.
- Screenshots and overflow checks at widths 320, 390, 768, 1024 and 1440 in light and dark themes.
- Registration and login links, plus restoration of the existing form layout.
- Unavailable statistics and stock fallback without invented activity counts.
- Escaping of untrusted blood-type labels.
- Donor, recipient, hospital and admin links, returning from home to the workspace, narrow-phone layouts and logout for each role.

All 10 main connected blood/medicine/admin workflow groups and six supplemental workflow groups passed again against this release. They cover registration, independent sessions, requests, offers, actual collection, batch review, QR images, dispensing, account management, stock, pagination, role isolation and refresh. All 114 backend files, including the detailed country boundary and tests, remain byte-identical to the preceding release; its backend suite was not rerun for these frontend-only changes.

The new artwork is a decorative illustration with fixed city labels, not a live view of hospital requests. Actual request pins continue to appear on Request map. The results below record the preceding detailed-boundary and readable releases.

## Detailed Lebanon boundary correction

The screenshot revealed a coarse country-shaped cutout, rather than a country cropped by the rectangular map container. This correction replaces the 312-vertex Natural Earth outline with the 16,083-vertex public-domain Central Administration of Statistics Lebanon / HDX boundary distributed by geoBoundaries gbHumanitarian. Extra Leaflet outline simplification is disabled. Source metadata and attribution are stored with the bundled geometry and in README.md.

The mask, country outline, hospital location validation and API map filtering use the same detailed geometry. Database schema and endpoint contracts remain unchanged. No migration is needed. Geographic inclusion near borders can differ from the previous approximate boundary.

Current verification

- All 289 existing backend tests passed across 19 suites with the new geometry.
- The location suite passed again with two additional coastal regression cases, 18 tests total. Beirut (33.89, 35.472) and Tripoli (34.44, 35.812) can be saved and appear in the map API; the old outline excluded these points.
- All six connected hospital location-picker workflow groups passed.
- All ten connected map workflow groups passed.
- Light and dark pixel checks passed at widths 390, 768 and 1440. The whole country is visible, exterior tiles are hidden and interior tiles remain visible.
- At zoom 13 the two coastal regression points remain visible. Marker popup close, zoom controls and country validation passed.

Browser pixel tests used substitute tiles. The regression results below record the preceding readable release, unless explicitly listed above as rerun.

## Test environment

Testing used a separate local MySQL instance and dedicated backend-test and browser-test databases. The browser tests used generated accounts and independent browser contexts for admin, donor, patient and hospital. The user's working database, accounts and request #10 / donation #12 were not changed by these tests.

This update used dedicated readability-test databases and a test server at port 3002. The delivered project continues to use the PORT and database settings from your existing private backend/.env.

## Results

| Check | Result |
| --- | --- |
| Backend suite | 289 tests passed across 19 suites, including hospital location permissions, country validation, closed requests and audit rollback |
| Main connected browser workflows | 10 workflow groups passed again against the readable code release |
| Additional connected browser workflows | 6 workflow groups passed again against the readable code release |
| Map browser workflows | 10 workflow groups passed |
| Hospital location browser workflows | 6 workflow groups passed |
| Admin queues | All 13 queues loaded successfully |
| Completed/cancelled history | Read-only rows have no acceptance, collection or dispensing actions |
| Responsive admin pages | Seven admin pages checked at 390, 768 and 1440 pixels |
| Layout review | Desktop and mobile screenshots inspected, including light and dark themes |
| Production dependency audit | 0 reported advisories after the body-parser update |

The backend suite covers authentication, account management, ownership and role restrictions, validation, CSRF, security headers, database constraints, architecture, blood matching and stock, medicines, notifications, calls, feed/map data, audit history and concurrent operations. The map update adds combined filtering, filter validation and a map-image CSP assertion. The suite was rerun successfully after these backend changes.

## Readability and output comparisons

The readability pass covered 125 application-owned source and documentation files. It expanded formatting, renamed 34 scoped bindings, replaced inline exports with named functions in 14 controllers, expanded 10 nested conditions and added 261 explicit condition/loop blocks. The frontend entry point now uses module-level functions. Vendor assets were retained.

- All 24 public and signed-in page comparisons retained the same visible text. The 23 pages without the changed map also passed screenshot comparison, with a tolerance of four pixels per full-page image for browser rasterization. Hospital request pages include the intentionally changed location-picker framing.
- In the preceding readable release, whole-country visibility, absence of the opaque mask and horizontal overflow checks passed at 390, 768 and 1440 pixels.
- Database schema, package manifests/lockfile and country boundary remain byte-identical. Parsed Swagger output remains identical. Four landing-page variants produce identical HTML.
- The simplified point-in-polygon calculation matches the earlier version over 40,000 sampled coordinates and country vertices.
- All 32 browser workflow groups, all 13 admin queues and 21 responsive admin-page checks passed against the readable release. Tests used substitute tiles to avoid automated traffic to the live map provider.

## Connected browser workflows

1. Public landing page, registration and four separate signed-in sessions.
2. Patient blood request creation and admin approval.
3. Donor offer, admin acceptance and physical collection as separate steps. Accepted offers keep units received at zero. Collection fulfils the request and activates the donor waiting period. Repeating collection is rejected.
4. Medicine donation submission, review, available quantity and an approved batch's QR PNG.
5. Patient medicine request and admin dispensing. Repeating dispensing is rejected and stock is deducted once.
6. Admin medicine appeal publication, donor response linked to the appeal and admin closure.
7. Stock adjustments, incompatible handoff rejection and compatible stock fulfilment.
8. Account search, deactivation, session access revocation and reactivation.
9. Admin blood appeal publication, map API coordinates and audit filtering.
10. Pagination, role access restrictions, one refresh icon and separate patient/hospital sessions.
11. Matching donors, invitations, donor acceptance and admin cancellation.
12. Donor invitation decline and blood-bank offer withdrawal.
13. Patient cancellation confirmation and the option to keep the request.
14. Admin blood-request denial and medicine rejection.
15. Negative-stock rejection and successful adjustment followed by a simulated failed history refresh. The successful adjustment is reported, its form is cleared and it is recorded once.
16. QR image rendering in the browser, mobile widths and the dark theme.

## Admin features added

| Page | Included operations |
| --- | --- |
| Blood coordination | Publish blood appeals, approve/deny requests, match and invite donors, accept offers, record collection, cancel offers and record stock handoffs |
| Blood history queues | Fulfilled/cancelled requests, unanswered/declined invitations and completed/cancelled donations |
| Medicine review | Review donated batches, dispense requests and view dispensed request history |
| Blood stock | Current levels, positive/negative adjustments with reasons, movement history and filters |
| Medicine inventory | Batch status filters, quantities, expiry dates, linked appeal IDs and QR-label links for approved batches |
| Medicine appeals | Publish, filter and close appeals |
| Accounts | Name/email search, role/status filters and activation/deactivation with confirmation |
| Audit history | Pagination and filters for action, entity and account ID |

Donors can respond to medicine appeals from Medicine donations. The form records the selected appeal ID so the submitted batch remains linked to that appeal.

All admin operations use the existing authenticated API. A global refresh icon remains beside Log out. There are no extra section refresh buttons.

## Map browser checks

1. Real API records, grouped pins for identical coordinates, Lebanon locations and escaped hospital names in both the list and popups.
2. Combined blood-type, urgency and case-insensitive partial-city filters, empty results and clearing filters.
3. Keyboard marker activation, request focus, zoom controls, fit-to-results, visible attribution, local Leaflet assets, permitted tile CSP and origin referrer headers.
4. Pagination over more than 20 requests and returning to the first page after filtering.
5. Access for all four roles, anonymous-user login and expired-session handling.
6. A failed library download preserves the request list.
7. Failed background tiles preserve pins and request details.
8. Failed API reads show an error and the shared top refresh can restore data.
9. Repeated map/workspace navigation removes the old map and ignores late data responses.
10. Widths of 390, 768 and 1440 pixels, light/dark themes, reduced-motion behavior and keeping pins visible after resizing.

Map records used the isolated browser-test database. Automated browser tests substitute local PNG tiles and make no requests to the live OpenStreetMap tile servers. Tests verify the configured URL, CSP permission and referrer behavior. They do not establish live tile-provider availability. The installed map uses OpenStreetMap when a person opens it in their browser. [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/)

Leaflet 1.9.4 is included with its BSD-2-Clause license. Its bundled JavaScript has SHA-256 integrity value sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=. [Leaflet 1.9.4 reference](https://leafletjs.com/reference-1.9.4.html)

## Lebanon map and location-picker checks

- An existing hospital request without coordinates can be opened, assigned a point by clicking the map and saved. An approved request then appears on the request map.
- New hospital requests require a selected point. Coordinates are filled automatically, and the selection is cleared after successful submission.
- The admin appeal picker initializes when its collapsed form is opened. Admins can also update active request locations through the request cards.
- Clicks outside the Lebanon outline are rejected and preserve the previous valid selection.
- The public map shows the whole country with a surrounding margin, a country outline, pan bounds, a country-based minimum zoom and disabled world wrapping. In the readable release the opaque mask was removed; this follow-up restores it while retaining whole-country framing. Old overseas coordinates are excluded at the API level before counting and pagination.
- Repeated opening/closing, Escape dismissal, route cleanup and mobile dialog/map layouts were exercised.
- The API rejects other hospitals editing a request, anonymous callers, donor/patient callers, missing CSRF headers, incomplete/outside-country points and location changes to closed requests. An audit failure rolls the update back.

The bundled country geometry comes from Natural Earth's public-domain 1:10m admin-0 dataset. It is used by the server filter, the location endpoint and the frontend map. [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/)

## Fixes and dependency findings

- Corrected the new appeal success message to use the API's nested call ID.
- Successful stock adjustments and other admin changes are reported accurately if the following data reload fails. Successful stock forms are cleared before reloading to reduce accidental duplicate submissions.
- Failed admin list reads show an error in the list instead of leaving a loading message indefinitely.
- Improved link and blood-type text contrast in the dark theme and removed the empty toast's visual artifact.
- Updated the locked body-parser dependency to 2.4.0. The online production dependency audit reports no advisories. [Request-parser advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828)
- The full dependency audit still reports 19 development-tool advisories, comprising 3 low and 16 moderate findings in the Jest dependency tree. npm's suggested fix includes a major downgrade of Jest. This release retains Jest 30.5.2. These findings require a separate test-tool dependency update and verification.

## Remaining work and verification limits

- The interactive blood request map and hospital location picker are implemented. Background tiles depend on internet access and the external tile provider. The API omits patient-created requests, missing coordinates and points outside Lebanon.
- Notifications and the community feed now have frontend screens and connected browser coverage. Profile editing and password changes now have frontend coverage.
- The account page now edits personal details and donor availability and supports password changes. Both API and frontend flows have regression coverage.
- QR labels can be viewed by admins. Camera and image scanning were added in Step 10, documented above.
- The final report, screenshot-based user manual, installation guide and presentation remain the documentation milestone.
- Browser tests used Google Chrome. Other browser engines, real mobile devices, deployment and production-load testing were not covered by this run.
- Passing these tests covers the implemented release. It does not establish completion of every project-brief deliverable.

## Install this update

1. Stop your current LifeLink server.
2. Extract the ZIP into a new folder, keeping backend and frontend side by side.
3. Copy your existing private backend/.env into the new backend folder.
4. From the new backend folder, run npm ci, then npm start.
5. Open your usual LifeLink URL and press Ctrl+F5.

There is no new database migration for this release. Existing installations that already applied the acceptance migration keep their database settings and data.

The ZIP excludes the testing .env, generated database files, browser profiles and node_modules. Use your own existing configuration when installing it.











