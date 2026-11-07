import { router } from 'expo-router';
import { FollowLocationToggle } from '@/features/shared/FollowLocation';
import { PlaceFinder } from '@/features/shared/PlaceFinder';
import { useApp } from '@/store/app';
import { SubScreen } from '@/ui/SubScreen';
import { T } from '@/ui/T';
import { useT } from '@/i18n';

export default function LocationScreen() {
  const preset = useApp((s) => s.settings.preset);
  const { t } = useT();
  const setLocationAndClimate = useApp((s) => s.setLocationAndClimate);
  const location = useApp((s) => s.location);
  return (
    <SubScreen title={t('Where You Play')}>
      <T v="body" soft>
        {t('Pick where you usually walk and ride, to look up its weather history.')}
      </T>
      {location ? <FollowLocationToggle /> : null}
      <PlaceFinder
        preset={preset}
        allowSkip={false}
        onAccept={async (r) => {
          await setLocationAndClimate(r.location, r.climate);
          router.back();
        }}
        onManual={async (prefill) => {
          if (prefill) await setLocationAndClimate(prefill.location, prefill.climate);
          router.replace('/seasons');
        }}
      />
    </SubScreen>
  );
}
