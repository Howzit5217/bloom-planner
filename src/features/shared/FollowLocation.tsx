import { useState } from 'react';
import { View } from 'react-native';
import { allowFollowing, followLocation } from '@/services/followLocation';
import { useApp } from '@/store/app';
import { T } from '@/ui/T';
import { Toggle } from '@/ui/Toggle';
import { useT } from '@/i18n';

/** Follow Your Location: the place keeps up with the phone while the app is open (services/followLocation). */
export function FollowLocationToggle() {
  const { t } = useT();
  const on = useApp((s) => s.settings.followLocation);
  const updateSettings = useApp((s) => s.updateSettings);
  const [denied, setDenied] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Toggle
        label={t('Follow Your Location')}
        hint={t('While the app is open, the place moves with your phone, so the sky, forecast and alerts are for where you are. Your months stay as they are.')}
        value={on}
        onChange={async (next) => {
          setDenied(false);
          if (next && !(await allowFollowing())) {
            setDenied(true);
            return;
          }
          await updateSettings({ followLocation: next });
          if (next) void followLocation(true);
        }}
      />
      {denied ? (
        <T v="caption" soft>
          {t("Location access is off. Allow it in your phone's settings to follow where you are.")}
        </T>
      ) : null}
    </View>
  );
}
