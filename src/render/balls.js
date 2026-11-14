// 몬스터볼·슈퍼볼·하이퍼볼 도트 (코드로 그림)
const STYLE = {
  poke: { top: '#e83838', shade: '#a82020', light: '#f88878' },
  great: { top: '#3878e8', shade: '#2050a8', light: '#88b0f8', band: '#e83838' },
  ultra: { top: '#303038', shade: '#18181c', light: '#686878', band: '#f8d030' },
};
export const BALL_KINDS = ['poke', 'great', 'ultra'];
export const nextBall = (kind) => BALL_KINDS[Math.min(BALL_KINDS.length - 1, BALL_KINDS.indexOf(kind) + 1)];

// open: 0..1 위 뚜껑이 벌어지는 정도
export function drawBall(ctx, kind, cx, cy, { r = 14, dx = 0, open = 0 } = {}) {
  const s = STYLE[kind] ?? STYLE.poke;
  const x0 = Math.round(cx + dx), y0 = Math.round(cy);
  const lift = Math.round(open * r * 0.9);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x0 - Math.round(r * 0.8), y0 + r + 1, Math.round(r * 1.6), 2); // 그림자
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(r * r - y * y));
    if (w <= 0) continue;
    const top = y < -1, yy = y0 + y - (top ? lift : 0);
    if (top) {
      ctx.fillStyle = s.top;
      ctx.fillRect(x0 - w, yy, w * 2, 1);
      ctx.fillStyle = s.shade;
      ctx.fillRect(x0 + w - Math.max(1, Math.round(w / 3)), yy, Math.max(1, Math.round(w / 3)), 1); // 오른쪽 그늘
      if (s.band) { // 슈퍼볼 빨간 띠 두 개 / 하이퍼볼 노란 H 무늬
        const fy = (y + r) / r; // 0(꼭대기)..1(가운데)
        if (kind === 'great' && fy > 0.35 && fy < 0.75) {
          ctx.fillStyle = s.band;
          ctx.fillRect(x0 - w, yy, Math.max(1, Math.round(w * 0.45)), 1);
          ctx.fillRect(x0 + w - Math.max(1, Math.round(w * 0.45)), yy, Math.max(1, Math.round(w * 0.45)), 1);
        }
        if (kind === 'ultra' && fy > 0.2) {
          ctx.fillStyle = s.band;
          const bw = Math.max(1, Math.round(r * 0.22));
          ctx.fillRect(x0 - Math.round(r * 0.55), yy, bw, 1);
          ctx.fillRect(x0 + Math.round(r * 0.55) - bw, yy, bw, 1);
        }
      }
    } else {
      ctx.fillStyle = y > 1 ? '#f0f0f0' : '#202020';
      ctx.fillRect(x0 - w, yy, w * 2, 1);
      if (y > 1) { ctx.fillStyle = '#c8c8c8'; ctx.fillRect(x0 + w - Math.max(1, Math.round(w / 3)), yy, Math.max(1, Math.round(w / 3)), 1); }
    }
  }
  // 하이라이트
  ctx.fillStyle = s.light;
  ctx.fillRect(x0 - Math.round(r * 0.55), y0 - Math.round(r * 0.6) - lift, Math.max(2, Math.round(r * 0.25)), Math.max(2, Math.round(r * 0.18)));
  // 가운데 버튼
  if (open < 0.2) {
    const b = Math.max(3, Math.round(r * 0.3));
    ctx.fillStyle = '#202020'; ctx.fillRect(x0 - b, y0 - b, b * 2, b * 2);
    ctx.fillStyle = '#f8f8f8'; ctx.fillRect(x0 - b + 2, y0 - b + 2, b * 2 - 4, b * 2 - 4);
  } else { // 열림: 안에서 빛
    ctx.fillStyle = `rgba(255,255,220,${Math.min(1, open)})`;
    ctx.fillRect(x0 - Math.round(r * 0.7), y0 - 2 - lift, Math.round(r * 1.4), lift + 2);
  }
}
