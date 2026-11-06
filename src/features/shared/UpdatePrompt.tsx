import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useUpdateInstall, type UpdateStep } from '@/services/installUpdate';
import { isNewerThanThisBuild } from '@/services/updates';
import { useApp } from '@/store/app';
import { useTheme } from '@/theme/theme';
import { Icon } from '@/ui/Icon';
import { PillButton } from '@/ui/PillButton';
import { Sheet } from '@/ui/Sheet';
import { T } from '@/ui/T';
import { useT } from '@/i18n';

/** The update button's words for where the download is: shared by the popup and Home's banner. */
export function updateLabel(step: UpdateStep, share: number | null, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (step === 'downloading') return share != null ? t('Downloading the update… {percent}%', { percent: Math.round(share * 100) }) : t('Downloading the update…');
  if (step === 'ready') return t('Install the update');
  if (step === 'failed') return t('Try again');
  return t('Update now');
}

/** "Later" puts the popup away for this long; after that it comes back with the next update check. */
const LATER = 12 * 3600 * 1000;

/** What's new, from the release notes' "- " lines. */
const newsOf = (notes: string) =>
  notes
    .split('\n')
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 4);

/**
 * On Android, a popup as soon as an update check finds a new version, over whichever page is open:
 * what's new, and Update Now, which downloads it in the app and opens Android's installer (one tap on
 * Install). The web app needs none: it reloads into a new version by itself.
 */
export function UpdatePrompt() {
  const { c } = useTheme();
  const { t } = useT();
  const updates = useApp((s) => s.settings.updates);
  const [later, setLater] = useState<{ version: string; at: number } | null>(null);
  const step = useUpdateInstall((s) => s.step);
  const share = useUpdateInstall((s) => s.share);
  const start = useUpdateInstall((s) => s.start);
  const latest = updates.latest;
  const checkedAt = updates.lastCheck ? new Date(updates.lastCheck).getTime() : 0;
  const putAway = !!later && !!latest && later.version === latest.version && checkedAt - later.at < LATER;
  const open = Platform.OS === 'android' && !!latest && isNewerThanThisBuild(latest.version) && !putAway;
  if (!latest) return null;
  const news = newsOf(latest.notes);

  const close = () => setLater({ version: latest.version, at: Date.now() });
  // The download shows its progress here; once it's in, the button opens Android's installer again.
  const update = () => {
    if (!latest.apkUrl) {
      close();
      void WebBrowser.openBrowserAsync(latest.url);
      return;
    }
    void start(latest.apkUrl);
  };
  const caption = !latest.apkUrl
    ? t('The new version opens in your browser.')
    : step === 'ready'
      ? t('Downloaded. If Android asks, allow Bloom Planner to install apps, then tap Install.')
      : step === 'failed'
        ? t('The download stopped. Try again, or get it from the website.')
        : t('It downloads here in the app, then Android asks you to tap Install.');

  return (
    <Sheet visible={open} onClose={close} title={t('Version {version} Is Ready', { version: latest.version })}>
      <View style={{ gap: 12 }}>
        {news.length ? (
          news.map((line) => (
            <View key={line} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <Icon name="flower" size={18} color={c.leaf} />
              <T style={{ flex: 1 }}>{line}</T>
            </View>
          ))
        ) : (
          <T>{t('A new version is available.')}</T>
        )}
        <T v="small" soft>
          {caption}
        </T>
        <View style={{ gap: 10, marginTop: 4 }}>
          <PillButton label={latest.apkUrl ? updateLabel(step, share, t) : t('See what’s new')} icon={step === 'ready' ? 'cellphone-arrow-down' : 'download'} onPress={update} disabled={step === 'downloading'} />
          {step === 'failed' ? <PillButton label={t('See what’s new')} variant="ghost" onPress={() => void WebBrowser.openBrowserAsync(latest.url)} /> : null}
          <PillButton label={t('Later')} variant="ghost" onPress={close} />
        </View>
      </View>
    </Sheet>
  );
}
