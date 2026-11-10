import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

export type Connection={host:string;port:number;user:string;password:string};

// Ejecuta binarios directamente: nunca construye comandos de shell con credenciales.
export function run(command:string,args:string[],opt:{cwd?:string;env?:NodeJS.ProcessEnv;timeout?:number;onLine?:(line:string)=>void}={}):Promise<string>{
 return new Promise((resolve,reject)=>{
  let output='';let done=false;
  const child=spawn(command,args,{cwd:opt.cwd,env:{...process.env,...opt.env},shell:false,windowsHide:true});
  const timer=setTimeout(()=>{child.kill();finish(new Error(command+' excedió el tiempo máximo'))},opt.timeout??900000);
  function finish(err?:Error){if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve(output)}
  let stdoutPending='';let stderrPending='';
  const accept=(chunk:string,stream:'stdout'|'stderr')=>{
    output=(output+chunk).slice(-6000);
    const buffer=(stream==='stdout'?stdoutPending:stderrPending)+chunk;
    const parts=buffer.split(/\r?\n|\r/g);
    const remaining=parts.pop()||'';
    if(stream==='stdout')stdoutPending=remaining;else stderrPending=remaining;
    for(const raw of parts){
      const line=raw.trim();
      if(line)opt.onLine?.(line.slice(0,450));
    }
  };
  child.stdout.on('data',b=>accept(String(b),'stdout'));
  child.stderr.on('data',b=>accept(String(b),'stderr'));
  child.on('error',e=>finish(new Error('No se pudo ejecutar '+command+': '+e.message)));
  child.on('close',c=>{
    for(const pending of [stdoutPending,stderrPending])if(pending.trim())opt.onLine?.(pending.trim().slice(0,450));
    finish(c===0?undefined:new Error(command+' terminó con código '+c+': '+output.slice(-1200)));
  });
 });
}
export async function available(command:string){try{await run(command,['--version'],{timeout:7000});return true}catch{return false}}
function env(c:Connection){return {PGPASSWORD:c.password,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'15'}}

// El chequeo de conexión es opcional: no impide usar pg_dump si psql no está instalado.
export async function testDb(c:Connection){
 if(!(await available('psql')))return 'psql no está instalado; podés ejecutar el respaldo directamente con pg_dump.';
 await run('psql',['-X','-w','-h',c.host,'-p',String(c.port),'-U',c.user,'-d','postgres','-At','-c','SELECT 1'],{env:env(c),timeout:30000});
 return 'Conexión PostgreSQL verificada correctamente.';
}

export async function dump(c:Connection,target:string,onLine?:(line:string)=>void){
 // Traducción directa del comando PowerShell original:
 // -h HOST -p 6543 -U postgres.PROJECT_REF -d postgres -Fc --no-owner --file ... --verbose
 // La URI --dbname duplicada se omite, porque -d postgres ya selecciona la misma BD.
 // sslmode=require se aplica con PGSSLMODE=require.
 await run('pg_dump',[
  '-h',c.host,'-p',String(c.port),'-U',c.user,'-d','postgres',
  '-Fc','--no-owner','--file',target,'--verbose'
 ],{env:env(c),timeout:1800000,onLine});
 // Validación del índice del dump, solamente si existe pg_restore.
 if(await available('pg_restore'))await run('pg_restore',['--list',target],{timeout:60000});
 if((await stat(target)).size<100)throw new Error('El archivo .dump parece vacío');
}
