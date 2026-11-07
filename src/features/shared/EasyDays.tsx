import { Pressable, View } from 'react-native';
import { weekdayName, weekdayShort } from '@/engine/format';
import { easyDaysOf, MAX_EASY_DAYS, type RhythmPrefs, type Weekday } from '@/engine/rhythm';
import { useTheme } from '@/theme/theme';
import { Reveal } from '@/ui/Reveal';
import { ScrollText } from '@/ui/ScrollText';
import { T } from '@/ui/T';
import { Toggle } from '@/ui/Toggle';
import { useT } from '@/i18n';

/** Monday first, as a week reads on a calendar here. */
const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/**
 * The week's rhythm: whether the days vary, and which are the easy ones. Easy days ask for about
 * 60% of a usual day, the rest a little more, so each week comes out the same.
 */
export function EasyDays({ value, onChange }: { value: RhythmPrefs; onChange: (p: RhythmPrefs) => void }) {
  const { c } = useTheme();
  const { t } = useT();
  const easy = easyDaysOf(value);
  // Up to two: with two picked, the other days wait until one is turned off.
  const full = easy.length >= MAX_EASY_DAYS;
  const flip = (d: Weekday) => {
    if (easy.includes(d)) onChange({ ...value, easyDays: easy.filter((x) => x !== d) });
    else if (!full) onChange({ ...value, easyDays: [...easy, d] });
  };
  return (
    <View style={{ gap: 10 }}>
      <Toggle label={t('Vary the Days')} hint={t('Easy days ask for about 60% of a usual day and the others a little more, so each week comes out the same.')} value={value.vary} onChange={(vary) => onChange({ ...value, vary })} />
      <Reveal open={value.vary} gap={10}>
        <View style={{ gap: 6 }}>
          <T v="smallBold">{t('Easy days')}</T>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {WEEK.map((d) => {
              const on = easy.includes(d);
              const locked = !on && full;
              return (
                <Pressable
                  key={d}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: locked }}
                  accessibilityLabel={weekdayName(d)}
                  disabled={locked}
                  onPress={() => flip(d)}
                  style={({ pressed }) => ({ flex: 1, minHeight: 40, borderRadius: 999, justifyContent: 'center', paddingHorizontal: 2, opacity: locked ? 0.45 : 1, backgroundColor: on ? c.leaf : pressed ? c.leafPale : c.canvasDeep })}
                >
                  <ScrollText v="smallBold" color={on ? '#FFFFFF' : c.inkSoft} behind={on ? c.leaf : c.canvasDeep} center style={{ alignSelf: 'stretch' }}>
                    {weekdayShort(d)}
                  </ScrollText>
                </Pressable>
              );
            })}
          </View>
          <T v="caption" soft>
            {t('Pick up to two.')}
          </T>
        </View>
      </Reveal>
    </View>
  );
}
