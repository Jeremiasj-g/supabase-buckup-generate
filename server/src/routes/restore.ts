import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { z } from 'zod';
import { ensureUploadDirectory, getRestoreJob, restoreBackup, uploadDirectory } from '../services/restore.js';

const router = Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDirectory()),
    filename: (_req, _file, callback) => callback(null, randomUUID() + '.dump'),
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 1, fields: 6 },
  fileFilter: (_req, file, callback) => {
    if (extname(file.originalname).toLowerCase() !== '.dump') {
      callback(new Error('Seleccioná un archivo .dump (formato custom de pg_dump).'));
      return;
    }
    callback(null, true);
  },
});

const form = z.object({
  projectRef: z.string().regex(/^[a-z]{20}$/, 'Project Ref inválido'),
  host: z.string().min(1).max(253).regex(/^[a-zA-Z0-9.-]+$/, 'Host inválido'),
  port: z.coerce.number().int().min(1).max(65535),
  user: z.string().min(1).max(180),
  password: z.string().min(1).max(500),
  confirmation: z.string(),
}).refine(x => x.confirmation === x.projectRef, {
  message: 'La confirmación debe coincidir exactamente con el Project Ref de destino.',
  path: ['confirmation'],
}).refine(x => x.user === 'postgres.' + x.projectRef || x.user === 'postgres', {
  message: 'El usuario PostgreSQL debe corresponder al proyecto de destino.',
  path: ['user'],
});

router.post('/restore', async (req, res) => {
  await ensureUploadDirectory();
  upload.single('file')(req, res, async error => {
    if (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'No se pudo cargar el archivo.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Seleccioná el respaldo .dump que querés restaurar.' });
      return;
    }
    const { unlink } = await import('node:fs/promises');
    const parsed = form.safeParse(req.body);
    if (!parsed.success) {
      await unlink(req.file.path).catch(() => {});
      res.status(400).json({ error: parsed.error.issues.map(x => x.message).join('; ') });
      return;
    }
    try {
      const job = restoreBackup(parsed.data, req.file.path);
      res.status(202).json(job);
    } catch (cause) {
      await unlink(req.file.path).catch(() => {});
      res.status(409).json({ error: cause instanceof Error ? cause.message : 'No se pudo iniciar.' });
    }
  });
});

router.get('/restore/:id', (req, res) => {
  const job = getRestoreJob(String(req.params.id));
  if (!job) { res.status(404).json({ error: 'Restauración no encontrada.' }); return; }
  res.json(job);
});

export default router;
