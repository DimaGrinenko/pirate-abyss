import { language } from './locale';
export function getCompassCopy() {
  return language === 'ru' ? {
    title: 'Компас капитана', tag: 'Любой Wild на отмеченном барабане',
    detail: 'Компас начинает на барабане 2. На отмеченном барабане любой тип Wild может раскрыться, если создаёт выигрыш. После такого раскрытия компас переходит к следующему центральному барабану: 2 → 3 → 4 → 5 → 2.',
    persistence: 'Сохраняется позиция компаса; типы Wild не пробуждаются.',
    expansion: 'Родной барабан и барабан с компасом',
    intro: 'Любой Wild может раскрыть отмеченный барабан. Выигрышное раскрытие передвигает компас.',
    raids: 'Три рейда. Разные способности команды.',
    target: 'Компас: барабан', rules: 'Отдельный запуск за 100×. 10 вращений. 2 Scatter дают +2, 3 и более — +4. Раскрытие родных Wild сохраняется. Множители участвующих Wild складываются. Дополнительной награды за полный круг нет. Общий предел — 15 000×; RTP — 96%.',
  } : {
    title: 'Captain’s Compass', tag: 'Any Wild on the marked reel',
    detail: 'The compass starts on reel 2. Any Wild type may expand on the marked reel when it creates a win. After that expansion, the compass advances to the next central reel: 2 → 3 → 4 → 5 → 2.',
    persistence: 'The compass position persists; Wild types do not awaken.',
    expansion: 'Home reel and compass-marked reel',
    intro: 'Any Wild may expand on the marked reel. A winning expansion moves the compass.',
    raids: 'Three raids. Different crew abilities.',
    target: 'Compass: reel', rules: 'Separate entry at 100×. 10 spins. 2 Scatters award +2, 3 or more award +4. Home-reel Wild expansion still applies. Participating Wild multipliers add together. There is no extra prize for completing a circuit. Total cap: 15,000×; RTP: 96%.',
  };
}
