import React, { forwardRef, useImperativeHandle, useRef, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, Modal, TouchableOpacity,
} from 'react-native';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

const ITEM_H = 52;
const VISIBLE = 5; // odd number — center item is selected

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

// ─── Scroll wheel column ──────────────────────────────────────────────────────
const WheelColumn = forwardRef(function WheelColumn({ data, value, onChange }, ref) {
  const listRef = useRef(null);

  // Two empty padding items at start & end allow first/last items to center
  const paddedData = useMemo(() => ['', '', ...data, '', ''], [data]);

  useImperativeHandle(ref, () => ({
    scrollTo(val) {
      const idx = data.indexOf(val);
      if (idx >= 0 && listRef.current) {
        listRef.current.scrollToOffset({ offset: idx * ITEM_H, animated: false });
      }
    },
  }));

  const handleScrollEnd = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const clamped = Math.max(0, Math.min(data.length - 1, idx));
    onChange(data[clamped]);
  };

  return (
    <View style={styles.wheelWrapper}>
      {/* Accent highlight bar behind the center item */}
      <View style={styles.selectionBar} pointerEvents="none" />
      <FlatList
        ref={listRef}
        data={paddedData}
        keyExtractor={(_, i) => String(i)}
        getItemLayout={(_, index) => ({ length: ITEM_H, offset: ITEM_H * index, index })}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        style={{ height: ITEM_H * VISIBLE }}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        renderItem={({ item }) => (
          <View style={styles.wheelItem}>
            <Text style={[styles.wheelText, item === value && styles.wheelTextActive]}>
              {item || ' '}
            </Text>
          </View>
        )}
      />
    </View>
  );
});

// ─── Public component ─────────────────────────────────────────────────────────
// Props:
//   visible   — boolean
//   value     — "HH:MM" string or null
//   label     — string, displayed in the header
//   onConfirm — (value: "HH:MM") => void
//   onCancel  — () => void
export default function TimePicker({ visible, value, onConfirm, onCancel, label }) {
  const [hour, setHour] = useState('08');
  const [minute, setMinute] = useState('00');

  const hourRef = useRef(null);
  const minuteRef = useRef(null);

  // Scroll wheels to the correct position when the modal appears
  const handleShow = () => {
    let h = '08';
    let m = '00';
    if (value) {
      const parts = value.split(':');
      h = parts[0] ?? '08';
      const rawM = parts[1] ?? '00';
      // Snap to nearest 15-min slot
      m = MINUTES.includes(rawM) ? rawM : '00';
    }
    setHour(h);
    setMinute(m);
    // Give the FlatList time to mount before calling scrollToOffset
    setTimeout(() => {
      hourRef.current?.scrollTo(h);
      minuteRef.current?.scrollTo(m);
    }, 80);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      onShow={handleShow}
    >
      <View style={styles.overlay}>
        {/* Tap outside to cancel */}
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onCancel} />

        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.cancel}>Annuler</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{label}</Text>
            <TouchableOpacity
              onPress={() => onConfirm(`${hour}:${minute}`)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.confirm}>OK</Text>
            </TouchableOpacity>
          </View>

          {/* Wheels */}
          <View style={styles.wheelsRow}>
            <WheelColumn ref={hourRef} data={HOURS} value={hour} onChange={setHour} />
            <Text style={styles.colon}>:</Text>
            <WheelColumn ref={minuteRef} data={MINUTES} value={minute} onChange={setMinute} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    overflow: 'hidden',
    paddingBottom: SPACING.xl,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontFamily: FONTS.titleRegular,
    fontSize: 16,
    color: COLORS.text,
  },
  cancel: { color: COLORS.textMuted, fontSize: 15 },
  confirm: { color: COLORS.accent, fontSize: 15, fontWeight: '700' },

  wheelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl * 2,
  },
  colon: {
    fontSize: 28,
    color: COLORS.text,
    fontWeight: '600',
    marginHorizontal: SPACING.lg,
    marginBottom: 4,
  },

  wheelWrapper: {
    flex: 1,
    position: 'relative',
  },
  // Highlight bar positioned behind the center item
  selectionBar: {
    position: 'absolute',
    top: ITEM_H * Math.floor(VISIBLE / 2),
    left: 0,
    right: 0,
    height: ITEM_H,
    backgroundColor: COLORS.accentDim,
    borderRadius: RADIUS.sm,
    zIndex: 0,
  },
  wheelItem: {
    height: ITEM_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelText: {
    fontSize: 26,
    color: COLORS.textMuted,
    fontWeight: '300',
  },
  wheelTextActive: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 28,
  },
});
