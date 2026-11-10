import { Router } from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { z } from 'zod';
import { available, testDb } from '../services/database.js';
import { start, findJob, publicJob, prepareSql } from '../services/backup.js';

const router = Router();
const schema = z.object({
  projectRef: z.string().regex(/^[a-z]{20}$/),
  host: z.string().max(250),
  port: z.number().int().min(1).max(65535),
  user: z.string().max(150),
  password: z.string().max(500),
  accessToken: z.string().max(1000),
  database: z.boolean(),
  functions: z.boolean(),
}).refine(v => v.database || v.functions, 'Elegí algún componente')
  .refine(v => !v.database || !!(v.host && v.user && v.password), 'Faltan credenciales PostgreSQL')
  .refine(v => !v.functions || !!v.accessToken, 'Falta el token Supabase');

function parse(body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(result.error.issues.map(i => i.message).join('; '));
  return result.data;
}

function fail(res: import('express').Response, error: unknown) {
  res.status(400).json({ error: error instanceof Error ? error.message : 'Error inesperado' });
}

router.get('/health', async (_req, res) => {
  const [pgDump, pgRestore, psql, supabase] = await Promise.all(
    ['pg_dump', 'pg_restore', 'psql', 'supabase'].map(available)
  );
  res.json({ ok: pgDump && pgRestore, pgDump, pgRestore, psql, supabase });
});

router.post('/preflight', async (req, res) => {
  try {
    const input = parse(req.body);
    const message = input.database ? await testDb(input) : 'Respaldo sin PostgreSQL.';
    if (input.functions && !(await available('supabase'))) {
      throw new Error('Supabase CLI no está instalada.');
    }
    res.json({ ok: true, message: message + (input.functions ? ' Supabase CLI detectada.' : '') });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/backups', (req, res) => {
  try {
    res.status(202).json(publicJob(start(parse(req.body))));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/backups/:id', (req, res) => {
  const job = findJob(String(req.params.id));
  if (!job) {
    res.status(404).json({ error: 'Respaldo no encontrado.' });
    return;
  }
  res.json(publicJob(job));
});

router.post('/backups/:id/format-sql', async (req, res) => {
  const job = findJob(String(req.params.id));
  if (!job) {
    res.status(404).json({ error: 'Respaldo no encontrado.' });
    return;
  }
  try {
    const formatted = await prepareSql(job);
    res.json({ ok: true, ...formatted });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Error al convertir a SQL.' });
  }
});

router.get('/backups/:id/download', async (req, res) => {
  const job = findJob(String(req.params.id));
  if (!job || job.state !== 'completed' || !job.path || !job.filename) {
    res.status(404).json({ error: 'El respaldo no está disponible. Generá uno nuevo.' });
    return;
  }

  const wantsSql = req.query.format === 'sql';
  if (wantsSql && (!job.sqlPath || !job.sqlFilename)) {
    res.status(409).json({ error: 'Primero convertí el respaldo a SQL.' });
    return;
  }
  const filePath = wantsSql ? job.sqlPath! : job.path;
  const filename = wantsSql ? job.sqlFilename! : job.filename;

  try {
    // Revalidar justo antes de servir, no confiar solamente en el estado 100%.
    const info = await stat(filePath);
    if (!info.isFile() || info.size < 100) {
      res.status(410).json({ error: 'El archivo ya no está disponible. Generá un nuevo respaldo.' });
      return;
    }

    res.setHeader('Content-Type', filename.endsWith('.zip') ? 'application/zip' : wantsSql ? 'application/sql; charset=utf-8' : 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Content-Length', String(info.size));
    res.setHeader('Cache-Control', 'no-store');

    const stream = createReadStream(filePath);
    stream.on('error', (error) => {
      console.error('Error leyendo respaldo:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'No se pudo leer el archivo de respaldo.' });
      } else {
        res.destroy(error);
      }
    });
    stream.pipe(res);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    console.error('Archivo de respaldo no encontrado:', filename, code);
    res.status(410).json({ error: 'El archivo ya no existe en el servidor. Generá un nuevo respaldo.' });
  }
});

export default router;
