// 256×192 내부 캔버스 + 배율 확대 (2배 이상 들어가면 정수, 아니면 칸에 딱 맞게)
export const W = 256;
export const H = 192;

export function fitScale(availW, availH) {
  const exact = Math.min(availW / W, availH / H);
  return exact >= 2 ? Math.floor(exact) : exact;
}

// box: 화면이 들어갈 칸 (터치 기기에서 버튼 자리를 뺀 곳). 없으면 창 전체. 함수면 맞출 때마다 물어본다
export function createScreen(canvas, boxOf = null) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let scale = 2;
  const fit = () => {
    const box = typeof boxOf === 'function' ? boxOf() : boxOf;
    if (box) { const cs = getComputedStyle(box); scale = fitScale(box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)); }
    else scale = fitScale(innerWidth, innerHeight);
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
  };
  addEventListener('resize', fit);
  addEventListener('orientationchange', () => setTimeout(fit, 100)); // 돌린 뒤 크기가 늦게 바뀌는 폰
  fit();
  return { ctx, getScale: () => scale, refit: fit };
}
