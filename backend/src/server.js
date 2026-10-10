const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const { sequelize } = require('./models');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();
app.disable('x-powered-by');
if (env.isProd) {
  app.set('trust proxy', 1);                                   // behind the TLS-terminating reverse proxy
  app.use((req, res, next) => req.secure ? next() : res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)); // force HTTPS
}
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true } }));
app.use(cors({ origin: env.CORS_ORIGIN.split(','), credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(morgan(env.isProd ? 'combined' : 'dev'));
app.use('/api', apiLimiter);
app.use('/api', require('./routes'));
app.use(notFound);
app.use(errorHandler);

(async () => {
  await sequelize.authenticate();
  const server = env.SSL_KEY_PATH && env.SSL_CERT_PATH
    ? https.createServer({ key: fs.readFileSync(env.SSL_KEY_PATH), cert: fs.readFileSync(env.SSL_CERT_PATH), minVersion: 'TLSv1.2' }, app)
    : http.createServer(app);
  server.listen(env.PORT, () => console.log(`Mainland API on ${server instanceof https.Server ? 'https' : 'http'}://localhost:${env.PORT} (${env.NODE_ENV})`));
  const stop = () => server.close(() => sequelize.close().then(() => process.exit(0)));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
})().catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
