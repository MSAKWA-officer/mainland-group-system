
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

  // Force HTTPS in production
  app.use((req, res, next) => {
    if (req.secure) return next();

    return res.redirect(
      301,
      `https://${req.headers.host}${req.originalUrl}`
    );
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
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// Allowed frontend origins
const allowedOrigins = [
  'https://mainland-group-system.vercel.app',
  'https://mainland-group-system-ikdlxhoxd-allan-msakwas-projects.vercel.app',
  'http://localhost:5173',
];

// Add any additional origins configured in Render
if (env.CORS_ORIGIN) {
  const configuredOrigins = env.CORS_ORIGIN
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of configuredOrigins) {
    if (!allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
    }
  }
}

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without Origin (e.g. server-to-server health checks)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
    ],
  })
);

// Parse request bodies and cookies
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Request logging
app.use(morgan(env.isProd ? 'combined' : 'dev'));

// API rate limiting
app.use('/api', apiLimiter);

// API routes
app.use('/api', require('./routes'));

// 404 and error handling
app.use(notFound);
app.use(errorHandler);

// Start server
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

  server.listen(env.PORT, () => {
    console.log(
      `Mainland API running on port ${env.PORT} (${env.NODE_ENV})`
    );

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
