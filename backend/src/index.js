require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const roadtripRoutes = require('./routes/roadtrips');
const memberRoutes = require('./routes/members');
const stepRoutes = require('./routes/steps');
const activityRoutes = require('./routes/activities');
const accommodationRoutes = require('./routes/accommodations');
const photoRoutes = require('./routes/photos');
const invitationRoutes = require('./routes/invitations');
const betaRoutes = require('./routes/beta');
const adminRoutes = require('./routes/admin');
const suggestionsRoutes = require('./routes/suggestions');
const routesRoutes = require('./routes/routes');
const devhubRoutes = require('./routes/devhub');
const { router: devhubWebhookRouter } = require('./routes/devhubWebhook');
const itinerariesRouter = require("./routes-rp/itineraries");
const placesRouter      = require("./routes-rp/places");
const campingsRouter    = require("./routes-rp/campings");
const aiRouter          = require("./routes-rp/ai");
const trailsRouter      = require("./routes-rp/trails");
const directionsRouter  = require("./routes-rp/directions");
const park4nightRouter  = require("./routes-rp/park4night");
const preferencesRouter = require("./routes-rp/preferences");
const documentsRouter   = require("./routes-rp/documents");
const todosRouter        = require("./routes-rp/todos");



const app = express();
const PORT = process.env.PORT || 3111;

// Webhook GitHub — doit être monté AVANT express.json() pour lire le raw body
app.use('/api/devhub', devhubWebhookRouter);

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  const isSync = ['PUT', 'PATCH', 'DELETE'].includes(req.method) &&
    /^\/(roadtrips|steps|activities|accommodations|photos)/.test(req.path.replace('/api/', ''));

  res.on('finish', () => {
    const ms = Date.now() - start;
    const tag = isSync ? '[SYNC]' : '[API] ';
    const status = res.statusCode;
    const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
    const ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.log(`\x1b[2m${ts}\x1b[0m ${color}${tag}\x1b[0m ${req.method} ${req.path} → ${status} (${ms}ms)`);
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/roadtrips', memberRoutes);
app.use('/api/roadtrips', roadtripRoutes);
app.use('/api/steps', stepRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/accommodations', accommodationRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/beta', betaRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/suggestions', suggestionsRoutes);
app.use('/api/routes', routesRoutes);
app.use('/api/admin/devhub', devhubRoutes);

app.use("/api/itineraries", itinerariesRouter);
app.use("/api/places",      placesRouter);
app.use("/api/campings",    campingsRouter);
app.use("/api/ai",          aiRouter);
app.use("/api/trails",      trailsRouter);
app.use("/api/directions",  directionsRouter);
app.use("/api/park4night",  park4nightRouter);
app.use("/api/preferences", preferencesRouter);
app.use("/api/todos",        todosRouter);
app.use("/api/documents",   documentsRouter);


// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Server running on http://0.0.0.0:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
});
