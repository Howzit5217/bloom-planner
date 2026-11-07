import { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { fmt } from '@/engine/format';
import { finishShot, nameOnShot, readProfileShot, sameName, type ProfileShot } from '@/engine/profileShot';
import type { ReqFn } from '@/engine/types';
import { allowPictures, canOpenPikmin, forgetPicture, newestPictureSince, openPikmin } from '@/services/pikmin';
import { pickScreenshotText, readScreenshotText, type ScreenshotText } from '@/services/screenshotText';
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

/** How long after opening the game a screenshot is still looked for on coming back. */
const WAIT_MS = 20 * 60_000;

/**
 * "Read a Screenshot": pick a screenshot of the Pikmin Bloom profile and fill in the level and
 * what's left from it, read on the device. It checks the name on it is the player's. On Android,
 * "Open Pikmin Bloom" opens the game instead; take a screenshot of the profile there, come back, and
 * the screenshot is found and read with no picking.
 */
export function ScreenshotButton({ name, onName, onRead, req, maxLevel }: Props) {
  const { c } = useTheme();
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  // When the game was opened from here: a screenshot saved since then is the one to read.
  const openedAt = useRef<number | null>(null);

  const apply = (r: ScreenshotText) => {
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

  const read = async () => {
    if (busy) return;
    setNote(null);
    setBusy(true);
    const r = await pickScreenshotText().catch(() => ({ error: 'failed' as const }));
    setBusy(false);
    apply(r);
  };

  const openGame = async () => {
    if (busy) return;
    setNote(null);
    // Asked first, so the question doesn't wait on coming back.
    const access = await allowPictures();
    if (access === 'none') {
      setNote({ ok: false, text: t('To find the screenshot, Bloom Planner needs to see your pictures. Pick a Screenshot works without that.') });
      return;
    }
    // Only pictures picked one by one: a new screenshot wouldn't be among them.
    if (access === 'limited') {
      setNote({ ok: false, text: t("Bloom Planner can see only the pictures you chose, so a new screenshot stays hidden from it. Allow all photos for it in your phone's settings, or use Pick a Screenshot.") });
      return;
    }
    const at = Date.now();
    if (!openPikmin()) {
      setNote({ ok: false, text: t("Pikmin Bloom isn't on this phone.") });
      return;
    }
    openedAt.current = at;
    setNote({ ok: true, text: t('Take a screenshot of your profile in Pikmin Bloom, then come back here.') });
  };

  // The latest `apply` (its props as they are now) for the listener below, set up once.
  const latest = useRef(apply);
  useEffect(() => {
    latest.current = apply;
  });

  // Back from the game: the newest screenshot since it was opened, read as if it had been picked.
  useEffect(() => {
    if (!canOpenPikmin) return;
    const sub = AppState.addEventListener('change', (state) => {
      const at = openedAt.current;
      if (state !== 'active' || at == null) return;
      if (Date.now() - at > WAIT_MS) {
        openedAt.current = null;
        return;
      }
      void (async () => {
        const uri = await newestPictureSince(at);
        if (!uri) {
          setNote({ ok: false, text: t('No new screenshot yet. Take one of your profile in Pikmin Bloom, then come back.') });
          return;
        }
        openedAt.current = null;
        setBusy(true);
        const r = await readScreenshotText(uri).catch(() => ({ error: 'failed' as const }));
        forgetPicture(uri);
        setBusy(false);
        latest.current(r);
      })();
    });
    return () => sub.remove();
    // Set up once: `latest` and `t` keep it current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ gap: 8 }}>
      {canOpenPikmin ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <PillButton label={t('Open Pikmin Bloom')} icon="open-in-new" variant="secondary" size="md" onPress={() => void openGame()} style={{ flexGrow: 1 }} />
          <PillButton label={busy ? t('Reading…') : t('Pick a Screenshot')} icon="image-search-outline" variant="secondary" size="md" onPress={() => void read()} style={{ flexGrow: 1 }} />
        </View>
      ) : (
        <PillButton label={busy ? t('Reading…') : t('Read a Screenshot')} icon="image-search-outline" variant="secondary" size="md" onPress={() => void read()} />
      )}
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
