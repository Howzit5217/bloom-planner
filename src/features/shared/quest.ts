import type { QuestKind } from '@/engine/quest';
import type { IconName } from '@/ui/Icon';
import { t } from '@/i18n';

export const QUEST_ICON: Record<QuestKind, IconName> = {
  mushrooms: 'mushroom',
  expeditions: 'map-marker-path',
  pikmin: 'sprout',
  petals: 'flower-pollen',
  seedling: 'seed',
};

/** The field label for a quest's count still to go (a seedling is a yes/no instead). */
export function questToGoLabel(kind: QuestKind): string {
  switch (kind) {
    case 'mushrooms':
      return t('Mushrooms to go');
    case 'expeditions':
      return t('Expeditions to go');
    case 'pikmin':
      return t('Pikmin to go');
    case 'petals':
      return t('Petals to go');
    case 'seedling':
      return t('Seedling grown');
  }
}
