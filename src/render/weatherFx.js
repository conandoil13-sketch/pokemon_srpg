// 날씨 덮개 (화면 좌표, 유닛 위·UI 아래). 코드로 그리는 가벼운 입자 — pixelfx 날씨는 바닥까지 그린 장면이라 대신 씀
import { W, H } from './screen.js';
import { hash } from './pixels.js';

const N = 48; // 입자 수

// 그렸으면 true. weather 가 없으면 아무것도 안 함
export function drawWeather(ctx, weather, time) {
  if (!weather || !ctx) return false;
  ctx.save();
  if (weather === 'rain') {
    ctx.fillStyle = 'rgba(40,60,120,0.12)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(200,220,255,0.7)';
    for (let i = 0; i < N; i++) { // 빗줄기: 오른쪽 아래로 빠르게
      const x = ((hash(i, 'rx') * (W + 40) + time * 120) % (W + 40)) - 20, y = (hash(i, 'ry') * H + time * 260) % (H + 10) - 10;
      for (let k = 0; k < 5; k++) ctx.fillRect(Math.round(x + k), Math.round(y + k * 2), 1, 2);
    }
  } else if (weather === 'sun') {
    ctx.fillStyle = 'rgba(255,200,90,0.12)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,240,180,0.10)';
    for (let i = 0; i < 4; i++) { // 비스듬한 햇살 띠, 천천히 흔들림
      const x = 30 + i * 60 + Math.sin(time * 0.6 + i) * 6;
      for (let y = 0; y < H; y += 2) ctx.fillRect(Math.round(x - y * 0.35), y, 14, 2);
    }
  } else if (weather === 'sand') {
    ctx.fillStyle = 'rgba(190,150,90,0.22)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(240,210,160,0.95)';
    for (let i = 0; i < N * 2; i++) { // 모래 입자: 옆으로 빠르게
      const x = (hash(i, 'sx') * W + time * 150) % W, y = (hash(i, 'sy') * H + Math.sin(time * 3 + i) * 3 + H) % H;
      ctx.fillRect(Math.round(x), Math.round(y), 3, 1);
    }
  } else if (weather === 'hail') {
    ctx.fillStyle = 'rgba(200,220,240,0.10)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(245,250,255,0.9)';
    for (let i = 0; i < N * 1.5; i++) { // 우박: 아래로 떨어지는 흰 알갱이 (아래에 푸른 그림자 1px)
      const x = (hash(i, 'hx') * W + Math.sin(time * 2 + i) * 4 + W) % W, y = (hash(i, 'hy') * H + time * 140) % (H + 6) - 3;
      ctx.fillStyle = 'rgba(120,150,200,0.8)'; ctx.fillRect(Math.round(x), Math.round(y) + 2, 2, 1);
      ctx.fillStyle = 'rgba(250,252,255,1)'; ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
  } else if (weather === 'fog') {
    for (let b = 0; b < 5; b++) { // 안개 띠: 천천히 흐름
      const y = (b * 44 + time * 6) % (H + 40) - 20;
      ctx.fillStyle = `rgba(220,225,230,${0.10 + 0.04 * (b % 2)})`;
      ctx.fillRect(0, Math.round(y), W, 28);
    }
    ctx.fillStyle = 'rgba(210,215,220,0.12)'; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  return true;
}

// ---- 날씨 부르기 "펑": 쓴 포켓몬에서 고리가 화면 끝까지 퍼지고 화면 전체가 날씨 색으로 번쩍 ----
export const WEATHER_BURST = { rain: '#4890f0', sun: '#f8c040', sand: '#c8a060', hail: '#c8e8ff' };
export const BURST_TIME = 0.5;
const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a.toFixed(3)})`;
// 고리 (좌표계는 호출 측: 전투는 월드, 미리보기는 화면). k: 0→1
export function drawBurstRing(ctx, weather, k, x, y) {
  const c = WEATHER_BURST[weather];
  if (!c || !ctx || k < 0 || k >= 1) return;
  const r = 8 + (1 - (1 - k) ** 3) * 360, a = 1 - k;
  ctx.save();
  ctx.strokeStyle = rgba(c, 0.9 * a); ctx.lineWidth = 6;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.7 * a); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y, r - 3, (r - 3) * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
// 화면 전체 번쩍 (화면 좌표)
export function drawBurstFlash(ctx, weather, k, w = W, h = H) {
  const c = WEATHER_BURST[weather];
  if (!c || !ctx || k < 0 || k >= 1) return;
  ctx.save(); ctx.fillStyle = rgba(c, 0.55 * (1 - k) ** 1.5); ctx.fillRect(0, 0, w, h); ctx.restore();
}
// 둘 다 (좌표계가 같을 때: 미리보기)
export function drawWeatherBurst(ctx, weather, k, x, y, w = W, h = H) { drawBurstFlash(ctx, weather, k, w, h); drawBurstRing(ctx, weather, k, x, y); }
