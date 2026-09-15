/**
 * 板块⑤ AI 聆听者 · 简介（blurb）总结口径 —— 全 SDK 唯一真源
 *
 * 为什么放这里：简介由「服务端 B2 接收转写后调用方舟生成」，同时前端 mock 模式
 * （mockAdapter）与端到端测试脚本（tools/run-sdk-e2e.mjs）也要产出同一口径的内容。
 * 三处都必须引用本文件，禁止各自硬编码，避免「测试跑通、上线口径却不一样」。
 *
 * 口径约束（来自《开发规格说明书 2.0》§5.3 + 用户二次确认）：
 *   - 第一人称「我」= 说话的用户本人，不是物品在替自己说话；
 *   - 中文，80~250 字；
 *   - 保留讲述中的人名、地点、具体细节，不要泛泛而谈；
 *   - 只做整理，不提问、不回应、不评价；
 *   - 结尾不要加「让我们一起…」之类的套话或号召性语句。
 */

/** 系统提示词：把用户口述的转写稿整理成贴在该物品上的「记录」。 */
export const BLURB_SYSTEM_PROMPT = `你是"小角落" App 的 AI 聆听者。用户口述了一段关于某件物品的讲述，请你把它整理成一段该用户亲手贴在物品上的"记录"。

要求：
- 以用户本人的口吻，用第一人称「我」来记录（是用户自己在讲述这段经历，不是物品在替自己说话）；
- 中文，80~250 字；
- 保留讲述中的人名、地点、具体细节，不要泛泛而谈；
- 只做整理，不提问、不回应、不评价；
- 结尾不要加"让我们一起…"之类的套话或号召性语句。

下面给用户讲述的原文：`

/** 简介字数下限（含）。低于此值视为不合格，服务端应触发「再压一次」或返回 42204。 */
export const BLURB_MIN_LEN = 80
/** 简介字数上限（含）。高于此值视为不合格，服务端应触发「再压一次」或返回 42204。 */
export const BLURB_MAX_LEN = 250

/**
 * 拼接发给大模型的 messages。transcript 为语音识别原始转写文本。
 * 注意：system 必须是固定口径，绝不让前端/用户传入，防止被篡改。
 */
export function buildBlurbMessages(transcript: string) {
  return [
    { role: 'system', content: BLURB_SYSTEM_PROMPT },
    { role: 'user', content: transcript },
  ]
}

/** 按「字符数」统计中文简介长度（与前端展示口径一致）。 */
export function countBlurbChars(text: string): number {
  return [...text.trim()].length
}

/** 是否符合规格要求的 80~250 字区间。 */
export function isBlurbValid(text: string): boolean {
  const n = countBlurbChars(text)
  return n >= BLURB_MIN_LEN && n <= BLURB_MAX_LEN
}
