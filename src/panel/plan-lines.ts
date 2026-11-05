// P3U: the lines that say what a plan includes. One list for the Credits &
// Plan screen and the public pricing cards, both from the owner's config.
import type { Plan } from '../platform-config/schema';
import { t } from './strings';

export const humanise = (id: string): string =>
  id.charAt(0).toUpperCase() + id.slice(1).replaceAll('-', ' ');

export function planLines(p: Plan): string[] {
  return [
    p.limits.exportsPerMonth === null
      ? t('plan.exportsNo')
      : t('plan.exports', { n: p.limits.exportsPerMonth }),
    p.limits.projects === null
      ? t('plan.projectsNo')
      : t('plan.projects', { n: p.limits.projects }),
    t('plan.storage', {
      n: Math.round((p.limits.storageMb / 1024) * 10) / 10,
    }),
    t('plan.height', { n: p.limits.maxExportHeight }),
    p.watermark ? t('plan.watermark') : t('plan.noWatermark'),
    ...(p.limits.voiceClones
      ? [t('plan.clones', { n: p.limits.voiceClones })]
      : []),
    ...p.features.map(humanise),
  ];
}
