import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { colors } from '../../constants/theme';

export interface TopSetChartPoint {
  date: Date;
  weight: number; // already converted to the user's display unit
}

interface Props {
  points: TopSetChartPoint[]; // oldest first
  formatDate: (date: Date) => string;
}

// Geometry is notch-ui-mockups.html's chart SVG verbatim: a 300×132 viewBox, the
// axis hairline at y=118, the series between y=26 and y=104, x from 10 to 290, and
// 9px date labels on the baseline at y=129. Rendering through a viewBox rather than
// pixel maths means those numbers stay literal at any phone width — the wrapper's
// aspectRatio reproduces the mockup's `height: auto`.
const VIEW_WIDTH = 300;
const VIEW_HEIGHT = 132;
const PLOT_LEFT = 10;
const PLOT_RIGHT = 290;
const PLOT_TOP = 26;
const PLOT_BOTTOM = 104;
const AXIS_Y = 118;
const LABEL_Y = 129;
const LABEL_FONT_SIZE = 9;

// CLAUDE.md "Progress tab": "The chart plots weight only. Reps are not on the line —
// that's the acknowledged limitation the rep floor addresses." Reps and RIR live in
// the session list directly below this, which is why that list isn't a separate
// screen. Nothing here draws a second axis, a y-axis scale, or a time-range control
// (CLAUDE.md: "No time-range control in v1").
//
// react-native-svg is the one added dependency, chosen because it ships inside the
// Expo Go runtime — so it needs no development build and can't repeat the
// react-native-gesture-handler / Reanimated 4 failure that took out the active
// workout screen. A full charting library would have brought a gesture and animation
// stack along with it for a static 8-point line; this draws the mockup's polyline
// directly instead.
export function TopSetChart({ points, formatDate }: Props) {
  if (points.length === 0) return null;

  const weights = points.map((p) => p.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const span = max - min;

  // A single point, or a flat run of identical top sets, has no range to scale
  // against — both sit on the plot band's centre line rather than dividing by zero
  // or pinning a flat line to the top of the chart. A flat line IS the honest
  // picture of three sessions at the same weight.
  const x = (index: number) =>
    points.length === 1
      ? (PLOT_LEFT + PLOT_RIGHT) / 2
      : PLOT_LEFT + (index / (points.length - 1)) * (PLOT_RIGHT - PLOT_LEFT);
  const y = (weight: number) =>
    span === 0
      ? (PLOT_TOP + PLOT_BOTTOM) / 2
      : PLOT_BOTTOM - ((weight - min) / span) * (PLOT_BOTTOM - PLOT_TOP);

  const polyline = points.map((p, i) => `${x(i)},${y(p.weight)}`).join(' ');
  const lastIndex = points.length - 1;

  return (
    <View style={styles.wrapper}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}>
        <Line
          x1={0}
          y1={AXIS_Y}
          x2={VIEW_WIDTH}
          y2={AXIS_Y}
          stroke={colors.border}
          strokeWidth={1}
        />

        {points.length > 1 && (
          <Polyline
            points={polyline}
            fill="none"
            stroke={colors.accent}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {points.map((p, i) => (
          <Circle
            key={`${p.date.getTime()}-${i}`}
            cx={x(i)}
            cy={y(p.weight)}
            // The most recent session reads larger — it's the number the rest of the
            // screen (best top set, change since start) is actually about.
            r={i === lastIndex ? 5 : 3}
            fill={colors.accent}
          />
        ))}

        <SvgText
          x={PLOT_LEFT}
          y={LABEL_Y}
          fontSize={LABEL_FONT_SIZE}
          fill={colors.textMuted}
          textAnchor="start"
        >
          {formatDate(points[0].date)}
        </SvgText>
        {points.length > 1 && (
          <SvgText
            x={PLOT_RIGHT}
            y={LABEL_Y}
            fontSize={LABEL_FONT_SIZE}
            fill={colors.textMuted}
            textAnchor="end"
          >
            {formatDate(points[lastIndex].date)}
          </SvgText>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', aspectRatio: VIEW_WIDTH / VIEW_HEIGHT },
});
