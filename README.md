# Bloom Planner

A warm little planner for Pikmin Bloom that answers one question every day:
**am I on pace to hit my goal level by my goal date?**

Log three things each evening (steps, flowers, and whether you levelled up) and Bloom Planner
works out the rest: how far ahead or behind you are, how many steps and flowers today needs,
how long that takes on foot or by bike, and when each level should land, with your local
weather built in.

It speaks the same ten languages as Pikmin Bloom, plans for walking only if you don't bike, and
grades every goal with a flower: white for an easy plan, then yellow, red, and blue for the hardest.

> Unofficial fan-made planner. Not affiliated with or endorsed by Scopely or Nintendo.

## Download

**Download page: https://howzit5217.github.io/bloom-planner/**

### Android

1. Open the [latest release](https://github.com/Howzit5217/bloom-planner/releases/latest) on your phone.
2. Download `BloomPlanner-vX.Y.Z.apk` and open it.
3. If Android asks, allow your browser to install apps ("Install unknown apps"), then tap **Install**.

**Updates:** the app checks this repository once a day (Settings → Updates). When a new version is
published it shows a "Version X is ready" card on Home; tap it, download, and install over the top.
Your log is kept. Corrected level data (`src/data/bloom-levels.json`) is picked up automatically,
without reinstalling.

### Web app (iPhone and computers)

The same app runs on the web, with nothing to download. It runs only from the home screen (or as
an installed app on a computer); in a browser tab it shows how to add it:

1. Open **https://howzit5217.github.io/bloom-planner/app/** (on iPhone, in Safari).
2. iPhone: tap **Share**, then **Add to Home Screen**. Computer: **Install** (Chrome, Edge) or
   **Add to Dock** (Safari).
3. Open it from the new icon: full screen, its own icon, no browser bars.

Only from the icon, so the log lives in one place (Safari keeps a home-screen app's data apart from
the browser's). Everything works except evening reminders, which only the Android app can send.
`npx expo start` (development) skips the home-screen check.

## How the maths works

The planner follows the game's actual levelling rules:

- **Flowers never carry over.** Each level needs its full flower quota planted *while at that level*.
- **Steps carry over only up to level 100.** Levels 3 to 100 ask you to "Walk a total of X steps",
  a lifetime total, so extra steps count toward the next level. From **level 101** the task is
  "Walk X steps" at that level, and extra steps are lost when you level up. Players on the
  official Pikmin Bloom support forum confirmed this (January 2026), and it matches the game.
- Because surplus resets, the simple average ("remaining ÷ days") isn't enough when steps and flowers
  finish at different times, for example when winter slows your planting. The plan finds the smallest
  pace that still gets you there on time, and tells you how much extra that costs.
- **Rideable days** come from 10 years of [Open-Meteo](https://open-meteo.com) weather history for
  your town: a day counts if there's little rain or snow, it's not too cold or hot, it's not too windy,
  and there's enough daylight. Pick *Fair weather*, *Normal* or *All weather* in Settings, or set
  each month by hand.
- **Ahead/behind** compares where you are with where the original plan put you, in days of the plan's
  own schedule.

The engine is pure TypeScript in [`src/engine`](src/engine) with unit tests in
[`src/engine/__tests__`](src/engine/__tests__).

## Level data

[`src/data/bloom-levels.json`](src/data/bloom-levels.json) covers every level from 1 to 130. Each entry
is what you do **at level N-1** to **reach level N**.

| Levels | Source |
|---|---|
| 1-100 | [Pikmin wiki](https://www.pikminwiki.com/Level), checked row by row (steps, lifetime totals, flowers, tasks) |
| 101-109 | Pikmin wiki |
| 111 | Checked in the game: at Lv 110 the profile reads *Walk 479,200 steps / Plant 294,900 flowers* |
| 113-123 | Pikmin wiki, moved down one row (see below) |
| 110, 112, 124-130 | Estimates from the growth pattern |

The wiki's rows from 110 on were added by players recording what their profile showed **at** that
level, which is the requirement for the **next** level. The wiki's own column note says the opposite
("the requirements to go from the previous level to this one"). This file shifts those rows to the
level they unlock. A single growth model, `floor100(base × 1.0009875^(L−101))`, reproduces every
observed 101+ value (all 21 flower values exactly, all step values within 100). That model fills the
levels nobody has published yet.

If your game shows something different, tap the level in the **Levels** tab and enter what the game
says. Corrections are stored on your phone and never change the bundled file. To fix the shared data
for everyone, edit `bloom-levels.json`, raise its `"version"`, and open a pull request. Installed apps
download it automatically.

## Privacy

- Your log stays on your device (SQLite in the Android app, the browser's own storage on the web).
  There's no account, server or analytics.
- Only the coordinates of the place you pick go to Open-Meteo, for weather. With "use my current
  location", your phone's own maps service turns them into a place name.
- The update check downloads two public files from this GitHub repository. Nothing about you is sent.

## Development

Requires Node 20+.

```bash
npm install
npx expo start          # open in Expo Go (Android or iPhone)
npm test                # unit tests (engine, translations, layouts)
npm run typecheck
npm run lint
npm run build:web       # the web version, into dist/ (served under /bloom-planner/app)
```

Built with Expo SDK 58, React Native, TypeScript, expo-router, Reanimated 4, Skia (all charts and
animations), expo-sqlite, zustand and date-fns. The web version runs on react-native-web, with Skia's
CanvasKit; every push to `main` publishes it and the download page
([`docs/`](docs)) to GitHub Pages ([pages workflow](.github/workflows/pages.yml)).

Translations live in [`src/i18n`](src/i18n): the English text is the key, and a test checks every
language has every string with the same placeholders.

### Publishing a new version

Versions are `MAJOR.MINOR.PATCH`. Test builds add a beta number: `1.1.0:b3` is the third beta built on
1.1.0 (it ranks above 1.1.0, so the next release raises the version). Beta builds take GitHub
**pre-releases**; everyone else, and the download page, only ever see full releases.

```powershell
# A release: bumps app.json and package.json, builds on GitHub Actions, signs, publishes.
powershell -ExecutionPolicy Bypass -File tools\release.ps1 -Version 1.2.0 -NotesFile notes.txt

# A beta for your own devices, as a pre-release (-Install puts it on every device adb lists).
powershell -ExecutionPolicy Bypass -File tools\beta.ps1 [-Install]
```

The [Release workflow](.github/workflows/release.yml) builds the APK (`variant` input: `release` or
`beta`). With the repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` it signs and publishes the release itself; without
them it leaves an unsigned APK, which the script signs locally with the release key. Every update
must be signed with the same key, or Android refuses to install it over the old version.

## Credits

- Level requirements: the Pikmin wiki community ([Pikipedia, "Level"](https://www.pikminwiki.com/Level)).
- Weather history and geocoding: [Open-Meteo](https://open-meteo.com) (CC BY 4.0).
- Fonts: Baloo 2 and Nunito (SIL Open Font License).

Pikmin Bloom is a trademark of its respective owners. This project uses no game assets.
