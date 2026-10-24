import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from './config';
import { initializeDatabase } from './db/init';

// Import route modules
import authRoutes from './routes/auth.routes';
import distributorRoutes from './routes/distributor.routes';
import kathaRoutes from './routes/katha.routes';
import salesRoutes from './routes/sales.routes';
import stockRoutes from './routes/stock.routes';
import closingRoutes from './routes/closing.routes';
import expensesRoutes from './routes/expenses.routes';
import dashboardRoutes from './routes/dashboard.routes';
import reportsRoutes from './routes/reports.routes';
import auditRoutes from './routes/audit.routes';
import settingsRoutes from './routes/settings.routes';

const app = express();

// Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static uploads serving
app.use('/uploads', express.static(config.uploadDir));

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    shop: config.shopName,
    currency: config.currencySymbol,
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/distributors', distributorRoutes);
app.use('/api/customers', kathaRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/closing', closingRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/settings', settingsRoutes);

// Serve Frontend static production files if built
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));

// Global Error Handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled Application Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'An internal server error occurred.',
  });
});

// SPA wildcard fallback for frontend routes
app.get('*', (req: Request, res: Response) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
    return;
  }
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// Start Server after database schema check
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(config.port, () => {
      console.log(`====================================================`);
      console.log(`🍗 Reddy Chicken and Mutton Center Server running on port ${config.port}`);
      console.log(`📍 Environment: ${config.nodeEnv}`);
      console.log(`💾 PostgreSQL: ${config.databaseUrl}`);
      console.log(`====================================================`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

export default app;
