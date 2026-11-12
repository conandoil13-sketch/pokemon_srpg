// 기술 정의: id name type category power accuracy rangeMin rangeMax
const RAW = `
flamethrower|화염방사|fire|special|90|100|1|2
closecombat|인파이트|fighting|physical|120|100|1|1
machpunch|마하펀치|fighting|physical|40|100|1|1
surf|파도타기|water|special|90|100|1|2
flashcannon|러스터캐논|steel|special|80|100|1|2
drillpeck|회전부리|flying|physical|80|100|1|1
woodhammer|우드해머|grass|physical|120|100|1|1
earthquake|지진|ground|physical|100|100|1|1
razorleaf|잎날가르기|grass|physical|55|95|1|2
thunderbolt|10만볼트|electric|special|90|100|1|2
crunch|깨물어부수기|dark|physical|80|100|1|1
spark|스파크|electric|physical|65|100|1|1
aurasphere|파동탄|fighting|special|80|100|2|3
dragonclaw|드래곤클로|dragon|physical|80|100|1|1
nightslash|깜짝베기|dark|physical|70|100|1|1
darkpulse|악의파동|dark|special|80|100|1|2
energyball|에너지볼|grass|special|90|100|1|2
sludgebomb|오물폭탄|poison|special|90|100|1|2
shadowball|섀도볼|ghost|special|80|100|2|3
psychic|사이코키네시스|psychic|special|90|100|1|2
`;

export const MOVES = Object.fromEntries(
  RAW.trim().split('\n').map((line) => {
    const [id, name, type, category, power, accuracy, rmin, rmax] = line.split('|');
    return [id, { id, name, type, category, power: +power, accuracy: +accuracy, range: [+rmin, +rmax] }];
  }),
);
