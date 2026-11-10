export type Payload = {
 projectRef:string;host:string;port:number;user:string;password:string;accessToken:string;database:boolean;functions:boolean
};
export type Job = {
 id:string;state:'queued'|'running'|'completed'|'failed';step:string;progress:number;logs:string[];error?:string;filename?:string;activityCount?:number;currentOperation?:string;createdAt?:string
};

// Vite puede responder 500 sin JSON cuando el backend no está levantado.
// No intentar Response.json() a ciegas: mostrar un mensaje útil al usuario.
async function request<T>(url:string,options?:RequestInit):Promise<T> {
 let response:Response;
 try {
  response=await fetch(url,options);
 } catch {
  throw new Error('No se pudo conectar con el servidor local. Comprobá que npm run dev esté ejecutándose.');
 }
 const contentType=response.headers.get('content-type')||'';
 const raw=await response.text();
 let body:unknown;
 if(contentType.includes('application/json') && raw.trim()) {
  try {body=JSON.parse(raw)} catch { /* Respuesta malformada */ }
 }
 const result=(body&&typeof body==='object')?body as Record<string,unknown>:null;
 if(!response.ok) {
  const message=typeof result?.error==='string'?result.error:null;
  throw new Error(message||(response.status>=500
   ? 'El servidor local no respondió correctamente (HTTP '+response.status+'). Comprobá la terminal del backend y ejecutá npm install si actualizaste el proyecto.'
   : 'Error HTTP '+response.status+'. Revisá que el backend esté activo.'));
 }
 if(!result) {
  throw new Error('La API respondió sin datos JSON. Revisá que el backend de Express esté ejecutándose en el puerto 4174.');
 }
 return body as T;
}

function post<T>(path:string,payload:Payload):Promise<T> {
 return request<T>('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
}
export const test=(payload:Payload):Promise<{message:string}>=>post('preflight',payload);
export const begin=(payload:Payload):Promise<Job>=>post('backups',payload);
export const poll=(id:string):Promise<Job>=>request('/api/backups/'+encodeURIComponent(id));
export const download=(id:string,format:'dump'|'sql'='dump')=>'/api/backups/'+encodeURIComponent(id)+'/download'+(format==='sql'?'?format=sql':'');
export const prepareSql=(id:string):Promise<{ok:boolean;filename:string;size:number}>=>
 request('/api/backups/'+encodeURIComponent(id)+'/format-sql',{method:'POST'});
export const health=():Promise<{pgDump:boolean;pgRestore:boolean;psql:boolean;supabase:boolean}>=>
 request('/api/health');
