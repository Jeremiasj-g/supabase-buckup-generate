import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runSupabase } from './supabase-cli.js';

export async function downloadFunctions(ref:string,token:string,cwd:string,onLine?:(line:string)=>void){
 const supabase=join(cwd,'supabase');
 await mkdir(join(supabase,'functions'),{recursive:true});
 await writeFile(join(supabase,'config.toml'),'project_id = "supabase-backup-manager"\n');
 // Supabase CLI v3: no indicar nombre descarga todas las funciones.
 await runSupabase(['functions','download','--remote='+ref,'--use-api'],{
  cwd,env:{SUPABASE_ACCESS_TOKEN:token},timeout:900000,onLine,
 });
 const dirs=await readdir(join(supabase,'functions'),{withFileTypes:true});
 if(!dirs.some(dir=>dir.isDirectory())){
  throw new Error('La CLI no descargó ninguna Edge Function. Comprobá el token, permisos y funciones del proyecto.');
 }
 return dirs.filter(dir=>dir.isDirectory()).map(x=>x.name);
}
