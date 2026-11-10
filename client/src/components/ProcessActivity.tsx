import { useEffect, useState } from 'react';
import { Activity, Clock3, Database, LoaderCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

type JobActivity = {
 state: 'queued'|'running'|'completed'|'failed';
 step: string;
 logs: string[];
 activityCount?: number;
 currentOperation?: string;
 createdAt?: string;
};

export function ProcessActivity({ job, title }: { job: JobActivity | null; title: string }) {
 const [seconds, setSeconds] = useState(0);
 const active = job?.state === 'queued' || job?.state === 'running';
 useEffect(() => {
  if (!job || !active) return;
  const started = job.createdAt ? new Date(job.createdAt).getTime() : Date.now();
  const refresh = () => setSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
  refresh();
  const timer = window.setInterval(refresh, 1000);
  return () => window.clearInterval(timer);
 }, [job?.createdAt, job?.state, active]);
 const latest = job?.currentOperation || job?.step || 'Esperando nuevo proceso';
 const elapsed = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
 return (
  <div className="process-activity" aria-live="polite">
   <div className="process-activity-heading">
    <span>{active ? <LoaderCircle className="spin" size={15}/> : <Activity size={15}/>} {title}</span>
    {active && <span className="process-elapsed"><Clock3 size={13}/> {elapsed}</span>}
   </div>
   <div className="process-status-line">
    <AnimatePresence mode="wait" initial={false}>
     <motion.span key={latest} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="process-operation">{latest}</motion.span>
    </AnimatePresence>
   </div>
   <div className="process-meta"><Database size={13}/> {job?.activityCount ? job.activityCount + ' mensajes recibidos de PostgreSQL' : active ? 'Esperando salida de PostgreSQL…' : 'Sin operaciones en curso'}</div>
   {active && <div className="process-indeterminate" role="progressbar" aria-label="Proceso en curso, avance exacto no disponible"><div/></div>}
  </div>
 );
}
