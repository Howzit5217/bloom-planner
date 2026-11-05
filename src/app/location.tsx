import { router } from 'expo-router';
import { PlaceFinder } from '@/features/shared/PlaceFinder';
import { useApp } from '@/store/app';
import { SubScreen } from '@/ui/SubScreen';
import { T } from '@/ui/T';

export default function LocationScreen() {
  const preset = useApp((s) => s.settings.preset);
  const setLocationAndClimate = useApp((s) => s.setLocationAndClimate);
  return (
    <SubScreen title="Where you play">
      <T v="body" soft>
        Planting needs you outside. Pick where you usually walk and ride, and I'll read its weather history.
      </T>
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
