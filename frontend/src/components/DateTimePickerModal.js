import React, { useState, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList, StyleSheet,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

// ─── Utilitaires date ───────────────────────────────────────────────

const toYMD = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const fromYMD = (str) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

// ─── Constantes ────────────────────────────────────────────────────────

const ITEM_H  = 50;
const VISIBLE = 5;
const HOURS   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

const NOW_YEAR     = new Date().getFullYear();
const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

// ─── Roue scrollable ────────────────────────────────────────────────────

const WheelColumn = forwardRef(function WheelColumn({ data, value, onChange }, ref) {
  const listRef = useRef(null);
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
    <View style={wheel.wrapper}>
      <View style={wheel.selBar} pointerEvents="none" />
      <FlatList
        ref={listRef}
        data={paddedData}
        keyExtractor={(_, i) => String(i)}
        getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        style={{ height: ITEM_H * VISIBLE }}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        renderItem={({ item }) => (
          <View style={wheel.item}>
            <Text style={[wheel.text, item === value && wheel.textActive]}>
              {item || ' '}
            </Text>
          </View>
        )}
      />
    </View>
  );
});

// ─── Composant principal ────────────────────────────────────────────────────────
//
// Props :
//   visible    boolean
//   date       Date — date initiale
//   time       "HH:MM" | null — heure initiale
//   label      string — titre de la modal
//   minDate    Date | null — date minimum (pour la date de fin)
//   onConfirm  ({ date: Date, time: string | null }) => void
//   onCancel   () => void

