import express from 'express';
import cors from 'cors';
import { router } from './routes.js';
import { CONFIG } from './config.js';
import { mintToken } from './rt_token.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api', router);


app.get('/healthz', (_req, res) => res.send('ok'));

app.post('/api/rt/token', mintToken);

app.get('/', (_req, res) => {
  res.send('Realtime Copilot API is running. Try /healthz or POST /api/v1/transcribe');
});


app.listen(CONFIG.port, () => {
console.log(`[server] listening on http://localhost:${CONFIG.port}`);
});