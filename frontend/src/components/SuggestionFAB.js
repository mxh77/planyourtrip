import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS } from '../theme';
import SuggestionModal from './SuggestionModal';

/**
 * SuggestionFAB — bouton flottant qui ouvre la modale de suggestion.
 * Usage : <SuggestionFAB bottom={tabBarHeight + 60} left={16} />
 */
export default function SuggestionFAB({ bottom = 90, left = 16 }) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[styles.fab, { bottom, left }]}
        onPress={() => setVisible(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.icon}>💡</Text>
      </TouchableOpacity>

      <SuggestionModal visible={visible} onClose={() => setVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  icon: {
    fontSize: 18,
  },
});
