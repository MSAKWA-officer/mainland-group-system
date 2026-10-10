# Mainland Backend (Lupeta layout)

```
mainland-backend/
├── src/
│   ├── config/        env.js, database.js (sequelize-cli), sequelize.js (app connection), rbac.js
│   ├── controllers/   authController, userController, roleController, auditController,
│   │                  approvalController, notificationController, fileController, monitoringController
│   ├── middleware/    auth, error, rateLimit, upload, validate
│   ├── models/        one file per model + index.js (associations)
│   ├── routes/        index.js + one router per module (zod schemas live here)
│   ├── services/      audit, approvals, notify
│   ├── utils/         crypto, errors, password
│   └── server.js
├── migrations/        sequelize-cli migrations
├── seeders/           roles/permissions + first Owner
├── scripts/           encrypted backup / restore
├── .sequelizerc  .env.example  package.json
```

Run: `cp .env.example .env` → `npm install` → `npm run setup` → `npm run dev`
All API URLs are unchanged (`/api/auth`, `/api/users`, `/api/rbac`, `/api/audit-logs`,
`/api/approvals`, `/api/notifications`, `/api/files`, `/api/monitoring`).
