import { Canvas } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { radius } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';
import { PillButton } from '@/ui/PillButton';
import { FlowerHead } from '@/ui/skia/FlowerHead';
import { T } from '@/ui/T';
import { useT } from '@/i18n';

const DISMISSED = 'bloom-planner:install-hint-dismissed';

/** The browser's install prompt (Chrome, Edge, Android): not in TypeScript's DOM types yet. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Opened from the home screen (or installed): full screen already, nothing to ask. */
function standalone(): boolean {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

function onIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === '1';
  } catch {
    return false;
  }
}

/**
 * In a browser tab, a card that offers the app's own place on the home screen, where it opens
 * full screen with its own icon. iPhone has no button for this (Apple only allows Share > Add to
 * Home Screen), so it shows the two taps; browsers that can install apps get an Install button.
 */
export function InstallHint() {
  const { c } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'ios' | 'prompt' | null>(() => (standalone() || dismissed() ? null : onIos() ? 'ios' : null));
  const [installer, setInstaller] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const offer = (e: Event) => {
      e.preventDefault();
      setInstaller(e as InstallPromptEvent);
      if (!standalone() && !dismissed()) setMode('prompt');
    };
    const installed = () => setMode(null);
    window.addEventListener('beforeinstallprompt', offer);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', offer);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  if (!mode) return null;
  const close = () => {
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      // Private browsing: it just asks again next time.
    }
    setMode(null);
  };
  const install = async () => {
    if (!installer) return;
    await installer.prompt();
    const choice = await installer.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') setMode(null);
  };

  return (
    <Animated.View entering={FadeInUp.duration(320)} exiting={FadeOutUp.duration(200)} style={{ position: 'absolute', top: insets.top + 10, left: 12, right: 12, zIndex: 50 }}>
      <View accessibilityRole="summary" style={{ backgroundColor: c.card, borderRadius: radius.card, padding: 16, gap: 12, boxShadow: `0px 10px 30px 0px ${c.dark ? 'rgba(0,0,0,0.5)' : 'rgba(90,70,40,0.22)'}` }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {/* The app's icon, as it will look on the home screen. */}
          <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#86C760', alignItems: 'center', justifyContent: 'center' }}>
            <Canvas style={{ width: 40, height: 40 }}>
              <FlowerHead r={15} color={c.petalRed} transform={[{ translateX: 20 }, { translateY: 20 }]} />
            </Canvas>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="h3">{mode === 'ios' ? t('Add to Home Screen') : t('Install Bloom Planner')}</T>
            <T v="small" soft>
              {mode === 'ios' ? t('Tap Share, then Add to Home Screen. It then opens full screen with its own icon, like an app.') : t('Install it to open full screen with its own icon, like an app.')}
            </T>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Not Now')} onPress={close} hitSlop={10} style={{ alignSelf: 'flex-start', padding: 2 }}>
            <Icon name="close" size={20} color={c.inkSoft} />
          </Pressable>
        </View>
        {mode === 'ios' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.canvasDeep, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 }}>
            <Icon name="export-variant" size={22} color={c.leafDeep} />
            <T v="caption" style={{ flex: 1 }}>
              {t('Best before you set up: the home screen copy keeps its own log.')}
            </T>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PillButton label={t('Install')} size="md" icon="download" onPress={() => void install()} style={{ flex: 1 }} />
            <PillButton label={t('Not Now')} size="md" variant="ghost" onPress={close} />
          </View>
        )}
      </View>
    </Animated.View>
  );
}
