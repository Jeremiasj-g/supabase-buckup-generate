export type RestoreJob = {
 id:string;state:'queued'|'running'|'completed'|'failed';step:string;progress:number;logs:string[];error?:string;createdAt:string
};
export type RestoreInput={projectRef:string;host:string;port:number;user:string;password:string;confirmation:string;file:File};
async function parse<T>(response:Response):Promise<T>{
 const body=await response.json();
 if(!response.ok)throw new Error(body.error||'No se pudo procesar la restauración');
 return body as T;
}
export async function createRestore(input:RestoreInput):Promise<RestoreJob>{
 const body=new FormData();
 (['projectRef','host','port','user','password','confirmation'] as const).forEach(key=>body.append(key,String(input[key])));
 body.append('file',input.file,input.file.name);
 return parse(await fetch('/api/restore',{method:'POST',body}));
}
export async function fetchRestore(id:string):Promise<RestoreJob>{
 return parse(await fetch('/api/restore/'+encodeURIComponent(id)));
}
