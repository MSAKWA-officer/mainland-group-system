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

// Trust Render's reverse proxy in production
if (env.isProd) {
  app.set('trust proxy', 1);
}

// ---------------------------------------------------------------
// CORS (must come FIRST, before the HTTPS redirect and everything
// else, so that preflight OPTIONS requests are answered correctly
// and error responses also carry CORS headers)
// ---------------------------------------------------------------

// Fixed frontend origins
const allowedOrigins = [
  'https://mainland-group-system.vercel.app',
  'http://localhost:5173',
];

// Extra origins from the CORS_ORIGIN env var on Render (comma separated)
if (env.CORS_ORIGIN) {
  const configuredOrigins = env.CORS_ORIGIN
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, '')) // remove trailing slash
    .filter(Boolean);

  for (const origin of configuredOrigins) {
    if (!allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
    }
  }
}

// Vercel generates a NEW URL for every deployment
// (e.g. mainland-group-system-k2vgjzefe-allan-msakwas-projects.vercel.app),
// so allow all preview deployments of this project using a pattern.
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

// ---------------------------------------------------------------
// HTTPS redirect (production only)
// ---------------------------------------------------------------
if (env.isProd) {
  app.use((req, res, next) => {
    if (req.secure) return next();

    // Never redirect preflight requests, it breaks CORS
    if (req.method === 'OPTIONS') return next();

    // 308 keeps the HTTP method (POST stays POST)
    return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  });
}

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // API is consumed from another origin (Vercel)
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

// Health check (no rate limit, useful for Render and wake-up pings)
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

  // Bind to 0.0.0.0 so Render can reach the service
  server.listen(env.PORT, '0.0.0.0', () => {
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