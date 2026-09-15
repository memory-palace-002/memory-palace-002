#!/usr/bin/env node
/**
 * SDK 端到端实跑脚本 —— 证明"小角落"的 AI 聆听者链路真的能通。
 *
 * 它做一件完整的事：
 *   1. 取一段公开测试音频，提交给豆包语音（录音文件识别 2.0）做转写
 *   2. 轮询拿到中文转写文本
 *   3. 把转写文本交给火山方舟（豆包大模型，ep- 接入点）压成一段
 *      用户本人视角的"记录"：80~250 字、第一人称「我」（说话者本人）、
 *      中文、保留人名地点细节、不提问不回应、结尾无套话。
 *
 * 用法：
 *   node tools/run-sdk-e2e.mjs                  # 默认读 D:\A黑客松\录音1（自动补 .m4a 等后缀），找不到才用公开测试音频
 *   node tools/run-sdk-e2e.mjs "D:\A黑客松\录音1.m4a"   # 指定本地音频（支持 m4a/mp3/wav/mp4…）
 *   node tools/run-sdk-e2e.mjs https://xxx.mp3   # 指定远程音频 URL
 *
 * 模拟"用户校订转写"环节（与前端 B2.5 一致）：
 *   node tools/run-sdk-e2e.mjs "D:\A黑客松\录音1.m4a" --edit "把听错的地方改好的转写稿"
 *   —— 给 --edit 后，会用你校订后的文本去生成简介，而非直接用识别原文。
 * 依赖：apps/server/.env 里三样都填好（语音 Key / 方舟 Key / 推理接入点）
 *
 * 安全：不回显任何密钥原文，只打印脱敏状态与转写/简介内容。
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_CANDIDATES = [
  path.resolve(__dirname, '../apps/server/.env'),
  path.resolve(__dirname, '../.env'),
]

function loadEnv(file) {
  const env = {}
  if (!fs.existsSync(file)) return null
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const out = (s) => process.stdout.write(s + '\n')
const mask = (v) => (v && v.length > 8 ? `${v.slice(0, 4)}****${v.slice(-4)}` : '(空)')

// 从 shared 单一真源读取简介口径，确保测试与上线用同一份 prompt（不各自硬编码）
function loadBlurbPrompt() {
  try {
    const f = path.resolve(__dirname, '../packages/shared/src/blurbPrompt.ts')
    const src = fs.readFileSync(f, 'utf8')
    const m = src.match(/export const BLURB_SYSTEM_PROMPT = `([\s\S]*?)`/)
    if (m) return m[1]
  } catch (_) {
    /* 兜底见下 */
  }
  out('⚠ 未能从 shared 读取 BLURB_SYSTEM_PROMPT，使用内联兜底（应与 packages/shared/src/blurbPrompt.ts 保持一致）')
  return `你是"小角落" App 的 AI 聆听者。用户口述了一段关于某件物品的讲述，请你把它整理成一段该用户亲手贴在物品上的"记录"。
要求：
- 以用户本人的口吻，用第一人称「我」来记录（是用户自己在讲述这段经历，不是物品在替自己说话）；
- 中文，80~250 字；
- 保留讲述中的人名、地点、具体细节，不要泛泛而谈；
- 只做整理，不提问、不回应、不评价；
- 结尾不要加"让我们一起…"之类的套话或号召性语句。
下面给用户讲述的原文：`
}

// ---------------------------------------------------------------- 加载
let env = null
for (const c of ENV_CANDIDATES) { env = env || loadEnv(c) }
if (!env) { out('找不到 .env，先填好凭据再跑。'); process.exit(1) }
out('')
out('=== 小角落 · SDK 端到端实跑 ===')
out('')
out(`语音 Key : ${mask(env.VOLC_API_KEY)}`)
out(`方舟 Key : ${mask(env.ARK_API_KEY)}`)
out(`接入点   : ${mask(env.ARK_ENDPOINT_ID)}`)
out('')

// ---------------------------------------------------------------- 0. 音频来源解析
const resourceId = env.VOLC_ASR_RESOURCE_ID || 'volc.seedasr.auc'
const submitUrl = env.VOLC_ASR_SUBMIT_URL || 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit'
const queryUrl = env.VOLC_ASR_QUERY_URL || 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query'
const DEMO_URL = 'https://pro-en-ali-pub.en5static.com/easinote5_public/uwixkwvzhhqjjhnohwvyzzwnykhhihhh.mp3'
const LOCAL_DEFAULT = 'D:\\A黑客松\\录音1' // 用户录音所在（实际文件为 录音1.m4a）

