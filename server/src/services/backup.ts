import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, rm, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import archiver from 'archiver';
import { dump, run, type Connection } from './database.js';
import { downloadFunctions } from './edge-functions.js';

export type Input = Connection & {
  projectRef: string;
  accessToken: string;
  database: boolean;
  functions: boolean;
};

export type Job = {
  id: string;
  state: 'queued' | 'running' | 'completed' | 'partial' | 'failed';
  step: string;
  progress: number;
  logs: string[];
  error?: string;
  filename?: string;
  path?: string;
  fileSize?: number;
  sqlPath?: string;
  sqlFilename?: string;
  formatting?: boolean;
  activityCount: number;
  currentOperation?: string;
  warning?: string;
};

const jobs = new Map<string, Job>();
let running = false;

// No guardar archivos temporales en el directorio de trabajo:
// carpetas sincronizadas como OneDrive pueden interferir con el archivo descargable.
const backupRoot = join(tmpdir(), 'supabase-backup-manager');

export const findJob = (id: string) => jobs.get(id);

export function publicJob(job: Job) {
  const { path, sqlPath, ...safe } = job;
  return safe;
}

function advance(job: Job, step: string, progress: number) {
  job.step = step;
  job.progress = progress;
  job.logs.push(step);
  if (job.logs.length > 40) job.logs.shift();
}

export function start(input: Input) {
  if (running) throw new Error('Ya existe un backup en curso');
  running = true;
  const job: Job = {
    id: randomUUID(),
    state: 'queued',
    step: 'Preparando respaldo',
    progress: 0,
    logs: [],
    activityCount: 0,
  };
  jobs.set(job.id, job);
  void perform(job, input).finally(() => { running = false; });
  return job;
}

function zipFolder(source: string, target: string) {
  return new Promise<void>((resolve, reject) => {
    const output = createWriteStream(target, { flags: 'wx' });
    const zip = archiver('zip', { zlib: { level: 6 } });
    output.on('close', () => resolve());
    output.on('error', reject);
    zip.on('error', reject);
    zip.pipe(output);
    zip.directory(source, false);
    void zip.finalize();
  });
}

function timestamp() {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return date.getFullYear()
    + pad(date.getMonth() + 1)
    + pad(date.getDate())
    + '_'
    + pad(date.getHours())
    + pad(date.getMinutes());
}

async function verifyFile(path: string) {
  const file = await stat(path);
  if (!file.isFile() || file.size < 100) {
    throw new Error('El archivo de respaldo no existe o está vacío.');
  }
  return file.size;
}

async function perform(job: Job, input: Input) {
  const workFolder = join(backupRoot, job.id);
  let outputPath: string | undefined;

  try {
    job.state = 'running';
    await mkdir(workFolder, { recursive: true });
    advance(job, 'Preparando archivos', 15);

    const dumpName = 'supabase_backup_' + timestamp() + '.dump';
    if (input.database) {
      advance(job, 'Ejecutando pg_dump con la configuración original', 30);
      await dump(input, join(workFolder, dumpName), line => {
        job.activityCount++;
        const clean=line.replace(/^pg_dump:\s*/i,'').slice(0,300);
        if(!clean)return;
        job.currentOperation=clean;
        job.logs.push(clean);
        if(job.logs.length>35)job.logs.shift();
      });
      advance(job, 'Archivo PostgreSQL generado', 60);
    } else {
      advance(job, 'PostgreSQL no seleccionado', 60);
    }

    if (input.database && !input.functions) {
      // Copiar fuera del directorio de trabajo: se elimina solo la carpeta de trabajo.
      advance(job, 'Preparando descarga del archivo .dump', 94);
      outputPath = join(backupRoot, job.id + '.dump');
      await copyFile(join(workFolder, dumpName), outputPath);
      job.filename = dumpName;
    } else {
      let functionsError: string | undefined;
      if (input.functions) {
        advance(job, 'Descargando Edge Functions', 69);
        try {
          const downloaded = await downloadFunctions(input.projectRef, input.accessToken, workFolder, line => {
            job.activityCount++;
            job.currentOperation=line.slice(0,300);
            job.logs.push(job.currentOperation);
            if(job.logs.length>35)job.logs.shift();
          });
          advance(job, 'Edge Functions descargadas: ' + downloaded.join(', '), 88);
        } catch (failure) {
          functionsError = failure instanceof Error ? failure.message : String(failure);
          advance(job, 'No se pudieron descargar Edge Functions: ' + functionsError, 88);
          if(!input.database) throw failure;
        }
      }
      await writeFile(join(workFolder, 'manifest.json'), JSON.stringify({
        projectRef: input.projectRef,
        createdAt: new Date().toISOString(),
        components: { database: input.database, functions: input.functions && !functionsError },
        status: functionsError ? 'partial' : 'complete',
        warning: functionsError ? 'Edge Functions no incluidas: ' + functionsError : undefined,
        notIncluded: ['Storage objects', 'Secrets', 'Auth external settings'],
      }, null, 2));

      advance(job, 'Comprimiendo archivos', 94);
      outputPath = join(backupRoot, job.id + '.zip');
      job.filename = 'supabase_backup_' + input.projectRef + '_' + timestamp() + '.zip';
      await zipFolder(workFolder, outputPath);
      if(functionsError)job.warning='PostgreSQL se respaldó, pero Edge Functions falló: '+functionsError;
    }

    // Nunca avisar 100% hasta comprobar que el archivo descargable existe.
    const size = await verifyFile(outputPath);
    job.path = outputPath;
    job.fileSize = size;
    job.state = job.warning ? 'partial' : 'completed';
    advance(job, job.warning ? 'ZIP parcial disponible para descargar' : 'Archivo listo para descargar', 100);
  } catch (error) {
    job.state = 'failed';
    job.error = error instanceof Error ? error.message : String(error);
    advance(job, 'No se pudo completar el respaldo: ' + job.error, job.progress);
    if (outputPath) await rm(outputPath, { force: true }).catch(() => {});
    job.path = undefined;
  } finally {
    await rm(workFolder, { recursive: true, force: true }).catch(() => {});
  }
}

