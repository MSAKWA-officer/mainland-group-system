// Encrypted, compressed pg_dump. Run from cron:  0 2 * * * cd /app/backend && npm run backup
const { spawn } = require('child_process');
const zlib = require('zlib'); const crypto = require('crypto'); const fs = require('fs'); const path = require('path');
const env = require('../src/config/env');
const { key } = require('../src/utils/crypto');

fs.mkdirSync(env.BACKUP_DIR, { recursive: true });
const file = path.join(env.BACKUP_DIR, `mainland-${new Date().toISOString().replace(/[:.]/g, '-')}.sql.gz.enc`);
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const out = fs.createWriteStream(file, { mode: 0o600 }); out.write(iv);
const dump = spawn('pg_dump', ['--no-owner', env.DATABASE_URL], { stdio: ['ignore', 'pipe', 'inherit'] });
dump.stdout.pipe(zlib.createGzip()).pipe(cipher).pipe(out, { end: false });
cipher.on('end', () => out.end(cipher.getAuthTag()));            // layout: iv(12) | ciphertext | authTag(16)
dump.on('close', (code) => { if (code) { console.error('pg_dump failed'); fs.rmSync(file, { force: true }); process.exit(1); } });
out.on('finish', () => {
  const cutoff = Date.now() - env.BACKUP_RETENTION_DAYS * 864e5;
  for (const f of fs.readdirSync(env.BACKUP_DIR)) { const p = path.join(env.BACKUP_DIR, f); if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p); }
  console.log('Backup written:', file);
});