function resolveInput(arg) {
  if (!arg) {
    for (const ext of ['.m4a', '.mp3', '.wav', '.mp4', '.aac', '.ogg', '.flac']) {
      const c = LOCAL_DEFAULT + ext
      if (fs.existsSync(c)) return resolveInput(c)
    }
    return { kind: 'url', url: DEMO_URL, format: 'mp3', label: '公开测试音频' }
  }
  if (/^https?:\/\//i.test(arg)) return { kind: 'url', url: arg, format: 'mp3', label: arg }
  let p = arg
  if (!path.extname(p)) {
    for (const ext of ['.m4a', '.mp3', '.wav', '.mp4', '.aac', '.ogg', '.flac']) {
      if (fs.existsSync(p + ext)) { p = p + ext; break }
    }
  }
  if (!fs.existsSync(p)) throw new Error(`找不到音频文件：${arg}`)
  const format = (path.extname(p).slice(1) || 'm4a').toLowerCase()
  return { kind: 'file', path: p, format, label: p }
}

const input = resolveInput(process.argv[2])
out(`音频来源 ：${input.label}（${input.kind === 'url' ? '远程 URL' : '本地文件 · ' + input.format}）`)

// ---- 解析 --edit（用户校订转写）。支持 `--edit "..."` 或 `--edit=...` ----
let editedInput = null
{
  const ei = process.argv.indexOf('--edit')
  if (ei !== -1 && process.argv[ei + 1]) editedInput = process.argv[ei + 1]
  else {
    const eq = process.argv.find((a) => a.startsWith('--edit='))
    if (eq) editedInput = eq.slice('--edit='.length)
  }
}
out('')

// ---------------------------------------------------------------- 1. 语音转写
async function transcribe() {
  out('① 语音识别（豆包语音 · 录音文件识别 2.0）')
  const rid = crypto.randomUUID()
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Key': env.VOLC_API_KEY,
    'X-Api-Resource-Id': resourceId,
    'X-Api-Request-Id': rid,
    'X-Api-Sequence': '-1',
  }
  // 本地文件：读入后 base64 进 audio.data；远程：直接给 audio.url。m4a 等格式均被接口识别。
  const audioPayload =
    input.kind === 'url'
      ? { url: input.url, format: input.format }
      : { data: fs.readFileSync(input.path).toString('base64'), format: input.format }
  const sub = await fetch(submitUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ user: { uid: 'e2e-run' }, audio: audioPayload, request: { model_name: 'bigmodel' } }),
  })
  const status = sub.headers.get('X-Api-Status-Code')
  if (status !== '20000000') {
    const body = await sub.text()
    throw new Error(`提交失败（Status-Code ${status}）：${body.slice(0, 160)}`)
  }
  out('   提交成功，轮询结果中…')
  for (let i = 1; i <= 15; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const q = await fetch(queryUrl, { method: 'POST', headers, body: '{}' })
    const code = q.headers.get('X-Api-Status-Code')
    const parsed = await q.json().catch(() => null)
    const text = parsed?.result?.text
    if (text) { out(`   转写完成：「${text}」`); return text }
    if (code === '20000001') continue
    throw new Error(`查询异常（Status-Code ${code}）`)
  }
  throw new Error('轮询超时，任务一直处理中')
}

// ---------------------------------------------------------------- 2. 方舟总结
const SUMMARY_PROMPT = loadBlurbPrompt()

async function summarize(transcript) {
  out('')
  out('② 智能总结（火山方舟 · 豆包大模型，ep- 接入点）')
  const base = (env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
  // 关键：显式关掉流式。该接入点是带「思考过程」的 doubao 模型，默认 SSE 流会让
  // res.json() 一直等不到完整 JSON 而挂死。stream:false 才返回普通 JSON 体。
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 150000)
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal: ac.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ARK_API_KEY}` },
    body: JSON.stringify({
      model: env.ARK_ENDPOINT_ID,
      stream: false,
      // 关键：该接入点是思考型 doubao，不关思考会慢到 70+ 秒。关掉后降到 3 秒级。
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: SUMMARY_PROMPT },
        { role: 'user', content: transcript },
      ],
      max_tokens: 600,
      temperature: 0.7,
    }),
  })
  clearTimeout(timer)
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`方舟调用失败（HTTP ${res.status}）：${JSON.stringify(data).slice(0, 200)}`)
  }
  const summary = data?.choices?.[0]?.message?.content?.trim()
  if (!summary) throw new Error('方舟返回为空，结构异常：' + JSON.stringify(data).slice(0, 200))
  return summary
}

// ---------------------------------------------------------------- 执行
try {
  const transcript = await transcribe()

  // ② 用户校订环节（与前端 B2.5 一致）：识别完先给用户改偏差的机会
  let finalTranscript = transcript
  if (editedInput && editedInput.trim()) {
    finalTranscript = editedInput.trim()
    out('')
    out('✎ 已应用用户手动校订的转写（--edit），将用校订后的文本生成简介：')
    out(`   ${finalTranscript}`)
  } else {
    out('')
    out('（未提供 --edit，直接用识别原文生成简介；前端此时会展示可编辑转写稿让用户纠错）')
  }

  const summary = await summarize(finalTranscript)
  const len = [...summary].length
  out('')
  out('=== 跑通结果 ===')
  out(`原始转写：${transcript}`)
  if (finalTranscript !== transcript) out(`校订后  ：${finalTranscript}`)
  out(`生成简介：${summary}`)
  out(`简介字数：${len} 字（规格要求 80~250）`)
  out(len >= 80 && len <= 250 ? '字数符合规格 ✓' : '⚠ 字数超出规格区间，可在服务端加重压一次的逻辑')
  out('')
  out('SDK 链路跑通：音频 → 语音识别 → 用户校订转写 → 方舟总结 全绿。')
  process.exit(0)
} catch (e) {
  out('')
  out('✗ 跑通失败：' + e.message)
  out('先跑 node tools/verify-volc.mjs 看是账号问题还是这次的调用写法问题。')
  process.exit(1)
}
