import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Share, TextInput, ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { log, getLogsAsString, getLogsAsJson, clearLogs, captureSnapshot } from '../services/logger';

export default function DebugLogsScreen({ navigation }) {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Rafraîchir les logs toutes les 2 secondes
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      const logsData = getLogsAsJson();
      setLogs(logsData);
    }, 2000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const filteredLogs = logs.filter((entry) => {
    if (!filter) return true;
    const searchLower = filter.toLowerCase();
    return (
      entry.category.toLowerCase().includes(searchLower) ||
      entry.message.toLowerCase().includes(searchLower)
    );
  });

  const handleExport = async () => {
    const content = getLogsAsString();
    try {
      await Share.share({
        message: content,
        title: 'Export Logs',
      });
    } catch (err) {
      Alert.alert('Erreur', 'Impossible d\'exporter les logs');
    }
  };

  const handleClear = () => {
    Alert.alert(
      'Vider les logs',
      'Êtes-vous sûr?',
      [
        { text: 'Annuler', onPress: () => {}, style: 'cancel' },
        {
          text: 'Vider',
          onPress: () => {
            clearLogs();
            setLogs([]);
          },
          style: 'destructive',
        },
      ]
    );
  };

  const handleSnapshot = () => {
    const count = captureSnapshot('Manuel');
    Alert.alert('Snapshot', `${count} logs en mémoire`);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>📋 Logs Frontend</Text>
        <Text style={styles.subtitle}>{logs.length} logs | {filteredLogs.length} filtrés</Text>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.btn} onPress={handleExport}>
          <MaterialIcons name="share" size={20} color={COLORS.primary} />
          <Text style={styles.btnText}>Export</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btn} onPress={handleSnapshot}>
          <MaterialIcons name="camera" size={20} color={COLORS.primary} />
          <Text style={styles.btnText}>Snapshot</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btn} onPress={handleClear}>
          <MaterialIcons name="delete" size={20} color={COLORS.danger} />
          <Text style={[styles.btnText, { color: COLORS.danger }]}>Vider</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, autoRefresh && styles.btnActive]}
          onPress={() => setAutoRefresh(!autoRefresh)}
        >
          <MaterialIcons name={autoRefresh ? 'pause' : 'play-arrow'} size={20} color={COLORS.primary} />
          <Text style={styles.btnText}>{autoRefresh ? 'Pause' : 'Play'}</Text>
        </TouchableOpacity>
      </View>

      {/* Filter */}
      <TextInput
        style={styles.filterInput}
        placeholder="Filtrer par catégorie ou message..."
        value={filter}
        onChangeText={setFilter}
        placeholderTextColor="#999"
      />

      {/* Logs List */}
      <ScrollView style={styles.logsList}>
        {filteredLogs.length === 0 ? (
          <Text style={styles.emptyText}>Aucun log</Text>
        ) : (
          filteredLogs.map((entry, idx) => (
            <View key={idx} style={styles.logEntry}>
              <View style={styles.logHeader}>
                <Text style={[styles.category, { color: getCategoryColor(entry.category) }]}>
                  [{entry.category}]
                </Text>
                {entry.level && (
                  <Text style={[styles.level, getLevelStyle(entry.level)]}>
                    {entry.level}
                  </Text>
                )}
                <Text style={styles.timestamp}>{entry.timestamp.split('T')[1].split('.')[0]}</Text>
              </View>
              <Text style={styles.message}>{entry.message}</Text>
              {entry.data && (
                <Text style={styles.data}>{JSON.stringify(entry.data)}</Text>
              )}
              {entry.error && (
                <Text style={styles.error}>
                  Error: {entry.error.message}
                </Text>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function getCategoryColor(category) {
  const colors = {
    ROUTES: '#3b82f6',
    PLACES: '#10b981',
    STEPS: '#f59e0b',
    REFRESH: '#8b5cf6',
    RENDER: '#ec4899',
    EFFECT: '#06b6d4',
    LOGGER: '#6b7280',
  };
  return colors[category] || '#6b7280';
}

function getLevelStyle(level) {
  return {
    color: level === 'ERROR' ? '#ef4444' : level === 'WARN' ? '#f59e0b' : '#10b981',
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    ...FONTS.bold,
    fontSize: 18,
    color: COLORS.text,
  },
  subtitle: {
    ...FONTS.regular,
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: SPACING.sm,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: '#f3f4f6',
    borderRadius: RADIUS.sm,
  },
  btnActive: {
    backgroundColor: '#dbeafe',
  },
  btnText: {
    ...FONTS.regular,
    fontSize: 11,
    color: COLORS.primary,
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
    paddingVertical: SPACING.sm,
  },
  emptyText: {
    ...FONTS.regular,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
  logEntry: {
    marginVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: '#f9fafb',
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
    borderRadius: RADIUS.sm,
  },
  logHeader: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    marginBottom: 4,
  },
  category: {
    ...FONTS.bold,
    fontSize: 11,
  },
  level: {
    ...FONTS.bold,
    fontSize: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
    backgroundColor: '#fecaca',
  },
  timestamp: {
    ...FONTS.regular,
    fontSize: 10,
    color: '#999',
    marginLeft: 'auto',
  },
  message: {
    ...FONTS.regular,
    fontSize: 12,
    color: COLORS.text,
    marginBottom: 4,
  },
  data: {
    ...FONTS.regular,
    fontSize: 10,
    color: '#666',
    backgroundColor: '#fff',
    padding: SPACING.sm,
    borderRadius: RADIUS.xs,
    marginBottom: 4,
  },
  error: {
    ...FONTS.regular,
    fontSize: 10,
    color: '#dc2626',
    backgroundColor: '#fee2e2',
    padding: SPACING.sm,
    borderRadius: RADIUS.xs,
  },
});
