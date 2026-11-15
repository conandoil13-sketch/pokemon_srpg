// 256×192 내부 캔버스 + 배율 확대 (2배 이상 들어가면 정수, 아니면 칸에 딱 맞게)
export const W = 256;
export const H = 192;

export function fitScale(availW, availH) {
  const exact = Math.min(availW / W, availH / H);
  return exact >= 2 ? Math.floor(exact) : exact;
}

export function createScreen(canvas) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let scale = 2;
  const fit = () => {
    scale = fitScale(innerWidth, innerHeight);
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
  };
  addEventListener('resize', fit);
  fit();
  return { ctx, getScale: () => scale };
}
