#!/usr/bin/env node
/**
 * 方舟模型探测 —— 在控制台找不到「推理接入点」时用这个。
 *
 * 用法：
 *   node tools/pick-ark-model.mjs          # 列出可用模型，并逐个试调
 *   node tools/pick-ark-model.mjs --save   # 探测成功后自动写入 ARK_ENDPOINT_ID
 *
 * 它做两件事：
 *   1. 用你的 Key 列出这个账号下所有已开通的模型
 *   2. 逐个试着真调一次（极小 token），找出能直接用的那个
 *
 * 为什么需要它：官方推荐用「推理接入点」ep- 开头的 ID 作为 model，
 * 但很多账号其实可以直接用模型名调用。这个脚本替你验证到底行不行，
 * 不用在控制台里肉眼找那个可能根本不存在的 ID。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.resolve(__dirname, '../apps/server/.env')

const out = (s) => process.stdout.write(s + '\n')

function loadEnv() {
  const env = {}
  if (!fs.existsSync(ENV_PATH)) return env
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

function save(key, value) {
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)
  const idx = lines.findIndex((l) => l.trim().startsWith(key))
  if (idx >= 0) lines[idx] = `${key}=${value}`
  else lines.push('', `${key}=${value}`)
  fs.writeFileSync(ENV_PATH, lines.join('\n'), 'utf8')
}

const env = loadEnv()
const apiKey = env.ARK_API_KEY
const base = (env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')

out('')
out('=== 方舟可用模型探测 ===')
out('')

if (!apiKey) {
  out('还没填方舟 Key。先执行：node tools/set-key.mjs --ark')
  out('')
  process.exit(1)
}

// 先看看手动填的 ep- 能不能用
if (env.ARK_ENDPOINT_ID) {
  out(`检测到已填接入点：${env.ARK_ENDPOINT_ID}`)
} else {
  out('未填 ARK_ENDPOINT_ID，进入自动探测。')
}
out('')

// ---------------------------------------------------------------- 1. 列模型
let models = []
try {
  const res = await fetch(`${base}/models?limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (res.status === 401) {
    out('[FAIL] Key 无效（401）。确认是火山方舟控制台创建的 Key，不是语音 Key 或 AK/SK。')
    process.exit(1)
  }
  if (!res.ok) {
    out(`[FAIL] 列模型失败 HTTP ${res.status}：${(await res.text()).slice(0, 200)}`)
    process.exit(1)
  }
  models = (await res.json()).data ?? []
  out(`账号下可用模型 ${models.length} 个`)
} catch (e) {
  out(`[FAIL] 网络失败：${e.message}`)
  process.exit(1)
}

// 只保留文本对话类，排掉视觉/向量/画图/视频/语音
const skip = /(vision|embedding|seedream|seedance|tts|asr|doubao-embedding|multimodal)/i
const candidates = models
  .filter((m) => !skip.test(m.id))
  .sort((a, b) => (a.created > b.created ? 1 : -1))
  .slice(0, 8)

if (candidates.length === 0) {
  out('')
  out('没有找到文本对话类模型。去方舟控制台「模型广场」先开通一个 doubao 文本模型。')
  out('')
  process.exit(1)
}

out('')
out('候选（已按发布时间排序，最多试 8 个）：')
for (const m of candidates) out(`  - ${m.id}`)
out('')

// ---------------------------------------------------------------- 2. 逐个试调
const tried = []
for (const m of candidates) {
  let ok = false
  let note = ''
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: m.id,
        messages: [{ role: 'user', content: '回复两个字：可用' }],
        max_tokens: 8,
      }),
    })
    const text = await res.text()
    if (res.ok) {
      ok = true
      note = text.includes('choices') ? '调用成功' : '返回异常但状态码 200'
    } else {
      note = text.slice(0, 120)
    }
  } catch (e) {
    note = e.message
  }
  tried.push({ id: m.id, ok, note })
  out(`  ${ok ? '[OK]  ' : '       '} ${m.id}${ok ? '' : `  <- ${note.slice(0, 90)}`}`)
  if (ok) break
}

const hit = tried.find((t) => t.ok)

out('')
if (!hit) {
  out('没有能直接调用的模型。多半是「举报朴 THIS 模型」——')
  out('莫慌：方舟对未开通的模型会拒绝。请到控制台确认已开通至少一个 doubao 文本模型。')
  out('如果控制台里始终看不到推理接入点入口，建议直接提工单问火山客服。')
  out('')
  process.exit(1)
}

out(`可用 model 值：${hit.id}`)
out('')

const shouldSave = process.argv.includes('--save')
if (shouldSave || !env.ARK_ENDPOINT_ID) {
  save('ARK_ENDPOINT_ID', hit.id)
  out(`已写入 apps/server/.env 的 ARK_ENDPOINT_ID = ${hit.id}`)
  out('（它不是以 ep- 开头，但只要上面显示「调用成功」，代码里就能直接用）')
} else {
  out('手动写入请运行：node tools/pick-ark-model.mjs --save')
}
out('')
out('下一步：node tools/verify-volc.mjs')
out('')
