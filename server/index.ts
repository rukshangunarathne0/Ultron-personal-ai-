import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { rukAiApiMiddleware } from './apiMiddleware';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const DIST_DIR = path.resolve(process.cwd(), 'dist');

app.use(cors());
app.use((req, res, next) => rukAiApiMiddleware(req, res, next));
app.use(express.static(DIST_DIR));

app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[RUK-AI] Unified Production Server listening on http://0.0.0.0:${PORT}`);
});
