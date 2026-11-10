import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { run, type Connection } from './database.js';

export type RestoreJob = {
  id: string;
  state: 'queued' | 'running' | 'completed' | 'failed';
  step: string;
  progress: number;
  logs: string[];
  error?: string;
  createdAt: string;
  activityCount: number;
  currentOperation?: string;
};

const jobs = new Map<string, RestoreJob>();
let running = false;
const incoming = join(tmpdir(), 'supabase-backup-manager', 'incoming');

export const getRestoreJob = (id: string) => jobs.get(id);

export function uploadDirectory() { return incoming; }
export async function ensureUploadDirectory() { await mkdir(incoming, { recursive: true }); }

function update(job: RestoreJob, message: string, progress: number) {
  job.step = message;
  job.progress = progress;
  job.logs.push(message);
  if (job.logs.length > 35) job.logs.shift();
}

export function restoreBackup(input: Connection, archivePath: string) {
  if (running) throw new Error('Ya hay una restauración en curso. Esperá a que termine.');
  running = true;
  const job: RestoreJob = {
    id: randomUUID(), state: 'queued', step: 'Preparando restauración',
    progress: 0, logs: [], createdAt: new Date().toISOString(), activityCount: 0,
  };
  jobs.set(job.id, job);
  void perform(job, input, archivePath).finally(() => { running = false; });
  return job;
}

async function perform(job: RestoreJob, connection: Connection, archivePath: string) {
  try {
    job.state = 'running';
    update(job, 'Verificando archivo .dump', 12);
    const file = await stat(archivePath);
    if (!file.isFile() || file.size < 100) throw new Error('El archivo .dump está vacío.');
    await run('pg_restore', ['--list', archivePath], { timeout: 60000 });

    update(job, 'Conectando con la base de destino', 25);
    // Conservamos exactamente los parámetros del comando PowerShell que ya funciona.
    // SSL se exige mediante PGSSLMODE=require y la contraseña mediante PGPASSWORD.
    update(job, 'Restaurando objetos de PostgreSQL (el proceso puede tardar)', 40);
    await run('pg_restore', [
      '--verbose',
      '-h', connection.host,
      '-p', String(connection.port),
      '-U', connection.user,
      '-d', 'postgres',
      '--clean', '--if-exists',
      '--no-owner', '--no-privileges',
      '--jobs', '4',
      archivePath,
    ], {
      env: { PGPASSWORD: connection.password, PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '15' },
      timeout: 60 * 60 * 1000,
      onLine: line => {
        // Solo transmitir estados de pg_restore, nunca contraseñas ni conexiones.
        job.activityCount++;
        const clean=line.replace(/^pg_restore:\s*(?:procesando|processing)?\s*/i,'').slice(0,300);
        if(!clean)return;
        job.currentOperation=clean;
        job.logs.push(clean);
        if(job.logs.length>35)job.logs.shift();
      },
    });
    job.state = 'completed';
    update(job, 'Restauración finalizada. Revisá tablas, datos y funciones en Supabase.', 100);
  } catch (error) {
    job.state = 'failed';
    job.error = error instanceof Error ? error.message : String(error);
    update(job, 'La restauración terminó con error. El destino podría haber cambiado parcialmente.', job.progress);
  } finally {
    await rm(archivePath, { force: true }).catch(() => {});
  }
}
