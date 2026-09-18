/**
 * RoomToolbar —— 主视角左侧的悬浮功能栏
 *
 * 两个按钮，点开各自展开一个面板（同时只展开一个，再点收回、Esc 也收回）：
 *   - 四季：春/夏/秋/冬（原左上角胶囊按钮搬到这里）。选中会换窗外贴图 + 联动光线明暗，
 *           再点当前季节 = 取消（回到天气天空）。季节状态由父级 MemoryRoom3D 持有。
 *   - 物品：物品栏（原底部物品栏 + 上传按钮搬到这里）——预设建模一键放入、图片变相框物品、
 *           AI 抠图入口，操作提示也收进面板里。
 *
 * 纯 UI 层：不改任何 3D / 摆放逻辑，所有操作都转发给传入的 hp 接口。
 */
import { useEffect, useState } from 'react'
import { SEASON_OPTIONS } from './Room25D'
import { PRESETS } from './ItemPresets'
import type { ItemPlacementApi } from './ItemPlacement'
import type { ScanSessionApi } from '../scan/useScanSession'
import './RoomToolbar.css'

type SeasonId = (typeof SEASON_OPTIONS)[number]['id']
type PaneId = 'season' | 'items'

/* 图标：四季 = 太阳，物品 = 方盒（内联 SVG，避免引外部图标库） */
function IconSun() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="4.4" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4" />
        <path d="M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3L17 7M7 17l-1.7 1.7" />
      </g>
    </svg>
  )
}

function IconBox() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M12 3.2l7.4 3.9v9.8L12 20.8 4.6 16.9V7.1z" />
        <path d="M4.6 7.1L12 11l7.4-3.9M12 11v9.8" />
      </g>
    </svg>
  )
}

/* 扫码：相机机身 + 镜头（内联 SVG，与上面两个图标同一套线条风格） */
function IconCamera() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M3.2 8.6h3l1.4-2.2h7.4l1.4 2.2h3.2v10.2H3.2z" />
        <circle cx="12" cy="13.2" r="3.3" />
      </g>
    </svg>
  )
}

export default function RoomToolbar({
  season,
  onSeasonChange,
  hp,
  scan,
}: {
  season: SeasonId | ''
  onSeasonChange: (s: SeasonId | '') => void
  hp: ItemPlacementApi
  scan: ScanSessionApi
}) {
  const [pane, setPane] = useState<PaneId | ''>('')
  const toggle = (id: PaneId) => setPane((cur) => (cur === id ? '' : id))

  /* Esc 收回面板（照片墙/回忆卡片的 Esc 各自独立，互不影响） */
  useEffect(() => {
    if (!pane) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPane('')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pane])

  return (
    <div className="rt-root">
      <div className="rt-bar">
        <button
          type="button"
          className={`rt-btn${pane === 'season' ? ' rt-btn-on' : ''}${season ? ' rt-btn-lit' : ''}`}
          title="四季"
          aria-expanded={pane === 'season'}
          onClick={() => toggle('season')}
        >
          <IconSun />
          <span className="rt-btn-t">四季</span>
        </button>
        <button
          type="button"
          className={`rt-btn${pane === 'items' ? ' rt-btn-on' : ''}`}
          title="物品栏"
          aria-expanded={pane === 'items'}
          onClick={() => toggle('items')}
        >
          <IconBox />
          <span className="rt-btn-t">物品</span>
        </button>
      </div>

      {/* ---------- 四季面板 ---------- */}
      {pane === 'season' && (
        <section className="rt-pane rt-pane-season">
          <header className="rt-head">
            <span className="rt-title">四季</span>
            <button className="rt-x" onClick={() => setPane('')} aria-label="收起">
              ✕
            </button>
          </header>
          <div className="rt-seasons">
            {SEASON_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`rt-season${season === s.id ? ' rt-season-on' : ''}`}
                title={`${s.label}季（再点一次取消）`}
                onClick={() => onSeasonChange(season === s.id ? '' : s.id)}
              >
                <i className="rt-swatch" style={{ background: s.light }} />
                {s.label}
              </button>
            ))}
          </div>
          <p className="rt-tip">选中会替换窗外景色并联动光线明暗；再点一次取消，回到天气天空。</p>
        </section>
      )}

      {/* ---------- 物品栏面板 ---------- */}
      {pane === 'items' && (
        <section className="rt-pane rt-pane-items">
          <header className="rt-head">
            <span className="rt-title">物品栏</span>
            <button className="rt-x" onClick={() => setPane('')} aria-label="收起">
              ✕
            </button>
          </header>

          <div className="rt-actions">
            <label className="rt-chip rt-chip-strong">
              ＋ 添加图片
              <input type="file" accept="image/*" hidden onChange={hp.onAddImageFile} />
            </label>
            <label className="rt-chip rt-chip-strong">
              ＋ 放一件物品
              <input type="file" accept="image/*" hidden onChange={hp.onFiles} />
            </label>
          </div>

          {/* 跨设备扫描：手机扫码拍真实物品 → 云端 → 直接落到房间里当贴片 */}
          <button
            type="button"
            className={`rt-scan${scan.received > 0 ? ' rt-scan-on' : ''}`}
            title="用手机扫描真实物品，自动出现在房间里"
            onClick={scan.start}
          >
            <IconCamera />
            <span>扫码添加物品</span>
            {scan.received > 0 && <i className="rt-scan-badge">{scan.received}</i>}
          </button>
          {scan.status && <p className="rt-sync">{scan.status}</p>}
          {scan.error && <p className="rt-sync rt-sync-err">{scan.error}</p>}

          <div className="rt-presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="rt-preset"
                title={`放入${p.label}`}
                onClick={() => hp.spawnItem(p.id)}
              >
                <span className="rt-preset-ico">{p.icon}</span>
                <span className="rt-preset-t">{p.label}</span>
              </button>
            ))}
          </div>

          <p className="rt-tip">
            拖动物品/贴图随意移动 · 按住 Shift 拖动可前后调整远近 · 按住左键滚动滚轮缩放（Shift+滚轮旋转贴图）
            · 书本拖进书柜会自动竖着上架 · 贴图靠近左右墙会自动吸附 · 点击打开回忆
          </p>
        </section>
      )}
    </div>
  )
}