// Convierte bajo demanda el .dump ya generado, sin conectarse otra vez a Supabase.
// Solo se admite para backups PostgreSQL individuales (no ZIP).
const formatTasks = new Map<string, Promise<{ filename: string; size: number }>>();
export async function prepareSql(job: Job): Promise<{ filename: string; size: number }> {
  if (job.state !== 'completed' || !job.path || !job.filename?.endsWith('.dump')) {
    throw new Error('La conversión SQL solo está disponible para respaldos .dump completados.');
  }
  const existingTask = formatTasks.get(job.id);
  if (existingTask) return existingTask;

  const task = (async () => {
    const original = job.path!;
    const originalName = job.filename!;
    const sqlPath = join(backupRoot, job.id + '.sql');
    const sqlFilename = originalName.replace(/\.dump$/, '.sql');

    try {
      await verifyFile(original);
      if (job.sqlPath) {
        try {
          const size = await verifyFile(job.sqlPath);
          return { filename: sqlFilename, size };
        } catch {
          job.sqlPath = undefined;
        }
      }

      job.formatting = true;
      await rm(sqlPath, { force: true }).catch(() => {});
      // Equivale al comando: pg_restore -f backup.sql -F c archivo.dump
      // --no-owner evita instrucciones de propietario poco útiles en el SQL de lectura.
      await run('pg_restore', [
        '-f', sqlPath, '-F', 'c', '--no-owner', original,
      ], { timeout: 30 * 60 * 1000 });
      const size = await verifyFile(sqlPath);
      job.sqlPath = sqlPath;
      job.sqlFilename = sqlFilename;
      return { filename: sqlFilename, size };
    } catch (error) {
      await rm(sqlPath, { force: true }).catch(() => {});
      throw new Error('No se pudo generar el SQL. Comprobá que pg_restore esté instalado: '
        + (error instanceof Error ? error.message : String(error)));
    } finally {
      job.formatting = false;
    }
  })();

  formatTasks.set(job.id, task);
  try {
    return await task;
  } finally {
    formatTasks.delete(job.id);
  }
}

export async function cleanup() {
  await mkdir(backupRoot, { recursive: true });
  for (const file of await readdir(backupRoot)) {
    if (!file.endsWith('.zip') && !file.endsWith('.dump') && !file.endsWith('.sql')) continue;
    const path = join(backupRoot, file);
    try {
      if (Date.now() - (await stat(path)).mtimeMs > 24 * 60 * 60 * 1000) {
        await rm(path, { force: true });
      }
    } catch {
      // Un archivo puede desaparecer durante una limpieza externa.
    }
  }
}
