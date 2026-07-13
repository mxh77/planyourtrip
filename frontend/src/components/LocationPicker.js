import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { COLORS, RADIUS, SPACING } from '../theme';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

/**
 * Champ d'autocomplétion Google Places.
 * Le dropdown N'est PAS rendu ici — il est délégué au parent via onDropdownChange
 * pour être affiché dans le Modal parent existant (aucun nouveau Modal ouvert
 * → le clavier ne disparaît pas).
 *
 * Props :
 *   - label             : string
 *   - initialValue      : string
 *   - onSelect          : ({ location, latitude, longitude }) => void
 *   - onDropdownChange  : (dropdown | null) => void
 *     dropdown = { items, position: { top, left, width }, onSelectItem }
 */
export default function LocationPicker({ label = 'Lieu (optionnel)', initialValue = '', onSelect }) {
  const ref = useRef(null);
  const [hasText, setHasText] = useState(!!initialValue);
  const [instanceKey, setInstanceKey] = useState(0);

  useEffect(() => {
    if (initialValue) {
      ref.current?.setAddressText(initialValue);
    }
  }, [instanceKey]);

  const handleClear = () => {
    setHasText(false);
    setInstanceKey(k => k + 1);
    onSelect?.({ location: '', latitude: null, longitude: null });
  };

  return (
    <View style={styles.group}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <GooglePlacesAutocomplete
        key={instanceKey}
        ref={ref}
        placeholder="Adresse ou lieu…"
        minLength={2}
        fetchDetails
        enablePoweredByContainer={false}
        language="fr"
        query={{ key: API_KEY, language: 'fr' }}
        textInputProps={{
          defaultValue: initialValue,
          placeholderTextColor: COLORS.textDim,
          selectionColor: COLORS.accent,
          onChangeText: (t) => setHasText(t.length > 0),
        }}
        onPress={(data, details = null) => {
          setHasText(true);
          const location = data.description;
          const latitude = details?.geometry?.location?.lat ?? null;
          const longitude = details?.geometry?.location?.lng ?? null;
          onSelect?.({ location, latitude, longitude });
        }}
        renderRightButton={() =>
          hasText ? (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          ) : null
        }
        styles={{
          container: { flex: 0 },
          textInputContainer: styles.inputContainer,
          textInput: styles.input,
          listView: styles.listView,
          row: styles.suggRow,
          description: styles.description,
          separator: styles.separator,
          poweredContainer: { display: 'none' },
        }}
        listViewDisplayed="auto"
        keepResultsAfterBlur={false}
        debounce={300}
        flatListProps={{ nestedScrollEnabled: true }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginBottom: SPACING.md,
  },
  label: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  inputContainer: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  input: {
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: 15,
    paddingHorizontal: SPACING.md,
    paddingRight: 40,
    paddingVertical: SPACING.sm + 2,
    marginBottom: 0,
  },
  listView: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
  },
  suggRow: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
  },
  description: {
    color: COLORS.text,
    fontSize: 14,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  clearBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: {
    color: COLORS.textDim,
    fontSize: 16,
  },
});
