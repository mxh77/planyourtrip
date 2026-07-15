import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { getLogsAsJson, clearLogs, captureSnapshot } from '../services/logger';

export function LogsViewer({ visible, onClose }) {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!visible || !autoScroll) return;

    const interval = setInterval(() => {
      setLogs(getLogsAsJson());
    }, 500);

    return () => clearInterval(interval);
  }, [visible, autoScroll]);

  const filteredLogs = logs.filter((entry) => {
    if (!filter) return true;
    const search = filter.toLowerCase();
    return (
      entry.category.toLowerCase().includes(search) ||
      entry.message.toLowerCase().includes(search)
    );
  });

  const handleClear = () => {
    Alert.alert('Vider les logs', 'Êtes-vous sûr?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Vider',
        onPress: () => {
          clearLogs();
          setLogs([]);
        },
        style: 'destructive',
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>📋 Logs en temps réel</Text>
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* Toolbar */}
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.toolBtn} onPress={handleClear}>
            <MaterialIcons name="delete" size={18} color="#dc2626" />
            <Text style={[styles.toolBtnText, { color: '#dc2626' }]}>Vider</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolBtn, autoScroll && styles.toolBtnActive]}
            onPress={() => setAutoScroll(!autoScroll)}
          >
            <MaterialIcons name={autoScroll ? 'pause' : 'play-arrow'} size={18} color={COLORS.primary} />
            <Text style={styles.toolBtnText}>{autoScroll ? 'Pause' : 'Play'}</Text>
          </TouchableOpacity>

          <Text style={styles.logCount}>{logs.length} logs</Text>
        </View>

        {/* Filter */}
        <TextInput
          style={styles.filterInput}
          placeholder="Filtrer (ex: DIRECTIONS, REFRESH)..."
          value={filter}
          onChangeText={setFilter}
          placeholderTextColor="#999"
        />

        {/* Logs */}
        <ScrollView style={styles.logsList}>
          {filteredLogs.length === 0 ? (
            <Text style={styles.emptyText}>Aucun log</Text>
          ) : (
            filteredLogs.map((entry, idx) => (
              <View key={idx} style={styles.logEntry}>
                <View style={styles.logHeader}>
                  <Text style={[styles.cat, { color: getCatColor(entry.category) }]}>
                    [{entry.category}]
                  </Text>
                  <Text style={styles.ts}>{entry.timestamp.split('T')[1]?.split('.')[0]}</Text>
                </View>
                <Text style={styles.msg}>{entry.message}</Text>
                {entry.data && <Text style={styles.data}>{JSON.stringify(entry.data)}</Text>}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function getCatColor(cat) {
  const colors = {
    ROUTES: '#3b82f6',
    DIRECTIONS: '#3b82f6',
    REFRESH: '#8b5cf6',
    PLACES: '#10b981',
    LOGGER: '#6b7280',
  };
  return colors[cat] || '#6b7280';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: COLORS.surface,
  },
  title: {
    ...FONTS.bold,
    fontSize: 16,
    color: COLORS.text,
  },
  toolbar: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: '#f3f4f6',
    borderRadius: RADIUS.sm,
  },
  toolBtnActive: {
    backgroundColor: '#dbeafe',
  },
  toolBtnText: {
    ...FONTS.regular,
    fontSize: 11,
    color: COLORS.primary,
  },
  logCount: {
    ...FONTS.regular,
    fontSize: 11,
    color: '#6b7280',
    marginLeft: 'auto',
  },
  filterInput: {
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    fontSize: 12,
    color: COLORS.text,
  },
  logsList: {
    flex: 1,
    paddingHorizontal: SPACING.md,
  },
  emptyText: {
    ...FONTS.regular,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
  logEntry: {
    marginVertical: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    backgroundColor: '#f9fafb',
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
    borderRadius: RADIUS.xs,
  },
  logHeader: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    marginBottom: 2,
  },
  cat: {
    ...FONTS.bold,
    fontSize: 10,
  },
  ts: {
    ...FONTS.regular,
    fontSize: 9,
    color: '#999',
    marginLeft: 'auto',
  },
  msg: {
    ...FONTS.regular,
    fontSize: 11,
    color: COLORS.text,
  },
  data: {
    ...FONTS.regular,
    fontSize: 9,
    color: '#666',
    marginTop: 4,
    fontFamily: 'monospace',
  },
});
