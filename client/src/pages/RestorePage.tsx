import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Database, FileArchive, HardDriveUpload, KeyRound, LoaderCircle, LockKeyhole, Server, ShieldAlert, Wifi } from 'lucide-react';
import { Field } from '../components/Field';
import { ProcessActivity } from '../components/ProcessActivity';
import { createRestore, fetchRestore, type RestoreJob } from '../services/restore';

const initial={projectRef:'',host:'',port:6543,user:'',password:'',confirmation:''};

export function RestorePage() {
 const [form,setForm]=useState(initial);
 const [file,setFile]=useState<File|null>(null);
 const [confirmOpen,setConfirmOpen]=useState(false);
 const [showPassword,setShowPassword]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [job,setJob]=useState<RestoreJob|null>(null);
 const pick=useRef<HTMLInputElement>(null);
 const change=(key:keyof typeof initial,value:string|number)=>setForm(s=>({...s,[key]:value}));
 const refValid=/^[a-z]{20}$/.test(form.projectRef);
 const duplicateRef=form.projectRef.length===40&&form.projectRef.slice(0,20)===form.projectRef.slice(20);
 const issues=[
  !refValid ? 'El Project Ref debe contener exactamente 20 letras minúsculas. Actualmente tiene '+form.projectRef.length+'.' : '',
  !form.host.trim() ? 'Ingresá el host PostgreSQL de destino.' : '',
  !(form.port>=1&&form.port<=65535) ? 'El puerto debe estar entre 1 y 65535.' : '',
  !form.user.trim() ? 'Ingresá el usuario PostgreSQL.' : '',
  form.user.trim()&&refValid&&form.user!=='postgres.'+form.projectRef&&form.user!=='postgres' ? 'El usuario debe corresponder al Project Ref de destino.' : '',
  !form.password ? 'Ingresá la contraseña de PostgreSQL.' : '',
  !file ? 'Seleccioná un archivo .dump.' : file.name.toLowerCase().endsWith('.dump')&&file.size>100 ? '' : 'Seleccioná un archivo .dump válido, no vacío.',
 ].filter(Boolean);
 const valid=issues.length===0;
 useEffect(()=>{
  if(!job||!['queued','running'].includes(job.state))return;
  let live=true;
  const interval=setInterval(()=>void fetchRestore(job.id).then(next=>{if(live)setJob(next)}).catch(e=>{if(live)setError(e instanceof Error?e.message:String(e))}),1200);
  return()=>{live=false;clearInterval(interval)};
 },[job?.id,job?.state]);
 function requestConfirmation(event:FormEvent){event.preventDefault();setError('');if(valid)setConfirmOpen(true);else setError(issues.join(' '))}
 async function execute(){
  if(!file||form.confirmation!==form.projectRef||busy)return;
  setBusy(true);setError('');
  try{
   const result=await createRestore({...form,file});
   setJob(result);setConfirmOpen(false);
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 const running=job?.state==='queued'||job?.state==='running';
 return <main className="content">
  <motion.section className="hero" initial={{opacity:0,y:7}} animate={{opacity:1,y:0}} transition={{duration:.2}}>
   <h1>Restaurar respaldo.</h1>
   <p>Seleccioná un archivo .dump y configurá la conexión a una base de datos de destino. La restauración utiliza los parámetros de tu comando pg_restore.</p>
  </motion.section>
  <div className="restore-alert"><ShieldAlert size={19}/><div><strong>Esta operación modifica la base de datos de destino.</strong><p>Las opciones --clean y --if-exists eliminan objetos existentes antes de recrearlos. Usá un proyecto nuevo y comprobá el Project Ref antes de continuar. La operación no es necesariamente reversible.</p></div></div>
  <div className="grid restore-grid">
   <section className="panel"><div className="panel-head"><h2>Configuración de restauración</h2><p>Datos del proyecto de destino · Supabase → Connect</p></div>
    <form className="panel-body" onSubmit={requestConfirmation}>
      <div className="fields">
       <div className="wide"><Field label="Project Ref de destino" required icon={<Database size={15}/>} placeholder="abcdefghijklmnopqrst" value={form.projectRef} onChange={e=>{const ref=e.target.value.toLowerCase().trim();setError('');setForm(s=>({...s,projectRef:ref,user:!s.user||s.user.startsWith('postgres.')?'postgres.'+ref:s.user,confirmation:''}))}} hint="Lo encontrás en la URL del proyecto de Supabase. Debe tener exactamente 20 letras."/>{form.projectRef&&!refValid&&<motion.div className="restore-validation" role="alert" initial={{opacity:0,y:-5}} animate={{opacity:1,y:0}} transition={{duration:.2}}>El Project Ref ingresado tiene {form.projectRef.length} caracteres; debe tener 20.{duplicateRef&&<button type="button" className="restore-fix-ref" onClick={()=>{const ref=form.projectRef.slice(0,20);setForm(s=>({...s,projectRef:ref,user:'postgres.'+ref,confirmation:''}));setError('')}}>Detecté un valor repetido. Usar una sola vez el Ref</button>}</motion.div>}</div>
       <Field label="Host PostgreSQL" required icon={<Server size={15}/>} placeholder="aws-1-us-east-2.pooler.supabase.com" value={form.host} onChange={e=>change('host',e.target.value)}/>
       <Field label="Puerto" required icon={<Wifi size={15}/>} type="number" min="1" max="65535" value={form.port} onChange={e=>change('port',Number(e.target.value))} hint="Por defecto 6543, igual que tu comando original."/>
       <Field label="Usuario PostgreSQL" required icon={<KeyRound size={15}/>} value={form.user} onChange={e=>change('user',e.target.value)} placeholder="postgres.PROJECT_REF"/>
       <label className="field"><span className="field-label">Contraseña de la base de destino</span><span className="input-wrap"><LockKeyhole size={15}/><input type={showPassword?'text':'password'} required autoComplete="off" value={form.password} onChange={e=>change('password',e.target.value)} placeholder="Contraseña PostgreSQL"/><button type="button" aria-label="Mostrar contraseña" onClick={()=>setShowPassword(x=>!x)}><span>{showPassword?'Ocultar':'Mostrar'}</span></button></span></label>
      </div>
      <div className="section-title">Archivo de respaldo</div>
      <input ref={pick} type="file" accept=".dump" className="visually-hidden" onChange={e=>setFile(e.target.files?.[0]||null)}/>
      <button type="button" className="restore-file" onClick={()=>pick.current?.click()}><FileArchive size={22}/><span><strong>{file?file.name:'Seleccionar archivo .dump'}</strong><small>{file?(file.size/1024/1024).toFixed(2)+' MB':'Archivo custom generado con pg_dump -Fc · Hasta 2 GB'}</small></span><HardDriveUpload size={17}/></button>
      <div className="actions"><button type="submit" className="btn primary" disabled={running||busy}><HardDriveUpload size={16}/>Restaurar respaldo</button></div><AnimatePresence initial={false}>{!valid&&!running&&!busy&&<motion.div className="restore-form-hint" key="restore-form-hint" initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={{duration:.2}}>Para continuar: {issues[0]}</motion.div>}</AnimatePresence>
      <AnimatePresence>{error&&<motion.div className="message error" role="alert" initial={{opacity:0,y:-5,height:0}} animate={{opacity:1,y:0,height:'auto'}} exit={{opacity:0,y:-5,height:0}} transition={{duration:.2}}>{error}</motion.div>}</AnimatePresence>
    </form>
   </section>
   <aside className="panel" id="restore-status"><div className="status-head"><h2>Estado de restauración</h2><p>Seguimiento del proceso en PostgreSQL</p></div>
    <div className="steps">
     {['Validar archivo .dump','Conectar al destino','Ejecutar pg_restore','Finalizar y comprobar'].map((title,index)=><div className="step" key={title}><span className={'mark '+(job?.state==='completed'||(job?.progress??0)>([12,25,40,100][index])?'done':(job?.progress??0)===[12,25,40,100][index]&&running?'running':'pending')}>{job?.state==='completed'?<CheckCircle2 size={15}/>:String(index+1).padStart(2,'0')}</span><div><strong>{title}</strong><span>{index===2?'--clean · --if-exists · --jobs 4':'Con los valores ingresados'}</span></div></div>)}
    </div>
    <ProcessActivity job={job} title="Actividad de restauración"/><div className="progress"><div className="progress-title"><span>{job?.step||'Esperando una restauración'}</span><strong>{running?'En curso':job?.state==='completed'?'Completado':job?.state==='failed'?'Con errores':'Pendiente'}</strong></div><div className={'track '+(running?'track-working':'')}><div style={{width:running?'100%':job?.state==='completed'?'100%':(job?.progress||0)+'%'}}/></div>
     <AnimatePresence>{job?.state==='completed'&&<motion.div className="message success" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:.2}}>El comando terminó correctamente. Verificá datos y permisos en Supabase.</motion.div>}{job?.state==='failed'&&<motion.div className="message error" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:.2}}>{job.error}</motion.div>}</AnimatePresence>
    </div>
    <div className="logbox"><h3>REGISTRO EN VIVO</h3><pre>{job?.logs.join('\n')||'Aún no hay actividad registrada.'}</pre></div>
   </aside>
  </div>
  <AnimatePresence>{confirmOpen&&<motion.div className="restore-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.2}}><motion.div role="dialog" aria-modal="true" aria-labelledby="restore-confirm-title" className="restore-dialog" initial={{opacity:0,y:10,scale:.985}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:10,scale:.985}} transition={{duration:.2}}>
   <div className="restore-warning-icon"><AlertTriangle size={22}/></div><h2 id="restore-confirm-title">Confirmar restauración</h2><p>Se eliminarán y recrearán objetos existentes en la base de destino. Esta acción puede causar pérdida de datos. Comprobá que sea una base nueva o descartable.</p>
   <label className="field"><span className="field-label">Escribí el Project Ref de destino para confirmar</span><span className="input-wrap"><input autoFocus value={form.confirmation} autoComplete="off" onChange={e=>change('confirmation',e.target.value.trim())} placeholder={form.projectRef}/></span></label>
   <div className="restore-confirm-actions"><button className="btn" type="button" onClick={()=>setConfirmOpen(false)} disabled={busy}>Cancelar</button><button className="btn danger" type="button" disabled={form.confirmation!==form.projectRef||busy} onClick={()=>void execute()}>{busy?<LoaderCircle size={15} className="spin"/>:<HardDriveUpload size={15}/>}Confirmar restauración</button></div>
  </motion.div></motion.div>}</AnimatePresence>
 </main>;
}
