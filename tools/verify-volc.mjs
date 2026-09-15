#!/usr/bin/env node
/**
 * 凭据体检脚本 —— 拿到控制台钥匙后第一件事就是跑它。
 *
 * 用法：
 *   cp apps/server/.env.example apps/server/.env   # 填入真实值
 *   node tools/verify-volc.mjs
 *
 * 它只做三件事：
 *   1. 检查该有的有没有、不该有的有没有（AK/SK 留空的正确姿势）
 *   2. 拿语音 Key 真打一次官方接口，判断鉴权是否通过
 *   3. 拿方舟 Key 列一次模型，判断是否可用
 *
 * 安全设计：全程只在终端打印脱敏后的状态，绝不回显密钥原文。
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
  const raw = fs.readFileSync(file, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

function mask(v) {
  if (!v) return '(空)'
  if (v.length <= 8) return '*'.repeat(v.length)
  return `${v.slice(0, 4)}****${v.slice(-4)}  (长度 ${v.length})`
}

const out = (s) => process.stdout.write(s + '\n')
let failed = 0
const ok = (m) => out(`  [OK]   ${m}`)
const bad = (m) => { failed++; out(`  [FAIL] ${m}`) }
const warn = (m) => out(`  [WARN] ${m}`)

out('')
out('=== 小角落 · 火山引擎凭据体检 ===')
out('')

// ---------------------------------------------------------------- 1. 加载
let envFile = null
let env = null
for (const c of ENV_CANDIDATES) {
  const e = loadEnv(c)
  if (e) { envFile = c; env = e; break }
}
if (!env) {
  out('没有找到 .env 文件。请先执行：')
  out('  cp apps/server/.env.example apps/server/.env')
  out('然后把你从控制台抄回来的钥匙填进去（不要贴给任何人或任何 AI）。')
  process.exit(1)
}
ok(`已加载 ${path.relative(process.cwd(), envFile)}`)
out('')

// ---------------------------------------------------------------- 2. 静态检查
out('一、字段检查')

const asrNew = env.VOLC_API_KEY
const asrOld = env.VOLC_APP_ID && env.VOLC_ACCESS_TOKEN

if (asrNew) {
  ok(`语音鉴权：新版单头  X-Api-Key = ${mask(asrNew)}`)
  if (env.VOLC_APP_ID || env.VOLC_ACCESS_TOKEN) {
    warn('检测到同时使用旧版字段，会混淆；建议清空 VOLC_APP_ID / VOLC_ACCESS_TOKEN')
  }
} else if (asrOld) {
  warn(`语音鉴权：旧版双头  AppID = ${mask(env.VOLC_APP_ID)}`)
  warn('旧版控制台官方已提示将下线，建议去新版取 API Key 后改成单头')
} else {
  bad('语音鉴权缺失：填 VOLC_API_KEY（新版）或 VOLC_APP_ID + VOLC_ACCESS_TOKEN（旧版）')
}

if (env.ARK_API_KEY) ok(`方舟鉴权：ARK_API_KEY = ${mask(env.ARK_API_KEY)}`)
else bad('缺少 ARK_API_KEY（火山方舟 -> API Key 管理）')

if (env.ARK_ENDPOINT_ID) {
  if (/^ep-/.test(env.ARK_ENDPOINT_ID)) ok(`推理接入点：${mask(env.ARK_ENDPOINT_ID)}`)
  else bad(`ARK_ENDPOINT_ID 必须是 ep- 开头的接入点 ID，不能写 doubao-xxx 模型名`)
} else {
  warn('未填 ARK_ENDPOINT_ID，稍后调 LLM 会失败')
}

if (env.VOLC_AK || env.VOLC_SK) warn('检测到 IAM AK/SK。本项目用不到，建议留空并删除已创建的密钥')
else ok('未使用 IAM AK/SK（安全）')

const gitignore = path.resolve(__dirname, '../.gitignore')
if (fs.existsSync(gitignore) && fs.readFileSync(gitignore, 'utf8').includes('.env')) {
  ok('.gitignore 已忽略 .env')
} else {
  warn('.gitignore 未忽略 .env —— 提交前务必加上')
}
out('')

// ---------------------------------------------------------------- 3. 联网验证
async function checkAsr() {
  out('二、语音侧端到端识别（真实跑一段公开测试音频）')
  const hasCred = Boolean(asrNew || asrOld)
  if (!hasCred) { bad('跳过：无凭据'); out(''); return }

  const rid = crypto.randomUUID()
  const resourceId = env.VOLC_ASR_RESOURCE_ID || 'volc.seedasr.auc'

  const headers = { 'Content-Type': 'application/json' }
  if (asrNew) headers['X-Api-Key'] = env.VOLC_API_KEY
  else {
    headers['X-Api-App-Key'] = env.VOLC_APP_ID
    headers['X-Api-Access-Key'] = env.VOLC_ACCESS_TOKEN
  }
  headers['X-Api-Resource-Id'] = resourceId
  headers['X-Api-Request-Id'] = rid
  headers['X-Api-Sequence'] = '-1'

  const submitUrl = env.VOLC_ASR_SUBMIT_URL || 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit'
  const queryUrl = env.VOLC_ASR_QUERY_URL || 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query'
  const demoAudio = 'https://pro-en-ali-pub.en5static.com/easinote5_public/uwixkwvzhhqjjhnohwvyzzwnykhhihhh.mp3'

  try {
    const sub = await fetch(submitUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user: { uid: 'verify-script' },
        audio: { url: demoAudio, format: 'mp3' },
        request: { model_name: 'bigmodel' },
      }),
    })
    const status = sub.headers.get('X-Api-Status-Code')
    // 注意：本接口提交成功时响应体就是空的 {}，任务状态只放在响应头里
    if (status !== '20000000') {
      bad(`任务提交失败（HTTP ${sub.status}，Status-Code ${status}）`)
      const body = await sub.text()
      out(`        服务端返回：${body.slice(0, 160)}`)
      if (/resource/i.test(body)) warn(`多半是 ${resourceId} 这个模型没在「开通管理」里开通`)
      out('')
      return
    }
    ok('任务提交成功（Status-Code 20000000）')
  } catch (err) {
    bad(`网络请求失败：${err.message}`)
    out('')
    return
  }

  for (let i = 1; i <= 12; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    let q
    try {
      q = await fetch(queryUrl, { method: 'POST', headers, body: '{}' })
    } catch (err) {
      bad(`查询失败：${err.message}`)
      break
    }
    const code = q.headers.get('X-Api-Status-Code')
    const text = await q.text()
    let parsed = null
    try { parsed = JSON.parse(text) } catch { /* 忽略非 JSON */ }
    const result = parsed?.result?.text
    if (result) {
      ok(`识别成功，转写结果：「${result}」`)
      break
    }
    if (code === '20000001') {
      if (i === 12) bad('轮询超时，任务一直处于处理中')
      continue
    }
    bad(`查询异常（Status-Code ${code}）：${text.slice(0, 160)}`)
    break
  }
  out('')
}

async function checkArk() {
  out('三、方舟侧真实调用')
  if (!env.ARK_API_KEY) { bad('跳过：无 ARK_API_KEY'); out(''); return }
  const base = (env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/models?limit=1`, {
      headers: { Authorization: `Bearer ${env.ARK_API_KEY}` },
    })
    const text = await res.text()
    if (res.status === 401) {
      bad('方舟 Key 无效。常见原因：把 AK/SK 或语音 Key 填到了这里 —— 必须是方舟控制台创建的 Key')
    } else if (res.ok) {
      ok(`方舟 Key 可用（HTTP ${res.status}）`)
    } else {
      warn(`HTTP ${res.status}，可能未开通模型或未创建推理接入点：${text.slice(0, 120)}`)
    }
  } catch (e) {
    bad(`网络请求失败：${e.message}`)
  }
  out('')
}

await checkAsr()
await checkArk()

out('=== 体检结束 ===')
if (failed === 0) {
  out('全部通过。现在才可以把 VITE_USE_MOCK 改成 false，开始接真实 adapter。')
} else {
  out(`有 ${failed} 项未通过。别急着改前端代码 —— 先把上面的问题按提示修掉。`)
}
out('')
process.exit(failed === 0 ? 0 : 1)
