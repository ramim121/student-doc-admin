# STUDYDOCK implementation walkthrough

| Field | Value |
| --- | --- |
| Updated | August 3, 2026 |
| Public repository | `addin26/Student-doc-portal` |
| Admin repository | `addin26/Student-doc-admin` |
| Requirements | `srs_document.md` version 3.2 |
| Delivery plan | `implementation_plan.md` version 3.2 |

This is an evidence-oriented walkthrough of the current dual-application platform. It does not certify production readiness. The source code and local automated checks are substantially implemented; database deployment, real identity tests, provider smoke tests, policy approvals, and operational rehearsals remain required.

## 1. Applications and trust boundaries

The Public App (`STUDYDOCK/`) provides discovery, authentication, uploads, downloads, account settings, dashboard, leaderboard, universities, and private study notes. The Admin App (`STUDYDOCK-ADMIN/`) is a separately deployed restricted interface for catalog curation, moderation, users, cleanup, AI operations, and account-erasure visibility.

Both applications use the same Supabase project. The browser receives only the Supabase project URL and anonymous key. R2 credentials, Gemini credentials, service-role credentials, cron secrets, and rate-limit hashing secrets are server-only. Schema changes are authored in the Public repository under `supabase/migrations/` and must be applied by an approved database operator or CI identity.

## 2. Public App walkthrough

### Authentication and account lifecycle

- Email/password registration and login are available at `/auth`.
- Verification resend, OAuth initiation, password recovery/reset, authenticated password change, safe return paths, SSR cookie refresh, and sign-out are implemented.
- Upload, dashboard, study notes, and settings are protected routes.
- Upload requires a verified email when the configured policy is enabled.
- Active, suspended, and deleted states are represented in the database contract. Suspended users may read existing private notes but cannot mutate notes, upload, download, or request AI work. Deleted users are denied protected access.
- Logical deletion schedules a 30-day erasure job. Physical erasure remains disabled unless `ACCOUNT_ERASURE_ENABLED=true` after retention/legal policy approval.

### Discovery and resources

- Home, Explore, Universities, Leaderboard, Dashboard, and resource details use live bounded APIs/RPCs rather than fixture catalog data.
- Search supports pagination, filters, sorting, and ranked multi-field matching through `search_resources_v2` after the migration is deployed.
- Public results expose approved resources only. Owners and administrators receive only the additional visibility granted by RLS.
- Resource detail uses a server component boundary so missing or non-visible resources produce an actual not-found response.
- Downloads require an authenticated, eligible account and create a short-lived R2 URL server-side.

### Upload, R2, and AI

- University and course lookups are debounced, bounded, and surface backend failures.
- Missing academic metadata may be proposed as `custom_pending`; normalization and uniqueness are enforced by the authored database migration.
- The browser uploads directly to a private R2 bucket using a user-scoped presigned PUT URL.
- Finalization performs server validation, object `HEAD`, metadata/checksum checks, transactional/idempotent record creation, and cleanup-queue handling for partial failure.
- PDF AI analysis is asynchronous and non-blocking. A bounded worker extracts text, validates Gemini output, records status, retries transient failures, and preserves the resource on terminal AI failure.
- Gemini remains optional until a rotated key, approved model, service-role key, cron secret, budget, and provider policy are configured.

### Private study notes

- Users can create, read, edit, autosave, and delete their own notes with visible success/failure states.
- Suspended accounts see notes in read-only mode; deleted accounts cannot read private notes after the lifecycle migration is deployed.
- Microphone recording is explicitly temporary for the current session. The UI does not claim durable audio storage.
- Speech-to-text is capability-detected and reports compatibility/permission errors.
- Note summarization uses the authenticated server AI route and does not discard note content on failure.

## 3. Admin App walkthrough

