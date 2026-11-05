import { useEffect, useState, type ReactNode } from 'react';
import { Image, Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { radius } from '@/theme/tokens';
import { Icon, type IconName } from '@/ui/Icon';
import { MAX_APP_WIDTH } from '@/ui/layout';
import { PillButton } from '@/ui/PillButton';
import { T } from '@/ui/T';
import { useT } from '@/i18n';

/** The browser's install prompt (Chrome, Edge, Android): not in TypeScript's DOM types yet. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SITE = 'https://howzit5217.github.io/bloom-planner/';
const ICON = `${process.env.EXPO_BASE_URL ?? ''}/apple-touch-icon.png`;

/** Opened from its own icon (home screen, dock or installed app window), not a browser tab. */
function fromIcon(): boolean {
  try {
    const shows = (mode: string) => window.matchMedia?.(`(display-mode: ${mode})`).matches === true;
    return shows('standalone') || shows('fullscreen') || shows('minimal-ui') || shows('window-controls-overlay') || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

function onIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

const onAndroid = () => /Android/.test(navigator.userAgent);

/** This page in Chrome itself (other apps' built-in browsers have no Add to Home Screen); the browser stays put if Chrome isn't there. */
const inChrome = () => {
  const here = window.location.href;
  return `intent://${here.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(here)};end`;
};

/**
 * The web version runs only from the home screen, where it opens full screen with its own icon
 * and keeps one log. In a browser tab it shows how to add it instead. While developing
 * (`expo start`) the tab gets the whole app.
 */
export function HomeScreenOnly({ children }: { children: ReactNode }) {
  const [open] = useState(() => __DEV__ || fromIcon());
  return open ? <>{children}</> : <AddToHomeScreen />;
}

type Mode = 'ios' | 'menu' | 'prompt' | 'added';

function AddToHomeScreen() {
  const { c } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>(() => (onIos() ? 'ios' : 'menu'));
  const [installer, setInstaller] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const offer = (e: Event) => {
      e.preventDefault();
      setInstaller(e as InstallPromptEvent);
      setMode((m) => (m === 'added' ? m : 'prompt'));
    };
    const installed = () => setMode('added');
    window.addEventListener('beforeinstallprompt', offer);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', offer);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const install = async () => {
    if (!installer) return;
    await installer.prompt();
    const choice = await installer.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') setMode('added');
  };

  const steps: Array<{ icon: IconName; text: string }> =
    mode === 'ios'
      ? [
          { icon: 'apple-safari', text: t('Open this page in Safari') },
          { icon: 'export-variant', text: t('Tap Share') },
          { icon: 'plus-box-outline', text: t('Tap Add to Home Screen') },
          { icon: 'flower', text: t('Open it from the new icon') },
        ]
      : mode === 'menu'
        ? [
            ...(onAndroid() ? [{ icon: 'google-chrome' as IconName, text: t('Open this page in Chrome') }] : []),
            { icon: 'dots-vertical', text: t("Open the browser's menu") },
            { icon: 'plus-box-outline', text: onAndroid() ? t('Tap Add to Home Screen or Install') : t('Choose Install or Add to Dock') },
            { icon: 'flower', text: t('Open it from the new icon') },
          ]
        : [];

  return (
    <View style={{ flex: 1, width: '100%', maxWidth: MAX_APP_WIDTH, backgroundColor: c.canvas, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 24, justifyContent: 'center', gap: 22 }}>
      <View style={{ alignItems: 'center', gap: 14 }}>
        {/* The icon it gets on the home screen. */}
        <Image source={{ uri: ICON }} accessibilityIgnoresInvertColors style={{ width: 96, height: 96, borderRadius: 24, boxShadow: `0px 8px 24px 0px ${c.shadow}` }} />
        <T v="h1" center accessibilityRole="header">
          {mode === 'prompt' ? t('Install Bloom Planner') : mode === 'added' ? t('Added') : t('Add to Home Screen')}
        </T>
        <T v="body" soft center>
          {mode === 'added' ? t('Open it from the new icon') : t('Bloom Planner runs from its own icon, full screen, like an app.')}
        </T>
      </View>

      {steps.length ? (
        <View style={{ backgroundColor: c.card, borderRadius: radius.card, padding: 8, boxShadow: `0px 6px 20px 0px ${c.shadow}` }}>
          {steps.map((s, i) => (
            <View key={s.icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.canvasDeep }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.button, alignItems: 'center', justifyContent: 'center' }}>
                <T v="smallBold" color={c.onButton}>
                  {i + 1}
                </T>
              </View>
              <T v="bodyBold" style={{ flex: 1 }}>
                {s.text}
              </T>
              <Icon name={s.icon} size={24} color={c.leafDeep} />
            </View>
          ))}
        </View>
      ) : null}

      {mode === 'prompt' ? <PillButton label={t('Install')} icon="download" onPress={() => void install()} /> : null}
      {mode === 'menu' && onAndroid() ? <PillButton label={t('Open in Chrome')} icon="google-chrome" onPress={() => void Linking.openURL(inChrome())} /> : null}
      {mode === 'added' ? (
        <View style={{ alignItems: 'center' }}>
          <Icon name="check-circle" size={44} color={c.leafDeep} />
        </View>
      ) : null}
      {onAndroid() ? <PillButton label={t('Get the Android App')} icon="android" variant="ghost" size="md" onPress={() => void Linking.openURL(SITE)} /> : null}
    </View>
  );
}
