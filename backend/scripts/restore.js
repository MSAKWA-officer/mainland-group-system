// Usage: npm run restore -- storage/backups/<file>.sql.gz.enc   (restores into DATABASE_URL via psql)
const { spawn } = require('child_process'); const zlib = require('zlib'); const crypto = require('crypto'); const fs = require('fs');
const env = require('../src/config/env'); const { key } = require('../src/utils/crypto');
const file = process.argv[2]; if (!file) { console.error('Give the backup file path'); process.exit(1); }
const buf = fs.readFileSync(file);
const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12)); d.setAuthTag(buf.subarray(buf.length - 16));
const sql = zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]));
const psql = spawn('psql', [env.DATABASE_URL, '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'inherit', 'inherit'] });
psql.stdin.end(sql); psql.on('close', (c) => process.exit(c));