- `/login` supports email/password and PKCE callback handling.
- Middleware plus the protected server layout require a valid session and an active `profiles.role = 'admin'` before rendering operational data.
- The repaired Tailwind entry directives restore the intended Admin visual system.
- Dashboard metrics distinguish loading/query failures from real zero values.
- University and course screens provide bounded server search, approval/rejection, editing, merge preflight, collision handling, typed confirmation, execution, and audit references.
- Resources support status, type, uploader, university, and course filtering; approve/reject/feature/remove; forced-download review; permanent R2/database deletion; and retryable cleanup.
- User administration provides privacy-safe pagination, role/status changes, last-active-admin protection, logical deletion, recovery during the 30-day hold, and erasure-job visibility.
- Operations exposes cleanup, AI, and erasure work without putting service-role credentials in the browser.

The Admin code is not proof of authorization by itself. Release requires deployed page, route, RLS, and RPC negative tests using signed-out, regular-user, second-user, designated-admin, and service identities.

## 4. Database migration walkthrough

Apply the timestamped migrations in order. The three principal corrective migrations are:

1. `20260803120000_secure_rbac_and_rpc.sql` — corrected role/RPC authorization foundations.
2. `20260803130000_resource_lifecycle_and_search_v2.sql` — lifecycle states, normalized catalog ownership, moderation, private-read rules, audits, cleanup, AI queues, delayed erasure, rate limits, transactional finalization, ranked search, merge workflows, and administrative functions.
3. `20260803140000_private_data_account_state.sql` — additive active/suspended/deleted private-read and resource-mutation enforcement without changing a previously published migration checksum.

Before production: back up the database, apply to a fresh staging database and an upgrade copy, resolve any duplicate-normalization abort explicitly, run the full identity/RLS matrix, rehearse rollback/compensation, and record migration checksums. Do not edit a migration after it has been deployed; add a new corrective migration.

## 5. Local verification

Run in each repository:

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm audit --audit-level=high
```

The current Public App local evidence is 17 passing unit/static-contract tests and 15 passing Playwright checks. The browser suite covers auth plus home, explore, universities, and leaderboard accessibility and desktop/mobile visual baselines. The Admin suite covers login accessibility and desktop/mobile visual baselines. Both GitHub workflows also run a full-history Gitleaks scan.

These checks do not contact or certify Supabase migrations, R2, Gemini, email delivery, Vercel cron, backups, or production monitoring.

## 6. Deployment sequence

1. Rotate every secret exposed through chat, screenshots, logs, or tickets.
2. Create separate staging and production environment values in Vercel.
3. Apply and test database migrations in staging.
4. Configure exact Supabase callback URLs and exact R2 CORS origins.
5. Deploy matching Public and Admin preview builds.
6. Run credential-backed user/admin/R2/AI failure-injection journeys.
7. Verify a database backup and restoration rehearsal.
8. Approve content, privacy, copyright/takedown, retention, support, and AI policies.
9. Apply the reviewed migration to production, deploy compatible builds, and perform a limited monitored rollout.

Detailed Vercel settings are in `STUDYDOCK/setup.md` and `STUDYDOCK-ADMIN/setup.md`.

## 7. Current launch blockers

- No approved Supabase migration/service-role access has been available from this workspace, so the corrective migrations are authored but not certified as deployed.
- The supplied R2 endpoint previously failed TLS negotiation from this development machine; bucket access, CORS, presigned PUT/HEAD/GET/delete, and failure recovery still require a supported staging runtime.
- Any secrets pasted in chat or screenshots must be treated as exposed and rotated. No such values belong in source control.
- A rotated Gemini key/model and cost/data-retention policy are not configured, so AI should remain optional/disabled.
- Production content licence, community moderation, privacy, copyright/takedown, support-contact, retention/legal-hold, and audio policies need owner/legal approval.
- Non-admin authorization, cross-user note isolation, merge rollback, destructive-operation recovery, representative performance, monitoring/alerting, and backup restoration still need production-like evidence.

Until these gates pass, the platform should be described as implementation-complete in many local code paths, not production-ready.
