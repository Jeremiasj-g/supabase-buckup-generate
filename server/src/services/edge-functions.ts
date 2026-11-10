import { run } from './database.js';
export async function downloadFunctions(ref:string,token:string,cwd:string){await run('supabase',['functions','download','--remote='+ref,'--use-api'],{cwd,env:{SUPABASE_ACCESS_TOKEN:token},timeout:900000})}
