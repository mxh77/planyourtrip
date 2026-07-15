import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, FlatList,
  ActivityIndicator, Keyboard,
} from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';
import API_URL from '../api/config';
import { useAuthStore } from '../store/authStore';

/**
 * Champ d'autocomplétion Google Places via le backend proxy.
 * Props :
 *   - label         : string
 *   - initialValue  : string
 *   - onSelect      : ({ location, latitude, longitude }) => void
 */
export default function LocationPicker({ label = 'Lieu (optionnel)', initialValue = '', onSelect }) {
  const [input, setInput] = useState(initialValue);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimeoutRef = useRef(null);
  const token = useAuthStore((s) => s.token);

  const searchPlaces = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/places/autocomplete?input=${encodeURIComponent(query)}&language=fr`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSuggestions(Array.isArray(data) ? data : data.predictions || []);
      setShowDropdown(true);
    } catch (e) {
      console.log('[LocationPicker] Erreur autocomplete:', e.message);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleChangeText = (text) => {
    setInput(text);
    
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!text || text.length < 2) {
      setSuggestions([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchPlaces(text);
    }, 300);
  };

  const handleSelectSuggestion = async (prediction) => {
    setInput(prediction.description || prediction.mainText || '');
    setShowDropdown(false);
    Keyboard.dismiss();

    // Récupérer les détails (lat/lng) via le backend avec placeId
    try {
      const res = await fetch(`${API_URL}/api/places/${encodeURIComponent(prediction.placeId)}?language=fr`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const lat = data.lat ?? null;
      const lng = data.lng ?? null;
      onSelect?.({ location: prediction.description || prediction.mainText || '', latitude: lat, longitude: lng });
    } catch (e) {
      console.log('[LocationPicker] Erreur details:', e.message);
      onSelect?.({ location: prediction.description || prediction.mainText || '', latitude: null, longitude: null });
    }
  };

  const handleClear = () => {
    setInput('');
    setSuggestions([]);
    setShowDropdown(false);
    onSelect?.({ location: '', latitude: null, longitude: null });
  };

  return (
    <View style={styles.group}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          placeholder="Adresse ou lieu…"
          placeholderTextColor={COLORS.textDim}
          value={input}
          onChangeText={handleChangeText}
          onFocus={() => input && setSuggestions.length > 0 && setShowDropdown(true)}
        />
        
        {loading && <ActivityIndicator size="small" color={COLORS.accent} style={styles.loader} />}
        
        {input && !loading && (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {showDropdown && suggestions.length > 0 && (
        <FlatList
          data={suggestions}
          keyExtractor={(item, i) => `${item.place_id || i}`}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.suggRow}
              onPress={() => handleSelectSuggestion(item)}
            >
              <Text style={styles.description}>{item.description}</Text>
            </TouchableOpacity>
          )}
          scrollEnabled={false}
          style={styles.listView}
        />
      )}
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
  inputWrapper: {
    position: 'relative',
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
