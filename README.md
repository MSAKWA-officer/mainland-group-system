# Mainland Group — Phase 1: Database & Authentication

Node.js + Express + Sequelize + PostgreSQL backend, Vite + React + Tailwind frontend.

## Run it
```bash
docker compose up -d                  # PostgreSQL (or point DATABASE_URL at your own)
cd backend && cp .env.example .env    # then set JWT_SECRET and ENCRYPTION_KEY (commands are in the file)
npm install && npm run setup          # migrations + seed roles, permissions, first Owner
npm run dev                           # API on :4000
cd ../frontend && npm install && npm run dev   # UI on :5173
```
Sign in as `OWNER_USERNAME` / `OWNER_PASSWORD` from `.env`; you must change the password immediately.
Set `SEED_DEMO=true` before `npm run seed` to also get manager1, storekeeper1 and sales1.

## What Phase 1 contains
| Area | Where |
|---|---|
| Tables, constraints, triggers | `backend/src/migrations` (users, roles, permissions, sessions, audit_logs, approval_requests, notifications, attachments) |
| Models | `backend/src/models/index.js` |
| Roles + permissions seed | `backend/src/config/rbac.js`, `backend/src/seeders` |
| Login, refresh rotation, lockout | `routes/auth.js` |
| RBAC gate (checked in the DB on every request) | `middleware/auth.js` |
| Hash-chained audit log | `services/audit.js` |
| Approval engine | `services/approvals.js` |
| Encrypted backups | `scripts/backup.js`, `scripts/restore.js` |

## Security controls
- bcrypt (cost 12) password hashing; password policy; account lockout after 5 failures (15 min)
- 15-minute JWT access token + rotating refresh token in an httpOnly, SameSite=Strict cookie; reuse of an old refresh token kills the session
- Permissions and session are re-read from the DB on every request, so deactivation and role changes apply immediately
- Role hierarchy and no privilege escalation (you cannot grant permissions you do not hold; Owner role is fixed; last Owner cannot be deactivated)
- zod validation on every input; helmet, CORS allow-list, rate limits (global + login); HTTPS redirect + HSTS in production; optional native TLS via `SSL_KEY_PATH` / `SSL_CERT_PATH`
- DB-level protection: audit_logs is append-only (trigger), users cannot be deleted (trigger), CHECK constraints on status, level and approval states, requester can never be the approver
- AES-256-GCM helper for secrets at rest (`utils/crypto.js`); uploads limited to PDF/JPG/PNG, 5 MB, magic-byte checked, random names, stored outside web root, served only through an authenticated route
- Every important action writes an audit row inside the same DB transaction as the action itself

## Approval workflow (stock safety)
`Create (DRAFT) → Submit → Approve/Reject → Execute → Notify → Audit`. A module registers a type with
`register('STOCK_ORDER', { approvePermission, execute })`. `execute` runs only inside `approve()` in one
transaction, so stock and transactions change only after approval, and any failure rolls everything back.
Phase 1 ships a `TEST_NOOP` type so you can exercise the whole flow.

## Backups
`npm run backup` (needs `pg_dump`) writes an encrypted, gzipped dump to `BACKUP_DIR` and prunes old ones.
Cron: `0 2 * * * cd /path/backend && npm run backup`. Restore: `npm run restore -- storage/backups/<file>`.

## Production checklist
Real `JWT_SECRET` / `ENCRYPTION_KEY` (never commit `.env`), `NODE_ENV=production`, TLS at the proxy or via the SSL vars,
`DB_SSL=true` for managed Postgres, a non-superuser DB role for the app, and keep the backup key safe: without it, backups cannot be restored.
