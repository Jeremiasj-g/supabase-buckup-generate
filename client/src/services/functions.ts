export type FunctionsJob={
 id:string; state:'queued'|'running'|'completed'|'failed';step:string;
 logs:string[];error?:string;createdAt:string;activityCount:number;currentOperation?:string;
 functions?:string[];
};
async function parse<T>(response:Response):Promise<T>{
 let body:unknown;
 try{body=await response.json()}catch{throw Error('La API no respondió. Revisá la terminal de Node.js.');}
 if(!response.ok)throw Error((body as {error?:string}).error||'Error del servidor');
 return body as T;
}
export async function deployFunctions(input:{projectRef:string;token:string;confirmation:string;file:File}):Promise<FunctionsJob>{
 const form=new FormData();
 form.set('projectRef',input.projectRef);form.set('token',input.token);
 form.set('confirmation',input.confirmation);form.set('file',input.file);
 return parse(await fetch('/api/functions/deploy',{method:'POST',body:form}));
}
export async function pollDeploy(id:string):Promise<FunctionsJob>{
 return parse(await fetch('/api/functions/deploy/'+encodeURIComponent(id)));
}
