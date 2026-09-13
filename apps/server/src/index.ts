// 小角落 后端服务入口（板块①：地基与账号 / 板块②：角落与成员）
import express from 'express';
import { authRouter } from './auth';
import { palacesRouter } from './palaces';

const app = express();
const PORT = Number(process.env.PORT || 8787);

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ code: 0, message: 'ok', data: { service: 'memory-palace-server', time: new Date().toISOString() } });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/palaces', palacesRouter);

// 统一 404
app.use((_req, res) => {
  res.status(404).json({ code: 40401, message: '接口不存在', data: null });
});

app.listen(PORT, () => {
  console.log(`[memory-palace-server] listening on http://localhost:${PORT}`);
});
