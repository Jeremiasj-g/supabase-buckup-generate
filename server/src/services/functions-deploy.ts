import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import unzipper from 'unzipper';
import { run } from './database.js';

export type FunctionJob = {
 id:string; state:'queued'|'running'|'completed'|'failed';step:string;
 logs:string[]; error?:string; createdAt:string; activityCount:number;currentOperation?:string;
 functions?:string[];
};
const jobs=new Map<string,FunctionJob>();
const base=join(tmpdir(),'supabase-backup-manager','function-deploy');
let busy=false;
export const functionJob=(id:string)=>jobs.get(id);
export const functionUploadFolder=()=>join(base,'uploads');
export const prepareFunctionUploads=()=>mkdir(functionUploadFolder(),{recursive:true});

async function extractSafe(zipFile:string,dest:string):Promise<string[]>{
 const archive=await unzipper.Open.file(zipFile);
 if(archive.files.length>800)throw new Error('El ZIP contiene demasiados archivos.');
 const names=new Set<string>();let total=0;
 const root=resolve(dest);
 for(const item of archive.files){
  const entry=item.path.replace(/\\/g,'/');
  if(!entry.startsWith('supabase/functions/'))continue;
  const parts=entry.split('/');
  if(parts.some(x=>x==='..'||x==='.')||entry.startsWith('/')||entry.includes('\0'))throw new Error('Ruta insegura en el ZIP.');
  if(parts.length<4||!parts[2]||!/^[-a-zA-Z0-9_]+$/.test(parts[2]))continue;
  if(item.type==='Directory')continue;
  // Evitar entradas symlink y agotamiento de espacio por ZIP bombs.
  const mode=(item as typeof item & {externalFileAttributes?:number}).externalFileAttributes;
  if(mode!==undefined&&(((mode>>>16)&0o170000)===0o120000))throw new Error('No se admiten enlaces simbólicos en el ZIP.');
  const size=item.uncompressedSize;
  total+=size;
  if(size>10*1024*1024||total>100*1024*1024)throw new Error('El ZIP excede el tamaño permitido al descomprimir.');
  const target=resolve(dest,entry);
  if(!target.startsWith(root+sep))throw new Error('Ruta de archivo inválida.');
  const bytes=await item.buffer();
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,bytes,{flag:'wx'});
  if(entry.endsWith('/index.ts')||entry.endsWith('/index.js')||entry.endsWith('/index.tsx'))names.add(parts[2]);
 }
 if(names.size===0)throw new Error('No se encontraron funciones en supabase/functions/<nombre>/index.ts dentro del ZIP.');
 return [...names].sort();
}
function log(job:FunctionJob,message:string){
 const clean=message.slice(0,300);
 job.currentOperation=clean;job.activityCount++;
 job.logs.push(clean);
 if(job.logs.length>40)job.logs.shift();
}
export function startFunctionsDeploy(input:{projectRef:string;token:string},zipFile:string){
 if(busy)throw new Error('Ya existe un despliegue de funciones en curso.');
 busy=true;
 const job:FunctionJob={id:randomUUID(),state:'queued',step:'Preparando despliegue',logs:[],createdAt:new Date().toISOString(),activityCount:0};
 jobs.set(job.id,job);
 void (async()=>{
  const directory=join(base,job.id);
  try{
   job.state='running';job.step='Validando el archivo ZIP';
   await mkdir(directory,{recursive:true});
   const names=await extractSafe(zipFile,directory);
   await writeFile(join(directory,'supabase','config.toml'),'project_id = "supabase-backup-manager"\n');
   job.functions=names;
   log(job,'Funciones detectadas: '+names.join(', '));
   job.step='Desplegando '+names.length+' funciones en el proyecto de destino';
   // --yes solo tras confirmación explícita del project ref por parte del usuario.
   // No usar --prune: jamás borrar funciones remotas no incluidas en el ZIP.
   await run('supabase',['functions','deploy','--remote='+input.projectRef,'--use-api','--yes'],{
    cwd:directory,env:{SUPABASE_ACCESS_TOKEN:input.token},timeout:30*60*1000,
    onLine:line=>log(job,line),
   });
   job.step='Despliegue finalizado';job.state='completed';
   log(job,'Supabase CLI terminó correctamente. Comprobá las funciones y los secrets en el destino.');
  }catch(error){
   job.state='failed';job.step='Despliegue con errores';
   job.error=error instanceof Error?error.message:String(error);
   log(job,job.error);
  }finally{
   busy=false;
   await rm(directory,{recursive:true,force:true}).catch(()=>{});
   await rm(zipFile,{force:true}).catch(()=>{});
  }
 })();
 return job;
}
