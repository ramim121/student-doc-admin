# STUDYDOCK Admin App - Vercel Setup

This guide deploys the restricted STUDYDOCK Admin application from
`addin26/Student-doc-admin` to Vercel. The Admin App shares Supabase with the
Public App but is a separate Vercel project and origin.

## 1. Security boundary

The Admin App is not protected merely because its URL is obscure. Every page
must require a valid Supabase session and `profiles.role = 'admin'`. Every
privileged database function and mutation must repeat that authorization check.

The browser uses only the Supabase project URL and anonymous key plus the
signed-in administrator's JWT. Never put a Supabase service-role key, database
password, Cloudflare secret, or migration token in a `NEXT_PUBLIC_*` variable.

## 2. Prerequisites

- Access to `addin26/Student-doc-admin` and its Vercel project.
- The same Supabase project/environment used by the matching Public App.
- The corrective RBAC/RPC migration applied and verified.
- At least one designated administrator created through an audited operator
  procedure.
- The Public App production URL for navigation and shared auth configuration.

Do not expose the Admin App publicly until non-admin page, API, RLS, and RPC
negative tests pass.

## 3. Import the project into Vercel

1. In Vercel, select **Add New > Project**.
2. Import `addin26/Student-doc-admin`.
3. Use these settings:

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Root directory | `.` |
| Production branch | `main` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | Leave blank; use the Next.js default |
| Node.js version | 20.x |

## 4. Environment variables

Configure values separately for Production, Preview, and Development.

| Variable | Scope | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Same Supabase project URL as the matching Public App environment |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server | Supabase anonymous/publishable key; authorization still depends on JWT + RLS |
| `NEXT_PUBLIC_ADMIN_SITE_URL` | Browser + server | Canonical Admin App origin without a trailing slash |
| `NEXT_PUBLIC_PORTAL_URL` | Browser + server | Canonical matching Public App origin |
| `CLOUDFLARE_R2_ACCOUNT_ID` | Server only | Cloudflare account ID used by the operational cleanup API |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | Server only | R2 S3 Access Key ID with delete access to the resource bucket |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | Server only, sensitive | R2 S3 Secret Access Key; never prefix with `NEXT_PUBLIC_` |
| `CLOUDFLARE_R2_ENDPOINT` | Server only | `https://<account-id>.r2.cloudflarestorage.com` |
| `CLOUDFLARE_R2_BUCKET_NAME` | Server only | Same private resource bucket used by the Public App |

Cloudflare credentials are used only by the server-side operational cleanup
route. That route revalidates the session and active administrator role before
deleting an object, then records the result through an audited database RPC.
Rotate any credential that has appeared in chat, screenshots, logs, or source.

## 5. Supabase authentication setup

In **Supabase Dashboard > Authentication > URL Configuration**, retain the
Public App as the primary Site URL and add these allowed redirects:

- `https://<admin-production-domain>/auth/callback`
- `http://localhost:3001/auth/callback`
- the narrowly scoped Vercel Preview callback pattern for this project

The Admin login page authenticates with Supabase, then the server loads the
profile role. A regular authenticated user must receive the forbidden page and
must also be rejected by RLS/RPC if they bypass the UI.

### Bootstrap an administrator

Use an approved Supabase dashboard/CLI operator session after confirming the
target Auth user ID. Record who approved and performed the change. A typical
operator statement is:

```sql
update public.profiles
set role = 'admin'
where id = '<confirmed-auth-user-uuid>';
```

Never make role promotion available through a public browser update or general
self-service profile form. Confirm that at least one active admin remains before
any demotion.

## 6. Database migration order

Database changes are deployed from the Public repository's
`supabase/migrations/` directory, not by Vercel during an Admin build:

1. back up the target database;
2. apply migrations to staging;
3. test anonymous, regular-user, other-user, and admin access;
4. test merge rollback and authorization;
5. apply the reviewed migration to production; and
6. deploy the compatible Admin App.

The Admin deployment must not precede the security migration that protects its
mutations and RPCs.

## 7. Local and preview validation

Run locally:

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run dev
```

GitHub CI repeats the non-interactive checks and scans full Git history with
Gitleaks. A passing local build does not replace staging authorization tests.

The development URL is `http://localhost:3001`.

Before merging to `main`, verify the Vercel Preview deployment with three
identities:

1. signed out;
2. signed in as a regular user; and
3. signed in as an administrator.

## 8. Post-deployment verification

- [ ] Signed-out access redirects to `/login` without rendering admin data.
- [ ] A regular authenticated user receives `/forbidden`.
- [ ] An administrator can load the dashboard and sign out.
- [ ] Session expiry returns to login without a redirect loop.
- [ ] Failed dashboard queries show errors rather than zero values.
- [ ] University/course edits reject non-admin direct requests.
- [ ] Merge preflight and execution reject non-admin RPC calls.
- [ ] Merge operations are atomic and write audit events.
- [ ] Resource approval/rejection changes Public App visibility correctly.
- [ ] Resource deletion handles both database state and R2 cleanup/retry.
- [ ] University, course, resource, and user lists paginate without loading an unbounded table.
- [ ] Resource filters for status, type, uploader, university, and course return
      the expected bounded result set.
- [ ] Account deletion requires a reason plus typed confirmation, schedules the recovery hold, and appears in Operations.
- [ ] Reactivating a logically deleted user during the hold cancels scheduled erasure.
- [ ] Admin actions never expose service-role or R2 credentials to the browser.
- [ ] Server logs contain no JWTs, signed URLs, reset tokens, or secrets.

## 9. Production access recommendations

- Use a dedicated Admin App domain.
- Add Vercel Deployment Protection or an identity-aware access layer as an
  additional control when available; it does not replace application RBAC.
- Limit project membership and environment-variable access in Vercel.
- Enable branch protection and require successful build/security checks.
- Alert on repeated 401/403 responses, merge failures, and role changes.

## 10. Rollback and incident response

- Disable destructive actions first if authorization or audit behavior fails.
- Roll back to the previous known-good Vercel deployment.
- Do not roll back schema destructively; use the reviewed migration compensation
  procedure.
- Revoke active sessions and rotate affected secrets after credential exposure.
- Reconcile partial R2 cleanup jobs before removing audit evidence.

## 11. References

- Supabase SSR Auth: <https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs>
- Supabase redirect URLs: <https://supabase.com/docs/guides/auth/redirect-urls>
- Supabase deployment: <https://supabase.com/docs/guides/deployment>
- Vercel environment variables: <https://vercel.com/docs/environment-variables>
- Vercel deployment protection: <https://vercel.com/docs/security/deployment-protection>
