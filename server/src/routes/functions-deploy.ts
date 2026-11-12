import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { rm } from 'node:fs/promises';
import { supabaseAvailable } from '../services/supabase-cli.js';
import { functionJob, functionUploadFolder, prepareFunctionUploads, startFunctionsDeploy } from '../services/functions-deploy.js';

const router=Router();
const upload=multer({
 storage:multer.diskStorage({
  destination:(_req,_file,cb)=>cb(null,functionUploadFolder()),
  filename:(_req,_file,cb)=>cb(null,randomUUID()+'.zip'),
 }),
 limits:{fileSize:120*1024*1024,files:1,fields:3},
 fileFilter:(_req,file,cb)=>{
  if(!file.originalname.toLowerCase().endsWith('.zip')){
   cb(new Error('Seleccioná un archivo ZIP de Edge Functions.'));
   return;
  }
  cb(null,true);
 },
});
const schema=z.object({
 projectRef:z.string().regex(/^[a-z]{20}$/,'Project Ref inválido'),
 token:z.string().min(8,'Ingresá un Access Token personal de Supabase').max(1000),
 confirmation:z.string(),
}).refine(x=>x.projectRef===x.confirmation,{message:'La confirmación no coincide con el Project Ref de destino.'});
router.post('/functions/deploy',async(req,res)=>{
 await prepareFunctionUploads();
 upload.single('file')(req,res,async error=>{
  if(error){res.status(400).json({error:error instanceof Error?error.message:'Error de carga'});return;}
  if(!req.file){res.status(400).json({error:'Seleccioná el archivo ZIP.'});return;}
  const parsed=schema.safeParse(req.body);
  if(!parsed.success){await rm(req.file.path,{force:true});res.status(400).json({error:parsed.error.issues.map(x=>x.message).join(' ')});return;}
  if(!(await supabaseAvailable())){await rm(req.file.path,{force:true});res.status(503).json({error:'Falta Supabase CLI. Ejecutá npm install en el proyecto y reiniciá el servidor.'});return;}
  try{
   const job=startFunctionsDeploy(parsed.data,req.file.path);
   res.status(202).json(job);
  }catch(cause){
   await rm(req.file.path,{force:true});
   res.status(409).json({error:cause instanceof Error?cause.message:'No se pudo iniciar el despliegue'});
  }
 });
});
router.get('/functions/deploy/:id',(req,res)=>{
 const job=functionJob(String(req.params.id));
 if(!job){res.status(404).json({error:'Despliegue no encontrado'});return;}
 res.json(job);
});
export default router;
