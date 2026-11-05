import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { burnDown, dailyBars, levelTimeline, seasonalView } from '@/engine/charts';
import { fmtDate } from '@/engine/format';
import { BurnDownChart, DailyBarsChart, LevelTimeline, SeasonalChart } from '@/features/progress/Charts';
import { useApp, useDashboard } from '@/store/app';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { StaggerIn } from '@/ui/StaggerIn';
import { T } from '@/ui/T';

export default function Progress() {
  const dash = useDashboard();
  const profile = useApp((s) => s.profile);
  const entries = useApp((s) => s.entries);
  const seasons = useApp((s) => s.seasonRates);
  const { width } = useWindowDimensions();
  const inner = width - 32 - 36;
  const data = useMemo(() => {
    if (!dash || !profile) return null;
    return {
      burn: burnDown(dash, profile),
      bars: dailyBars(entries, dash.today),
      timeline: levelTimeline(dash, profile),
      seasonal: seasonalView(dash, entries, seasons.map((s) => s.rideable)),
    };
  }, [dash, profile, entries, seasons]);
  if (!dash || !profile || !data) return null;
  const active = dash.phase === 'active' && dash.plan.status === 'ok';
  const cards = [
    <T key="t" v="h1" accessibilityRole="header">
      Progress
    </T>,
    <Card key="burn">
      <T v="h3">Burn-down to Level {dash.goal.level}</T>
      <T v="small" soft style={{ marginBottom: 12 }}>
        What's left, against the pace that gets you there on time. The shaded gap is the story: green when you're ahead, red when you're behind.
      </T>
      {data.burn.totalDays > 0 ? (
        <BurnDownChart data={data.burn} width={inner} startLabel={fmtDate(profile.startDate)} endLabel={fmtDate(dash.goal.date)} />
      ) : (
        <T v="small">Set a goal date in the future to see the burn-down.</T>
      )}
    </Card>,
    <Card key="daily">
      <T v="h3">The last 30 days</T>
      <T v="small" soft style={{ marginBottom: 12 }}>
        Steps (teal) and flowers (red) as a share of {active ? "today's" : 'the'} daily target.
      </T>
      <DailyBarsChart bars={data.bars} width={inner} stepsTarget={dash.todayGoal.steps || dash.pace.stepsPerDay} flowersTarget={dash.todayGoal.flowersIfRiding || dash.pace.flowersPerRideDay} />
    </Card>,
    <Card key="timeline">
      <T v="h3">Level timeline</T>
      <T v="small" soft style={{ marginBottom: 8 }}>
        Bloomed flowers are done, the half-open one is where you are, buds are still to come. Dates with ~ are projected.
      </T>
      <View style={{ marginHorizontal: -18 }}>
        <LevelTimeline items={data.timeline} />
      </View>
    </Card>,
    <Card key="season">
      <T v="h3">Seasons</T>
      <T v="small" soft style={{ marginBottom: 12 }}>
        Flowers the plan needs each month, against what you've planted. Short bars are the months the weather slows you down.
      </T>
      <SeasonalChart bars={data.seasonal} width={inner} />
    </Card>,
  ];
  return (
    <Screen>
      {cards.map((card, i) => (
        <StaggerIn key={i} index={i}>
          {card}
        </StaggerIn>
      ))}
    </Screen>
  );
}
