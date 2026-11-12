import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CloudUpload, Code2, Database, LoaderCircle, LockKeyhole, ShieldAlert, FileArchive, CheckCircle2 } from 'lucide-react';
import { Field } from '../components/Field';
import { ProcessActivity } from '../components/ProcessActivity';
import { deployFunctions, pollDeploy, type FunctionsJob } from '../services/functions';

export function FunctionsPage(){
 const [projectRef,setProjectRef]=useState('');
 const [token,setToken]=useState('');
 const [file,setFile]=useState<File|null>(null);
 const [confirm,setConfirm]=useState('');
 const [modal,setModal]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [job,setJob]=useState<FunctionsJob|null>(null);
 const active=job?.state==='running'||job?.state==='queued';
 const valid=/^[a-z]{20}$/.test(projectRef)&&token.length>8&&!!file&&file.name.toLowerCase().endsWith('.zip');
 useEffect(()=>{
  if(!job||!active)return;
  let live=true;
  const timer=window.setInterval(()=>{void pollDeploy(job.id).then(x=>{if(live)setJob(x)}).catch(e=>{if(live)setError(String(e))})},1100);
  return()=>{live=false;clearInterval(timer)};
 },[job?.id,job?.state]);
 function submit(e:FormEvent){e.preventDefault();if(!valid)return;setConfirm('');setModal(true)}
 async function deploy(){
  if(!file||confirm!==projectRef||busy)return;
  setBusy(true);setError('');
  try{setJob(await deployFunctions({file,projectRef,token,confirmation:confirm}));setModal(false)}
  catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 return <main className="content">
  <motion.section className="hero" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:.2}}>
   <h1>Restaurar Edge Functions.</h1>
   <p>Importá un ZIP generado por nuestro Backup Manager y desplegá su código en otro proyecto de Supabase. Las funciones se publican mediante Supabase CLI.</p>
  </motion.section>
  <div className="restore-alert"><ShieldAlert size={19}/><div><strong>Esta operación publica código en el proyecto de destino.</strong><p>Si una función ya existe con el mismo nombre, su despliegue puede reemplazarla. No se eliminan otras funciones, pero los secrets, import maps y deno.json no se transfieren automáticamente.</p></div></div>
  <div className="grid restore-grid">
   <section className="panel"><div className="panel-head"><h2>Configuración del destino</h2><p>Se necesita el Project Ref y un Access Token con permisos suficientes.</p></div>
   <form className="panel-body" onSubmit={submit}>
    <div className="fields">
     <div className="wide"><Field label="Project Ref de destino" value={projectRef} onChange={e=>setProjectRef(e.target.value.trim().toLowerCase())} placeholder="abcdefghijklmnopqrst" icon={<Database size={15}/>} required hint="Revisá que sea el proyecto donde querés publicar las funciones."/></div>
     <div className="wide"><Field label="Supabase Access Token" value={token} onChange={e=>setToken(e.target.value)} type="password" autoComplete="off" placeholder="sbp_..." icon={<LockKeyhole size={15}/>} required hint="Token personal de Supabase. No lo guardamos ni incluimos en el ZIP."/></div>
    </div>
    <h3 className="section-title">Archivo de funciones</h3>
    <label className="restore-file function-upload"><FileArchive size={22}/><span><strong>{file?file.name:'Seleccionar archivo ZIP'}</strong><small>{file?(file.size/1024/1024).toFixed(2)+' MB':'Debe incluir la carpeta supabase/functions/ · Máximo 120 MB'}</small></span><input type="file" accept=".zip,application/zip" onChange={e=>setFile(e.target.files?.[0]||null)} className="visually-hidden" aria-label="Elegir ZIP de Edge Functions"/><CloudUpload size={17}/></label>
    <div className="actions"><button type="submit" disabled={!valid||busy||active} className="btn primary"><CloudUpload size={16}/>Desplegar funciones</button></div>
    <AnimatePresence>{error&&<motion.div role="alert" className="message error" initial={{opacity:0,y:-5}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-5}} transition={{duration:.2}}>{error}</motion.div>}</AnimatePresence>
   </form></section>
   <aside className="panel">
    <div className="status-head"><h2>Estado del despliegue</h2><p>Actividad de la CLI de Supabase</p></div>
    <ProcessActivity job={job} title="Despliegue de funciones"/>
    <div className="progress">
     <AnimatePresence>{job?.state==='completed'&&<motion.div className="message success" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:.2}}><CheckCircle2 size={15} style={{display:'inline',verticalAlign:'middle',marginRight:7}}/>Despliegue finalizado. Verificá las funciones en el Dashboard.</motion.div>}{job?.state==='failed'&&<motion.div className="message error" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:.2}}>{job.error}</motion.div>}</AnimatePresence>
     {job?.functions?.length?<div className="function-results"><strong>Funciones detectadas</strong><p>{job.functions.join(', ')}</p></div>:null}
    </div>
    <div className="logbox"><h3>REGISTRO EN VIVO</h3><pre>{job?.logs.join('\n')||'Esperando un nuevo despliegue...'}</pre></div>
   </aside>
  </div>
  <AnimatePresence>{modal&&<motion.div className="restore-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.2}}>
   <motion.div className="restore-dialog" role="dialog" aria-modal="true" aria-labelledby="deploy-modal-title" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:10}} transition={{duration:.2}}>
    <div className="restore-warning-icon"><ShieldAlert size={22}/></div>
    <h2 id="deploy-modal-title">Confirmar despliegue</h2>
    <p>Se publicarán las funciones del ZIP en el proyecto de destino. Las funciones existentes con el mismo nombre pueden actualizarse. Revisá el Project Ref.</p>
    <label className="field"><span className="field-label">Escribí el Project Ref para continuar</span><span className="input-wrap"><input autoFocus value={confirm} onChange={e=>setConfirm(e.target.value.trim().toLowerCase())} placeholder={projectRef}/></span></label>
    <div className="restore-confirm-actions"><button type="button" className="btn" onClick={()=>setModal(false)} disabled={busy}>Cancelar</button><button type="button" className="btn danger" disabled={confirm!==projectRef||busy} onClick={()=>void deploy()}>{busy?<LoaderCircle size={15} className="spin"/>:<Code2 size={15}/>}Confirmar despliegue</button></div>
   </motion.div>
  </motion.div>}</AnimatePresence>
 </main>;
}
