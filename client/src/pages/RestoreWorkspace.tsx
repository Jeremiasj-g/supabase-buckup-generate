import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Database, Code2 } from 'lucide-react';
import { RestorePage } from './RestorePage';
import { FunctionsPage } from './FunctionsPage';

// Una sola sección de navegación para las dos opciones de restauración.
export function RestoreWorkspace(){
 const [tab,setTab]=useState<'database'|'functions'>('database');
 return <div>
  <div className="restore-switch-wrap"><div className="restore-switch" role="group" aria-label="Tipo de respaldo a restaurar">
   <button type="button" className={tab==='database'?'selected':''} aria-pressed={tab==='database'} onClick={()=>setTab('database')}><Database size={15}/> Base de datos (.dump)</button>
   <button type="button" className={tab==='functions'?'selected':''} aria-pressed={tab==='functions'} onClick={()=>setTab('functions')}><Code2 size={15}/> Edge Functions (.zip)</button>
  </div></div>
  <AnimatePresence mode="wait" initial={false}>
   {tab==='database'
     ? <motion.div key="database" initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-5}} transition={{duration:0.2}}><RestorePage/></motion.div>
     : <motion.div key="functions" initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-5}} transition={{duration:0.2}}><FunctionsPage/></motion.div>}
  </AnimatePresence>
 </div>;
}
