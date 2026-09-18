import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d')! };
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function cached(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** 书脊: 底色 + 两侧压暗 + 竖排标题 */
export function spineTexture(title: string, color: string): THREE.CanvasTexture {
  return cached(`spine:${title}:${color}`, () => {
    const { c, ctx } = makeCanvas(128, 512);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 512);
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(0,0,0,.3)');
    g.addColorStop(0.18, 'rgba(255,255,255,.15)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(0.85, 'rgba(0,0,0,.12)');
    g.addColorStop(1, 'rgba(0,0,0,.32)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 512);
    ctx.fillStyle = 'rgba(255,248,235,.5)';
    ctx.fillRect(20, 40, 88, 3);
    ctx.fillRect(20, 472, 88, 3);
    ctx.fillStyle = 'rgba(255,250,240,.96)';
    ctx.font = '600 46px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const chars = Array.from(title).slice(0, 7);
    const step = Math.min(66, 400 / Math.max(chars.length - 1, 1));
    const y0 = 256 - ((chars.length - 1) * step) / 2;
    chars.forEach((ch, i) => ctx.fillText(ch, 64, y0 + i * step));
    return toTexture(c);
  });
}

/** 封面: 底色 + 双线框 + 圆形徽记 + 标题 */
export function coverTexture(title: string, color: string): THREE.CanvasTexture {
  return cached(`cover:${title}:${color}`, () => {
    const { c, ctx } = makeCanvas(512, 720);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 720);
    ctx.strokeStyle = 'rgba(255,248,235,.75)';
    ctx.lineWidth = 6;
    ctx.strokeRect(30, 30, 452, 660);
    ctx.lineWidth = 2;
    ctx.strokeRect(44, 44, 424, 632);
    ctx.fillStyle = 'rgba(255,248,235,.9)';
    ctx.beginPath();
    ctx.arc(256, 240, 78, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = '700 70px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❋', 256, 244);
    ctx.fillStyle = '#fff8ec';
    ctx.font = '600 76px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillText(Array.from(title).slice(0, 6).join(' '), 256, 430);
    ctx.font = '400 28px Georgia, serif';
    ctx.fillText('M E M O R Y   B O X', 256, 560);
    const v = ctx.createRadialGradient(256, 360, 200, 256, 360, 540);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,.24)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 512, 720);
    return toTexture(c);
  });
}

/** 图注小标签 */
export function labelTexture(text: string): THREE.CanvasTexture {
  return cached(`label:${text}`, () => {
    const { c, ctx } = makeCanvas(512, 96);
    ctx.fillStyle = '#6b573f';
    ctx.font = '400 40px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Array.from(text).slice(0, 12).join(''), 256, 50);
    return toTexture(c);
  });
}

/** 2.5D 物件脚下的椭圆软阴影 */
export function shadowTexture(): THREE.CanvasTexture {
  return cached('shadow', () => {
    const { c, ctx } = makeCanvas(256, 128);
    const g = ctx.createRadialGradient(128, 64, 8, 128, 64, 118);
    g.addColorStop(0, 'rgba(40,26,12,.55)');
    g.addColorStop(0.55, 'rgba(40,26,12,.22)');
    g.addColorStop(1, 'rgba(40,26,12,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(128, 64);
    ctx.scale(1, 0.5);
    ctx.translate(-128, -64);
    ctx.beginPath();
    ctx.arc(128, 64, 118, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return toTexture(c);
  });
}

/** 纸张质感: lined = 横线本, aged = 旧纸 */
export function paperTexture(kind: 'lined' | 'aged'): THREE.CanvasTexture {
  return cached(`paper:${kind}`, () => {
    const { c, ctx } = makeCanvas(512, 720);
    ctx.fillStyle = kind === 'lined' ? '#f8f2e2' : '#efe0c0';
    ctx.fillRect(0, 0, 512, 720);
    if (kind === 'lined') {
      ctx.strokeStyle = 'rgba(122,100,70,.35)';
      ctx.lineWidth = 2;
      for (let y = 96; y < 680; y += 52) {
        ctx.beginPath();
        ctx.moveTo(48, y);
        ctx.lineTo(464, y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(196,90,80,.55)';
      ctx.beginPath();
      ctx.moveTo(76, 40);
      ctx.lineTo(76, 690);
      ctx.stroke();
    } else {
      for (let i = 0; i < 46; i++) {
        ctx.fillStyle = `rgba(120,90,50,${0.04 + ((i * 37) % 10) * 0.012})`;
        ctx.beginPath();
        ctx.arc((i * 97) % 512, (i * 173) % 720, 14 + ((i * 53) % 30), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return toTexture(c);
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const chars = Array.from(text);
  const lines: string[] = [];
  let line = '';
  for (const ch of chars) {
    if (ctx.measureText(line + ch).width > maxW || ch === '\n') {
      lines.push(line);
      line = ch === '\n' ? '' : ch;
      if (lines.length >= maxLines) return lines;
    } else {
      line += ch;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

/** 语音卡片: 底色 + 波形 + 播放键 + 时长 */
export function voiceCardTexture(caption: string, duration: string, color = '#2c2140'): THREE.CanvasTexture {
  return cached(`voice:${caption}:${duration}:${color}`, () => {
    const { c, ctx } = makeCanvas(512, 512);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(16, 16, 480, 480, 40);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,235,.95)';
    ctx.font = '600 44px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Array.from(caption).slice(0, 8).join(''), 256, 96);
    ctx.fillStyle = 'rgba(255,248,235,.7)';
    for (let i = 0; i < 26; i++) {
      const h = 26 + ((i * 97 + caption.length * 31) % 150);
      ctx.beginPath();
      ctx.roundRect(66 + i * 15, 240 - h / 2, 8, h, 4);
      ctx.fill();
    }
    ctx.fillStyle = '#fff8ec';
    ctx.beginPath();
    ctx.arc(140, 400, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(126, 378);
    ctx.lineTo(168, 400);
    ctx.lineTo(126, 422);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,235,.95)';
    ctx.textAlign = 'left';
    ctx.font = '400 40px Georgia, serif';
    ctx.fillText(duration, 210, 402);
    return toTexture(c);
  });
}

/** 文字卡片: 信纸底 + 自动换行正文 */
export function noteCardTexture(text: string): THREE.CanvasTexture {
  return cached(`note:${text}`, () => {
    const { c, ctx } = makeCanvas(512, 512);
    ctx.fillStyle = '#fbf5e6';
    ctx.beginPath();
    ctx.roundRect(16, 16, 480, 480, 40);
    ctx.fill();
    ctx.strokeStyle = 'rgba(122,100,70,.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(16, 16, 480, 480, 40);
    ctx.stroke();
    ctx.fillStyle = 'rgba(180,120,80,.5)';
    ctx.font = '700 90px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('❝', 44, 132);
    ctx.fillStyle = '#5d4a37';
    ctx.font = '400 38px "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'middle';
    const lines = wrapText(ctx, text, 400, 6);
    lines.forEach((ln, i) => ctx.fillText(ln, 76, 210 + i * 56));
    return toTexture(c);
  });
}
