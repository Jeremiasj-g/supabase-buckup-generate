import { createWriteStream } from 'node:fs';
import { mkdir,rm,readdir,stat,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import archiver from 'archiver';
import { dump,type Connection } from './database.js';
import { downloadFunctions } from './edge-functions.js';
export type Input=Connection&{projectRef:string;accessToken:string;database:boolean;functions:boolean};
export type Job={id:string;state:'queued'|'running'|'completed'|'failed';step:string;progress:number;logs:string[];error?:string;filename?:string;path?:string};
const jobs=new Map<string,Job>();let running=false;const base=join(process.cwd(),'.backups');
export const findJob=(id:string)=>jobs.get(id);
export function publicJob(j:Job){const {path,...safe}=j;return safe}
function advance(j:Job,step:string,progress:number){j.step=step;j.progress=progress;j.logs.push(step);if(j.logs.length>30)j.logs.shift()}
export function start(input:Input){if(running)throw new Error('Ya existe un backup en curso');running=true;const j:Job={id:randomUUID(),state:'queued',step:'Preparando',progress:0,logs:[]};jobs.set(j.id,j);void perform(j,input).finally(()=>{running=false});return j}
async function zip(source:string,target:string){await new Promise<void>((resolve,reject)=>{const file=createWriteStream(target);const arch=archiver('zip',{zlib:{level:6}});file.on('close',resolve);file.on('error',reject);arch.on('error',reject);arch.pipe(file);arch.directory(source,false);void arch.finalize()})}
async function perform(j:Job,input:Input){const folder=join(base,j.id);try{j.state='running';await mkdir(folder,{recursive:true});advance(j,'Preparando archivos',15);if(input.database){advance(j,'Exportando PostgreSQL',30);await dump(input,join(folder,'database.dump'));advance(j,'PostgreSQL validado',60)}else advance(j,'Base de datos omitida',60);if(input.functions){advance(j,'Descargando Edge Functions',69);await downloadFunctions(input.projectRef,input.accessToken,folder);advance(j,'Edge Functions descargadas',88)}else advance(j,'Edge Functions omitidas',88);await writeFile(join(folder,'manifest.json'),JSON.stringify({projectRef:input.projectRef,createdAt:new Date().toISOString(),components:{database:input.database,functions:input.functions},notIncluded:['Storage objects','Secrets','Auth external settings','Edge function import maps may be missing']},null,2));advance(j,'Generando archivo ZIP',94);j.filename='supabase_'+input.projectRef+'_'+Date.now()+'.zip';j.path=join(base,j.id+'.zip');await zip(folder,j.path);advance(j,'Respaldo listo',100);j.state='completed'}catch(e){j.state='failed';j.error=e instanceof Error?e.message:String(e);advance(j,'Falló el respaldo',j.progress)}finally{await rm(folder,{recursive:true,force:true}).catch(()=>{})}}
export async function cleanup(){await mkdir(base,{recursive:true});for(const file of await readdir(base)){if(!file.endsWith('.zip'))continue;const path=join(base,file);if(Date.now()-(await stat(path)).mtimeMs>86400000)await rm(path,{force:true})}}
