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

// cPanel (LiteSpeed/Passenger) sits in front of Node as a reverse proxy
app.set('trust proxy', 1);

// ---------------------------------------------------------------
// CORS (must come FIRST so preflight OPTIONS requests are answered
// and error responses also carry CORS headers)
// ---------------------------------------------------------------

// Fixed frontend origins
const allowedOrigins = [
  'https://www.mbeyamainland.co.tz',
  'https://mbeyamainland.co.tz',
  'https://mainland-group-system.vercel.app',
  'http://localhost:5173',
];

// Extra origins from the CORS_ORIGIN env var (comma separated, optional)
if (env.CORS_ORIGIN) {
  const configuredOrigins = String(env.CORS_ORIGIN)
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, '')) // remove trailing slash
    .filter(Boolean);

  for (const origin of configuredOrigins) {
    if (!allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
    }
  }
}

// Vercel preview deployments (optional, harmless to keep)
const vercelPreviewPattern =
  /^https:\/\/mainland-group-system-[a-z0-9-]+-allan-msakwas-projects\.vercel\.app$/;

const isOriginAllowed = (origin) =>
  allowedOrigins.includes(origin) || vercelPreviewPattern.test(origin);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests without Origin (health checks, curl, server-to-server)
    if (!origin || isOriginAllowed(origin)) {
      return callback(null, true);
    }

    console.warn('Blocked by CORS:', origin);
    return callback(null, false); // no CORS headers -> browser blocks it
  },
  credentials: true, // needed for refresh-token cookie
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// NOTE: No HTTPS redirect here. cPanel/LiteSpeed already serves the API
// over HTTPS, and a redirect inside Node can cause redirect loops.

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // API is consumed from another origin (the frontend domain)
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// Parse request bodies and cookies
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Request logging
app.use(morgan(env.isProd ? 'combined' : 'dev'));

// Health check (no rate limit)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// API rate limiting
app.use('/api', apiLimiter);

// API routes
app.use('/api', require('./routes'));

// 404 and error handling
app.use(notFound);
app.use(errorHandler);

// ---------------------------------------------------------------
// Start server
// ---------------------------------------------------------------
(async () => {
  await sequelize.authenticate();

  const server =
    env.SSL_KEY_PATH && env.SSL_CERT_PATH
      ? https.createServer(
          {
            key: fs.readFileSync(env.SSL_KEY_PATH),
            cert: fs.readFileSync(env.SSL_CERT_PATH),
            minVersion: 'TLSv1.2',
          },
          app
        )
      : http.createServer(app);

  // On cPanel (Passenger), PORT is provided by the environment.
  // Do not hard-code the port and do not force a host.
  server.listen(env.PORT, () => {
    console.log(`Mainland API running on port ${env.PORT} (${env.NODE_ENV})`);
    console.log('Allowed CORS origins:', allowedOrigins);
  });

  const stop = () => {
    server.close(() => {
      sequelize
        .close()
        .then(() => process.exit(0))
        .catch((error) => {
          console.error('Database shutdown error:', error.message);
          process.exit(1);
        });
    });
  };

  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
})().catch((error) => {
  console.error('Startup failed:', error.message);
  process.exit(1);
});