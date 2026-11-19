// 도시 24시간 배경. 같은 자리에서 2시간마다 찍은 사진 12장(city/00.webp … 22.webp)을
// 지금 시각에 맞춰 두 장씩 섞는다. 01:00이면 00시 사진과 02시 사진이 반반.
// 사진은 옆으로 누워 있고, 회전·크롭은 .workspace-photo(또는 .city) 쪽 CSS가 맡는다.
const SLOTS = 12;
const STEP = 2 * 3600e3;
const src = (i, base) => `${base}${String(i * 2).padStart(2, '0')}.webp`;

// 하루 안의 위치(0~24시)를 { 지금 사진, 다음 사진, 다음 사진 비율 } 로
export function cityMix(ms) {
  const d = new Date(ms);
  const t = d.getHours() * 3600e3 + d.getMinutes() * 60e3 + d.getSeconds() * 1e3;
  const i = Math.floor(t / STEP) % SLOTS;
  return { i, j: (i + 1) % SLOTS, f: (t - i * STEP) / STEP };
}

// box 안에 <img> 두 장을 만들고 1분마다 섞는 비율을 고친다. 주소 끝 #city=14 로 시각 미리보기
export function mountCity(box, nowMs = Date.now, base = new URL('./city/', import.meta.url).href) {
  const under = new Image();
  const over = new Image();
  for (const im of [under, over]) {
    im.alt = '';
    im.draggable = false;
    im.decoding = 'async';
    box.append(im);
  }
  over.className = 'city-over';
  const preview = () => {
    const m = /city=(\d{1,2})(?::(\d{2}))?/.exec(location.hash);
    if (!m) return null;
    const d = new Date(nowMs());
    d.setHours(+m[1] % 24, +(m[2] || 0), 0, 0);
    return d.getTime();
  };
  let shown = '';
  function update() {
    const { i, j, f } = cityMix(preview() ?? nowMs());
    const a = src(i, base);
    const b = src(j, base);
    if (shown !== a + b) {
      shown = a + b;
      under.src = a;
      over.src = b;
      // 그다음 사진을 미리 받아 둔다
      new Image().src = src((j + 1) % SLOTS, base);
    }
    over.style.opacity = f.toFixed(3);
    box.dataset.slot = String(i * 2).padStart(2, '0');
  }
  update();
  setInterval(update, 60e3);
  addEventListener('hashchange', update);
  return update;
}
