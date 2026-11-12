import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { run, type Connection } from './database.js';

// La instalación npm de Supabase CLI no crea necesariamente un comando global.
// Resolver el binario del paquete de plataforma evita "spawn supabase ENOENT"
// en Windows, incluso cuando el proceso corre desde el workspace /server.
function platformFolder():string|undefined {
 const arch=process.arch==='x64'?'x64':process.arch==='arm64'?'arm64':undefined;
 if(!arch)return;
 const os=process.platform==='win32'?'windows':process.platform==='darwin'?'darwin':process.platform==='linux'?'linux':undefined;
 return os?'cli-'+os+'-'+arch:undefined;
}
export function locateSupabase():string {
 const variant=platformFolder();
 let dir=resolve(process.cwd());
 const visited=new Set<string>();
 while(!visited.has(dir)){
  visited.add(dir);
  const candidates=[
   ...(variant?[join(dir,'node_modules','@supabase',variant,'bin',process.platform==='win32'?'supabase.exe':'supabase')]:[]),
   join(dir,'node_modules','supabase','bin',process.platform==='win32'?'supabase.exe':'supabase'),
  ];
  for(const candidate of candidates)if(existsSync(candidate))return candidate;
  const parent=dirname(dir);
  if(parent===dir)break;
  dir=parent;
 }
 return 'supabase'; // Instalaciones globales con Scoop, Homebrew, etc.
}

export async function supabaseAvailable():Promise<boolean>{
 try{await run(locateSupabase(),['--version'],{timeout:15000});return true}catch{return false}
}

export async function runSupabase(
 args:string[],
 opts:{cwd?:string;env?:NodeJS.ProcessEnv;timeout?:number;onLine?:(line:string)=>void}={},
){
 try{
  return await run(locateSupabase(),args,opts);
 }catch(error){
  const message=error instanceof Error?error.message:String(error);
  if(message.includes('ENOENT')||message.includes('No se pudo ejecutar supabase')){
   throw new Error('No se encontró Supabase CLI. Ejecutá npm install en la raíz del proyecto y luego npm run dev. Comprobá con npx --no-install supabase --version.');
  }
  throw error;
 }
}
