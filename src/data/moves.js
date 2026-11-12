// 기술 정의: id name type category power accuracy rangeMin rangeMax
const RAW = `
flamethrower|Flamethrower|fire|special|90|100|1|2
closecombat|Close Combat|fighting|physical|120|100|1|1
machpunch|Mach Punch|fighting|physical|40|100|1|1
surf|Surf|water|special|90|100|1|2
flashcannon|Flash Cannon|steel|special|80|100|1|2
drillpeck|Drill Peck|flying|physical|80|100|1|1
woodhammer|Wood Hammer|grass|physical|120|100|1|1
earthquake|Earthquake|ground|physical|100|100|1|1
razorleaf|Razor Leaf|grass|physical|55|95|1|2
thunderbolt|Thunderbolt|electric|special|90|100|1|2
crunch|Crunch|dark|physical|80|100|1|1
spark|Spark|electric|physical|65|100|1|1
aurasphere|Aura Sphere|fighting|special|80|100|2|3
dragonclaw|Dragon Claw|dragon|physical|80|100|1|1
nightslash|Night Slash|dark|physical|70|100|1|1
darkpulse|Dark Pulse|dark|special|80|100|1|2
energyball|Energy Ball|grass|special|90|100|1|2
sludgebomb|Sludge Bomb|poison|special|90|100|1|2
shadowball|Shadow Ball|ghost|special|80|100|2|3
psychic|Psychic|psychic|special|90|100|1|2
`;

export const MOVES = Object.fromEntries(
  RAW.trim().split('\n').map((line) => {
    const [id, name, type, category, power, accuracy, rmin, rmax] = line.split('|');
    return [id, { id, name, type, category, power: +power, accuracy: +accuracy, range: [+rmin, +rmax] }];
  }),
);
