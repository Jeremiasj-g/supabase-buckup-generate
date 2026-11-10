import express from 'express';
import routes from './routes/backups.js';
import restoreRoutes from './routes/restore.js';
import {cleanup} from './services/backup.js';
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'16kb'}));
app.use((req,res,next)=>{const o=req.get('Origin');if(o&&!['http://127.0.0.1:5173','http://localhost:5173'].includes(o)){res.status(403).json({error:'Origen no permitido'});return}next()});
app.use('/api',routes);
app.use('/api',restoreRoutes);
app.listen(4174,'127.0.0.1',()=>{console.log('API en http://127.0.0.1:4174');void cleanup().catch(console.error)});
