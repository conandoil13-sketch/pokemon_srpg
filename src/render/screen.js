// 256×192 내부 캔버스 + 정수 배율 확대
export const W = 256;
export const H = 192;

export function createScreen(canvas) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let scale = 2;
  const fit = () => {
    scale = Math.max(2, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
  };
  addEventListener('resize', fit);
  fit();
  return { ctx, getScale: () => scale };
}
