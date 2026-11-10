import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
export type Connection={host:string;port:number;user:string;password:string};
export function run(command:string,args:string[],opt:{cwd?:string;env?:NodeJS.ProcessEnv;timeout?:number}={}):Promise<string>{
 return new Promise((resolve,reject)=>{let output='';let done=false;const child=spawn(command,args,{cwd:opt.cwd,env:{...process.env,...opt.env},shell:false,windowsHide:true});const timer=setTimeout(()=>finish(new Error(command+' tardó demasiado')),opt.timeout??900000);
 function finish(err?:Error){if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve(output)}
 child.stdout.on('data',b=>{output=(output+String(b)).slice(-4000)});child.stderr.on('data',b=>{output=(output+String(b)).slice(-4000)});
 child.on('error',e=>finish(new Error('No se pudo ejecutar '+command+': '+e.message)));
 child.on('close',c=>finish(c===0?undefined:new Error(command+' terminó con error ('+c+'): '+output.slice(-800))));
 });}
export async function available(command:string){try{await run(command,['--version'],{timeout:7000});return true}catch{return false}}
function env(c:Connection){return {PGPASSWORD:c.password,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'12'}}
export async function testDb(c:Connection){await run('psql',['-X','-w','-h',c.host,'-p',String(c.port),'-U',c.user,'-d','postgres','-At','-c','SELECT 1'],{env:env(c),timeout:30000})}
export async function dump(c:Connection,target:string){await run('pg_dump',['-h',c.host,'-p',String(c.port),'-U',c.user,'-d','postgres','-Fc','--no-owner','--no-acl','--file',target],{env:env(c),timeout:1800000});await run('pg_restore',['--list',target],{timeout:60000});if((await stat(target)).size<100)throw new Error('Backup vacío')}
