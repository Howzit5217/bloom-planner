import { useState } from 'react';
import { View } from 'react-native';
import { fmt } from '@/engine/format';
import { finishShot, nameOnShot, readProfileShot, sameName, type ProfileShot } from '@/engine/profileShot';
import type { ReqFn } from '@/engine/types';
import { pickScreenshotText } from '@/services/screenshotText';
import { useTheme } from '@/theme/theme';
import { Icon } from '@/ui/Icon';
import { PillButton } from '@/ui/PillButton';
import { T } from '@/ui/T';
import { useT } from '@/i18n';

interface Props {
  /** The player's Pikmin Bloom name; the screenshot must show the same one. */
  name: string | null;
  /** No name yet: the screenshot's becomes it. */
  onName?: (name: string) => void;
  onRead: (shot: ProfileShot) => void;
  req: ReqFn;
  maxLevel: number;
}

type Note = { ok: boolean; text: string } | null;

/**
 * "Read a Screenshot": pick a screenshot of the Pikmin Bloom profile and fill in the level and
 * what's left from it, read on the device. It checks the name on it is the player's.
 */
export function ScreenshotButton({ name, onName, onRead, req, maxLevel }: Props) {
  const { c } = useTheme();
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const read = async () => {
    if (busy) return;
    setNote(null);
    setBusy(true);
    const r = await pickScreenshotText().catch(() => ({ error: 'failed' as const }));
    setBusy(false);
    if ('error' in r) {
      if (r.error === 'unsupported') setNote({ ok: false, text: t('Reading screenshots works in the installed app.') });
      else if (r.error === 'failed') setNote({ ok: false, text: t("That screenshot couldn't be read. Try a clearer one.") });
      return;
    }
    // The badge reads poorly at times: the level is trusted only when the bars and what's left fit it.
    const shot = finishShot(readProfileShot(r.lines, maxLevel), req, maxLevel);
    if (shot.level == null && shot.stepsToGo == null && shot.flowersToGo == null) {
      setNote({ ok: false, text: t('That doesn\'t look like your Pikmin Bloom profile. Open the profile, take the screenshot there and try again.') });
      return;
    }
    // Someone else's profile is no use: the name has to match.
    const seen = name ? nameOnShot(name, r.lines) : false;
    if (name && !seen && shot.name && !sameName(name, shot.name)) {
      setNote({ ok: false, text: t('This profile belongs to {seen}, not {name}.', { seen: shot.name, name }) });
      return;
    }
    if (!name && shot.name) onName?.(shot.name);
    onRead(shot);
    const parts = [
      shot.level != null ? t('Level {level}', { level: shot.level }) : null,
      shot.stepsToGo == null ? null : shot.stepsToGo === 0 ? t('Steps done') : t('{n} steps to go', { n: fmt(shot.stepsToGo) }),
      shot.flowersToGo == null ? null : shot.flowersToGo === 0 ? t('Flowers done') : t('{n} flowers to go', { n: fmt(shot.flowersToGo) }),
      shot.quest == null ? null : shot.quest.toGo === 0 ? t('Quest done') : t('Quest: {n} to go', { n: fmt(shot.quest.toGo) }),
    ].filter(Boolean);
    const checked = seen ? ` ${t('Name checked.')}` : !name && shot.name ? ` ${t('Name saved: {name}.', { name: shot.name })}` : name ? ` ${t("The name didn't come through, so check it's your profile.")}` : '';
    setNote({ ok: true, text: `${parts.join(' · ')}.${checked}` });
  };

  return (
    <View style={{ gap: 8 }}>
      <PillButton label={busy ? t('Reading…') : t('Read a Screenshot')} icon="image-search-outline" variant="secondary" size="md" onPress={() => void read()} />
      {note ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Icon name={note.ok ? 'check-circle' : 'alert-circle'} size={18} color={note.ok ? c.leaf : c.alert} />
          <T v="small" soft style={{ flex: 1 }}>
            {note.text}
          </T>
        </View>
      ) : null}
    </View>
  );
}
