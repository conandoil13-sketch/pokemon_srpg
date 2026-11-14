// 난이도 측정: 시드 N개로 층마다 적 구성을 굴려 위협도·마릿수·종족값 분포를 표로 낸다
// node tools/difficulty-report.js [시드 수=1000]
import { DUNGEONS } from '../src/data/dungeons.js';
import { SPECIES } from '../src/data/species.js';
import { rollEnemies, threat, budgetBonusMax } from '../src/core/difficulty.js';

const N = Number(process.argv[2]) || 1000;
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const line = (cells) => `| ${cells.join(' | ')} |`;

console.log(`시드 ${N}개 · 위협도 = 레벨 × 종족값 합 / 100 · 보스 제외\n`);
for (const d of DUNGEONS) {
  console.log(`### ${d.name} (레벨 상한 ${d.levelCap})\n`);
  console.log(line(['층', '기준 Lv', '예산(+최대 변동)', '위협도 최소/중앙/최대', '마릿수 최소/중앙/최대', '종족값 범위', '1위 종']));
  console.log(line(Array(7).fill('---')));
  for (let f = 1; f <= d.floors; f++) {
    const totals = [], counts = [], bst = [], freq = {};
    for (let s = 1; s <= N; s++) {
      const list = rollEnemies(d, f, s);
      totals.push(list.reduce((a, e) => a + threat(e.level, e.species), 0));
      counts.push(list.length);
      for (const e of list) { bst.push(SPECIES[e.species].bst); freq[e.species] = (freq[e.species] ?? 0) + 1; }
    }
    [totals, counts, bst].forEach((a) => a.sort((x, y) => x - y));
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    console.log(line([f, d.baseLevel[f - 1], `${d.budget[f - 1]} (+${Math.round(budgetBonusMax(d, f) * 100)}%)`,
      `${totals[0].toFixed(0)} / ${pct(totals, 0.5).toFixed(0)} / ${totals.at(-1).toFixed(0)}`,
      `${counts[0]} / ${pct(counts, 0.5)} / ${counts.at(-1)}`, `${bst[0]}~${bst.at(-1)}`, `${SPECIES[top[0]].name}`]));
  }
  console.log('');
}
