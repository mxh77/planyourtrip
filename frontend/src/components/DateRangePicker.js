import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { COLORS, SPACING, RADIUS } from '../theme';

const toYMD = (d) => {
  // Use local date to avoid timezone shifting
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const fromYMD = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // midi local → pas de décalage UTC
};

const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

const diffDays = (a, b) => Math.round((b - a) / 86400000);

const frenchDate = (d) =>
  d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' });

// accent with 35% opacity for range fill
const ACCENT_FILL = 'rgba(232,164,53,0.25)';

export default function DateRangePicker({ startDate, endDate, onChange }) {
  // true = next tap sets start, false = next tap sets end
  const [selectingStart, setSelectingStart] = useState(true);

  const markedDates = useMemo(() => {
    if (!startDate) return {};
    const marks = {};
    const startKey = toYMD(startDate);

    if (!endDate || startDate.getTime() === endDate.getTime()) {
      marks[startKey] = {
        startingDay: true,
        endingDay: true,
        color: COLORS.accent,
        textColor: COLORS.bg,
      };
      return marks;
    }

    const endKey = toYMD(endDate);

    marks[startKey] = {
      startingDay: true,
      endingDay: false,
      color: COLORS.accent,
      textColor: COLORS.bg,
    };
    marks[endKey] = {
      startingDay: false,
      endingDay: true,
      color: COLORS.accent,
      textColor: COLORS.bg,
    };

    let cur = addDays(startDate, 1);
    while (toYMD(cur) < endKey) {
      marks[toYMD(cur)] = {
        startingDay: false,
        endingDay: false,
        color: ACCENT_FILL,
        textColor: COLORS.text,
      };
      cur = addDays(cur, 1);
    }

    return marks;
  }, [startDate, endDate]);

  const handleDayPress = ({ dateString }) => {
    const tapped = fromYMD(dateString);

    if (selectingStart) {
      // 1st tap → new start, clear range, wait for end
      onChange({ startDate: tapped, endDate: tapped });
      setSelectingStart(false);
    } else {
      if (tapped >= startDate) {
        // 2nd tap ≥ start → finalize range
        onChange({ startDate, endDate: tapped });
      } else {
        // 2nd tap < start → reset with new start
        onChange({ startDate: tapped, endDate: tapped });
      }
      setSelectingStart(true);
    }
  };

  const days = startDate && endDate ? diffDays(startDate, endDate) : 0;
  const summary =
    startDate && endDate
      ? `${frenchDate(startDate)} → ${frenchDate(endDate)}${days > 0 ? ` · ${days} jour${days > 1 ? 's' : ''}` : ''}`
      : null;

  const hint = selectingStart
    ? '1. Sélectionner la date de départ'
    : '2. Sélectionner la date de retour';

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>{hint}</Text>
      <Calendar
        onDayPress={handleDayPress}
        markedDates={markedDates}
        markingType="period"
        firstDay={1}
        theme={{
          backgroundColor: COLORS.surface,
          calendarBackground: COLORS.surface,
          dayTextColor: COLORS.text,
          textDisabledColor: 'rgba(242,239,232,0.2)',
          todayTextColor: COLORS.accent,
          selectedDayBackgroundColor: COLORS.accent,
          selectedDayTextColor: COLORS.bg,
          monthTextColor: COLORS.text,
          textMonthFontSize: 15,
          textMonthFontWeight: '700',
          arrowColor: COLORS.accent,
          dotColor: COLORS.accent,
        }}
        style={styles.calendar}
      />
      {summary && <Text style={styles.summary}>{summary}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
  },
  hint: {
    color: COLORS.accent,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
    textAlign: 'center',
    paddingBottom: SPACING.xs,
  },
  calendar: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summary: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingTop: SPACING.xs,
  },
});
