// Cargar .env.local primero si existe (desarrollo local), luego .env
const fs = require('fs');
if (fs.existsSync('.env.local')) {
  require('dotenv').config({ path: '.env.local' });
}
require('dotenv').config(); // .env tiene menor prioridad
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../models');

const app = express();
const PORT = process.env.PORT || 4005;

// Confiar en proxy (Railway)
app.set('trust proxy', 1);

// CORS: libre en dev/postman, whitelist en prod desde CORS_ORIGINS
const origins = (process.env.CORS_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);                      // curl/postman
    if (process.env.NODE_ENV !== 'production') return cb(null, true);
    return cb(null, origins.length === 0 || origins.includes(origin));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','x-request-id']
}));

app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID para trazas
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.set('x-request-id', req.id);
  next();
});

app.use(morgan(':method :url :status - :response-time ms - :req[x-request-id]'));

// Timeouts prudentes
app.use((req, res, next) => {
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

// Health / Readiness (mantengo alias /healthz y /readyz)
app.get('/health', (_req, res) => res.json({ ok: true, service: 'reviews-service' }));
app.get('/ready',  async (_req, res) => {
  try { await sequelize.authenticate(); return res.json({ ok: true }); }
  catch { return res.status(503).json({ ok: false }); }
});
app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'reviews-service' }));
app.get('/readyz',  async (_req, res) => {
  try { await sequelize.authenticate(); return res.json({ ok: true }); }
  catch { return res.status(503).json({ ok: false }); }
});

// Rutas
app.use('/api/v1', require('./routes/contact.routes'));
app.use('/api/v1', require('./routes/reviews.routes'));

// Error handler
app.use((err, _req, res, _next) => {
  const s = err.status || 500;
  res.status(s).json({
    error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal error' }
  });
});

// Bind 0.0.0.0 para Railway
app.listen(PORT, '0.0.0.0', () => console.log(`reviews-service on :${PORT}`));
