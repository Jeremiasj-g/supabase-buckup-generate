import express from 'express';
import routes from './routes/backups.js';
import { cleanup } from './services/backup.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
 const origin = req.get('Origin');
 if (origin && !['http://127.0.0.1:5173', 'http://localhost:5173'].includes(origin)) {
  res.status(403).json({ error: 'Origen no permitido' }); return;
 }
 next();
});

// La API que ya funcionaba no depende del módulo Restaurar.
app.use('/api', routes);

// Carga aislada: si multer todavía no se instaló, pg_dump sigue funcionando.
let restoreRouter: express.Router | null = null;
void import('./routes/restore.js')
 .then(({default:router}) => {
  restoreRouter = router;
  console.log('Módulo Restaurar respaldo disponible.');
 })
 .catch((error: unknown) => {
  console.error('Restaurar respaldo no se pudo iniciar:', error);
 });

app.use('/api', (req, res, next) => {
 if (!req.path.startsWith('/restore')) return next();
 if (!restoreRouter) {
  res.status(503).json({
   error: 'Restaurar respaldo no está disponible todavía. Ejecutá npm install y reiniciá npm run dev.',
  });
  return;
 }
 restoreRouter(req, res, next);
});

app.use('/api', (req, res) => {
 res.status(404).json({ error: 'Ruta de API no encontrada: ' + req.path });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
 console.error('Error de API:', error);
 if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor. Revisá la terminal del backend.' });
});

app.listen(4174, '127.0.0.1', () => {
 console.log('API de backups disponible en http://127.0.0.1:4174');
 void cleanup().catch(console.error);
});