export default function DateTimePickerModal({ visible, date, time, label, minDate, onConfirm, onCancel }) {
  // Date
  const [selDate, setSelDate]           = useState('');
  // Heure
  const [hasTime, setHasTime]           = useState(true);
  const [hour, setHour]                 = useState('09');
  const [minute, setMinute]             = useState('00');
  // Navigation calendrier
  const [calKey, setCalKey]             = useState(0);
  const [calInitMonth, setCalInitMonth] = useState('');
  const [currentMonth, setCurrentMonth] = useState('');
  // Sélecteur mois/année
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [mpYear,     setMpYear]     = useState(NOW_YEAR);
  const [mpMonthIdx, setMpMonthIdx] = useState(0);

  const hourRef    = useRef(null);
  const minRef     = useRef(null);

  // ─── Initialisation à l'ouverture ───────────────────────────────────────────

  const handleShow = () => {
    const ymd = toYMD(date);
    setSelDate(ymd);
    setCalInitMonth(ymd);
    setCurrentMonth(ymd);
    setCalKey(k => k + 1);   // Calendar frais à chaque ouverture
    setShowMonthPicker(false);

    const h = time ? time.split(':')[0] : '09';
    const m = time ? time.split(':')[1] : '00';
    setHasTime(true);         // toujours affichée par défaut
    setHour(h);
    setMinute(m);
    setTimeout(() => {
      hourRef.current?.scrollTo(h);
      minRef.current?.scrollTo(m);
    }, 150);
  };

  // ─── Sélecteur mois/année ──────────────────────────────────────────────────────

  const openMonthPicker = () => {
    const parts = currentMonth.split('-');
    const yr    = parseInt(parts[0]) || NOW_YEAR;
    const mo    = (parseInt(parts[1]) || 1) - 1;
    setMpYear(yr);
    setMpMonthIdx(mo);
    setShowMonthPicker(true);
  };

  const selectMpMonth = (moIdx) => {
    const mNum     = String(moIdx + 1).padStart(2, '0');
    const newMonth = `${mpYear}-${mNum}-01`;
    setCalInitMonth(newMonth);
    setCurrentMonth(newMonth);
    setCalKey(k => k + 1);
    setShowMonthPicker(false);
  };

  // ─── Confirmation ────────────────────────────────────────────────────────────

  const handleConfirm = () => {
    onConfirm({ date: fromYMD(selDate), time: hasTime ? `${hour}:${minute}` : null });
  };

  // ─── En-tête calendrier (mois+année cliquable) ──────────────────────────────

  const calParts  = currentMonth.split('-');
  const calMonthIdx = parseInt(calParts[1] || '1') - 1;
  const calYear     = calParts[0] || String(NOW_YEAR);

  const marked = selDate
    ? { [selDate]: { selected: true, selectedColor: COLORS.accent, selectedTextColor: COLORS.bg } }
    : {};
  const minDateStr = minDate ? toYMD(minDate) : undefined;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={handleShow}
      onRequestClose={onCancel}
    >
      <View style={s.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onCancel} />

        <View style={s.sheet}>
          {/* ─── Header ─── */}
          <View style={s.header}>
            <TouchableOpacity onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={s.cancel}>Annuler</Text>
            </TouchableOpacity>
            <Text style={s.title}>{label}</Text>
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={!selDate}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[s.ok, !selDate && { opacity: 0.4 }]}>OK</Text>
            </TouchableOpacity>
          </View>

          {/* ─── Calendrier avec en-tête cliquable ─── */}
          {/* renderHeader remplace uniquement le titre (pas les flèches) */}
          <Calendar
            key={calKey}
            current={calInitMonth}
            onDayPress={({ dateString }) => setSelDate(dateString)}
            onMonthChange={({ dateString }) => setCurrentMonth(dateString)}
            markedDates={marked}
            minDate={minDateStr}
            firstDay={1}
            renderHeader={() => (
              <TouchableOpacity onPress={openMonthPicker} style={s.calHeader} activeOpacity={0.7}>
                <Text style={s.calHeaderText}>
                  {MONTHS_SHORT[calMonthIdx] + '  ' + calYear + '  \u25be'}
                </Text>
              </TouchableOpacity>
            )}
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
            }}
          />

          {/* ─── Heure (toujours affichée) ─── */}
          <View style={s.timeSeparator} />
          <View style={[s.wheelsRow, !hasTime && s.wheelsRowDimmed]}>
            <WheelColumn ref={hourRef}   data={HOURS}   value={hour}   onChange={setHour} />
            <Text style={s.colon}>:</Text>
            <WheelColumn ref={minRef}    data={MINUTES} value={minute} onChange={setMinute} />
          </View>
          <TouchableOpacity style={s.timeToggle} onPress={() => setHasTime(v => !v)}>
            <Text style={[s.timeToggleText, hasTime && s.timeToggleRemove]}>
              {hasTime ? "\u2715 Retirer l'heure" : '+ Inclure une heure'}
            </Text>
          </TouchableOpacity>

          {/* ─── Overlay sélecteur mois/année ─── */}
          {showMonthPicker && (
            <View style={s.mpOverlay}>
              {/* En-tête année */}
              <View style={s.mpYearRow}>
                <TouchableOpacity onPress={() => setShowMonthPicker(false)} style={s.mpClose} hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}>
                  <Text style={s.cancel}>✕</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setMpYear(y => y - 1)} hitSlop={{ top: 16, bottom: 16, left: 20, right: 20 }}>
                  <Text style={s.mpArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={s.mpYearText}>{mpYear}</Text>
                <TouchableOpacity onPress={() => setMpYear(y => y + 1)} hitSlop={{ top: 16, bottom: 16, left: 20, right: 20 }}>
                  <Text style={s.mpArrow}>›</Text>
                </TouchableOpacity>
              </View>
              {/* Grille des mois */}
              <View style={s.mpMonthGrid}>
                {MONTHS_SHORT.map((mo, idx) => (
                  <TouchableOpacity
                    key={mo}
                    style={[s.mpMonthBtn, idx === mpMonthIdx && s.mpMonthBtnActive]}
                    onPress={() => selectMpMonth(idx)}
                  >
                    <Text style={[s.mpMonthText, idx === mpMonthIdx && s.mpMonthTextActive]}>
                      {mo}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    overflow: 'hidden',
    maxHeight: '92%',
    paddingBottom: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title:  { fontFamily: FONTS.titleRegular, fontSize: 16, color: COLORS.text },
  cancel: { color: COLORS.textMuted, fontSize: 15 },
  ok:     { color: COLORS.accent, fontSize: 15, fontWeight: '700' },

  // En-tête calendrier cliquable
  calHeader:     { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm, alignItems: 'center' },
  calHeaderText: { fontSize: 15, fontWeight: '700', color: COLORS.text },

  // Séparateur & heure
  timeSeparator:  { height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.lg, marginTop: SPACING.xs },
  wheelsRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xl * 2 },
  wheelsRowDimmed: { opacity: 0.3 },
  colon:          { fontSize: 28, color: COLORS.text, fontWeight: '600', marginHorizontal: SPACING.lg, marginBottom: 4 },
  timeToggle:     { alignItems: 'center', paddingBottom: SPACING.sm },
  timeToggleText: { fontSize: 13, color: COLORS.accent, fontWeight: '600' },
  timeToggleRemove: { color: COLORS.textMuted },

  // Overlay sélecteur mois/année
  mpOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.surface,
    zIndex: 10,
    paddingBottom: SPACING.lg,
  },
  mpYearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xl,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  mpClose:    { position: 'absolute', left: SPACING.md },
  mpArrow:    { fontSize: 28, color: COLORS.accent, fontWeight: '300', lineHeight: 34 },
  mpYearText: { fontSize: 20, color: COLORS.text, fontWeight: '700', minWidth: 60, textAlign: 'center' },
  mpMonthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  mpMonthBtn: {
    width: '30%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mpMonthBtnActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  mpMonthText:       { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  mpMonthTextActive: { color: COLORS.bg },
});

const wheel = StyleSheet.create({
  wrapper:    { flex: 1, position: 'relative' },
  selBar: {
    position: 'absolute',
    top: ITEM_H * Math.floor(VISIBLE / 2),
    left: 0, right: 0, height: ITEM_H,
    backgroundColor: COLORS.accentDim,
    borderRadius: RADIUS.sm,
    zIndex: 0,
  },
  item:       { height: ITEM_H, justifyContent: 'center', alignItems: 'center' },
  text:       { fontSize: 26, color: COLORS.textMuted, fontWeight: '300' },
  textActive: { color: COLORS.text, fontWeight: '700', fontSize: 28 },
});

