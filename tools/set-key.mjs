#!/usr/bin/env node
/**
 * 免编辑器写 Key —— 不想开记事本时用这个。
 *
 * 用法：
 *   cd xiaojiaoluo
 *   node tools/set-key.mjs             # 写语音 Key（VOLC_API_KEY）
 *   node tools/set-key.mjs --ark       # 写方舟 Key（ARK_API_KEY）
 *   node tools/set-key.mjs --endpoint  # 写推理接入点 ID（ARK_ENDPOINT_ID）
 *   node tools/set-key.mjs --check     # 只看当前填了什么（脱敏）
 *
 * 为什么有这个脚本：预览面板是只读的，记事本容易存成 .env.txt。
 * 直接在终端里粘贴最省事 —— 粘贴发生在你的本机终端里，不会进入任何聊天记录。
 * 脚本会自动 trim 掉首尾空格和多余引号这两种最常见的复制失误。
 */

import fs from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.resolve(__dirname, '../apps/server/.env')

const out = (s) => process.stdout.write(s + '\n')

function mask(v) {
  if (!v || v === '=') return '(未填写)'
  const raw = v.replace(/^=+/, '')
  if (raw.length <= 8) return '*'.repeat(raw.length)
  return `${raw.slice(0, 4)}****${raw.slice(-4)}  (长度 ${raw.length})`
}

function readCurrent(name) {
  if (!fs.existsSync(ENV_PATH)) return null
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)
  return lines.find((l) => l.trim().startsWith(name))
}

function writeKeyValue(name, value) {
  let raw = fs.readFileSync(ENV_PATH, 'utf8')
  const lines = raw.split(/\r?\n/)
  const idx = lines.findIndex((l) => l.trim().startsWith(name))
  const next = `${name}=${value}`
  if (idx >= 0) lines[idx] = next
  else lines.push('', next)
  fs.writeFileSync(ENV_PATH, lines.join('\n'), 'utf8')
}

// ---------------------------------------------------------------- --check
if (process.argv.includes('--check')) {
  out('')
  if (!fs.existsSync(ENV_PATH)) {
    out('没有找到 .env，或里面还没有相关行。')
    out('')
    process.exit(0)
  }
  for (const name of ['VOLC_API_KEY', 'ARK_API_KEY', 'ARK_ENDPOINT_ID']) {
    const line = readCurrent(name)
    const value = line ? line.slice(line.indexOf('=') + 1).trim() : ''
    if (!value) {
      out(`${name}：(未填写)`)
      continue
    }
    out(`${name}：${mask(value)}`)
    if (name !== 'ARK_ENDPOINT_ID') {
      out(`   首尾空格：${/^\s|\s$/.test(value) ? '发现空格，建议重跑一次' : '正常'}`)
      out(`   形态：${/^\d+$/.test(value) ? '纯数字，疑似抄成了 App ID' : '非纯数字，正常'}`)
    } else {
      out(`   形态：${/^ep-/.test(value) ? 'ep- 开头，正确' : '应当以 ep- 开头（推理接入点 ID），请检查'}`)
    }
  }
  out('')
  process.exit(0)
}

// ---------------------------------------------------------------- 交互写入
if (!fs.existsSync(ENV_PATH)) {
  out('')
  out(`没找到 ${ENV_PATH}`)
  out('请先执行：cp apps/server/.env.example apps/server/.env')
  out('')
  process.exit(1)
}

const key = process.argv.includes('--ark') ? 'ARK_API_KEY'
  : process.argv.includes('--endpoint') ? 'ARK_ENDPOINT_ID'
  : 'VOLC_API_KEY'

const label = {
  VOLC_API_KEY: ['=== 写入语音 Key ===', '把豆包语音「API 管理」里那串 Key 粘贴到下面，然后按回车。'],
  ARK_API_KEY: ['=== 写入方舟 Key ===', '把火山方舟「API Key 管理」里那串 Key 粘贴到下面，然后按回车。'],
  ARK_ENDPOINT_ID: ['=== 写入推理接入点 ID ===', '把接入点页面左上角那串 ep- 开头的 ID 粘贴到下面，然后按回车。'],
}[key]

const current = readCurrent(key)
out('')
out(label[0])
if (current) {
  const v = current.slice(current.indexOf('=') + 1).trim()
  out(`当前值：${v ? mask(v) : '(未填写)'}`)
}
out('')
out(label[1])
out('（粘贴只发生在你自己的终端里，不会被上传或记录）')
out('')

const rl = createInterface({ input: process.stdin, output: process.stdout })
rl.question('> ', (answer) => {
  rl.close()
  let value = answer.trim()
  value = value.replace(/^["']+|["']+$/g, '').trim()
  value = value.replace(/^Bearer\s+/i, '')

  if (!value) {
    out('')
    out('粘进来的是空的。可能没复制成功，回控制台再点一次复制按钮。')
    out('')
    process.exit(1)
  }

  writeKeyValue(key, value)

  out('')
  out(`已写入 ${path.relative(process.cwd(), ENV_PATH)}`)
  out(`落盘值：${mask(value)}`)

  if (key === 'ARK_ENDPOINT_ID' && !/^ep-/.test(value)) {
    out('')
    out('注意：接入点 ID 应该以 ep- 开头（形如 ep-20260101120000-abcde）。')
    out('你贴的这串不以 ep- 开头，多半是复制成了接入点名称或模型名。')
  }
  if (key !== 'ARK_ENDPOINT_ID' && /^\d+$/.test(value)) {
    out('')
    out('注意：这是一串纯数字。纯数字通常是 App ID（旧版），不是新版 X-Api-Key。')
    out('建议先跑一次 node tools/verify-volc.mjs，返回报错就说明抄错位置了。')
  }
  if (key === 'ARK_API_KEY') {
    out('')
    out('还差「推理接入点 ID」：方舟控制台 -> 在线推理 -> 创建推理接入点，')
    out('拿到 ep- 开头那串后运行：node tools/set-key.mjs --endpoint')
  }
  out('')
  out('下一步：node tools/verify-volc.mjs')
  out('')
})
