import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING } from '../theme';
import client from '../api/client';

const CATEGORIES = [
  { key: null,    label: 'Tout',      icon: '📋' },
  { key: 'equipement', label: 'Équipement', icon: '🎒' },
  { key: 'sante',      label: 'Santé',      icon: '💊' },
  { key: 'courses',    label: 'Courses',    icon: '🛒' },
  { key: 'admin',      label: 'Admin',      icon: '📄' },
  { key: 'divers',     label: 'Divers',     icon: '🔧' },
];

export default function TodoListScreen({ route, navigation }) {
  const { roadtripId, roadtripTitle } = route.params;
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState('equipement');
  const [filterCat, setFilterCat] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editText, setEditText] = useState('');
  const [editCategory, setEditCategory] = useState('equipement');
  const [editModalVisible, setEditModalVisible] = useState(false);

  const fetchTodos = useCallback(async () => {
    try {
      const res = await client.get('/api/todos', { params: { roadtripId } });
      setTodos(res.data);
    } catch (err) {
      console.error('[TodoList] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [roadtripId]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  useEffect(() => {
    navigation.setOptions({ title: roadtripTitle ? `Todo — ${roadtripTitle}` : 'Todo list' });
  }, [navigation, roadtripTitle]);

  const addTodo = async () => {
    if (!newText.trim()) return;
    setAdding(true);
    try {
      const res = await client.post('/api/todos', {
        text: newText.trim(),
        roadtripId,
        category: newCategory,
      });
      setTodos((prev) => [...prev, res.data]);
      setNewText('');
    } catch (err) {
      Alert.alert('Erreur', "Impossible d'ajouter la tâche.");
    } finally {
      setAdding(false);
    }
  };

  const toggleDone = async (item) => {
    try {
      const res = await client.patch(`/api/todos/${item.id}`, { done: !item.done });
      setTodos((prev) => prev.map((t) => (t.id === item.id ? res.data : t)));
    } catch (err) {
      console.error('[TodoList] Toggle error:', err);
    }
  };

  const deleteTodo = (item) => {
    Alert.alert('Supprimer', `Supprimer « ${item.text} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          try {
            await client.delete(`/api/todos/${item.id}`);
            setTodos((prev) => prev.filter((t) => t.id !== item.id));
          } catch (err) {
            console.error('[TodoList] Delete error:', err);
          }
        },
      },
    ]);
  };

  const deleteDone = () => {
    const doneCount = filtered.filter((t) => t.done).length;
    if (doneCount === 0) return;
    Alert.alert('Tout supprimer', `Supprimer les ${doneCount} tâche(s) terminée(s) ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Tout supprimer', style: 'destructive',
        onPress: async () => {
          try {
            await client.delete('/api/todos', { params: { roadtripId } });
            setTodos((prev) => prev.filter((t) => !t.done));
          } catch (err) {
            console.error('[TodoList] Delete done error:', err);
          }
        },
      },
    ]);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setEditText(item.text);
    setEditCategory(item.category || 'equipement');
    setEditModalVisible(true);
  };

  const saveEdit = async () => {
    if (!editText.trim() || !editItem) return;
    try {
      const res = await client.patch(`/api/todos/${editItem.id}`, {
        text: editText.trim(),
        category: editCategory,
      });
      setTodos((prev) => prev.map((t) => (t.id === editItem.id ? res.data : t)));
      setEditModalVisible(false);
      setEditItem(null);
    } catch (err) {
      Alert.alert('Erreur', "Impossible de modifier la tâche.");
    }
  };

  const todoLongPress = (item) => {
    Alert.alert(item.text, 'Que veux-tu faire ?', [
      { text: 'Modifier', onPress: () => openEdit(item) },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteTodo(item) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const filtered = filterCat
    ? todos.filter((t) => t.category === filterCat)
    : todos;

  const sorted = [...filtered].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.order ?? 0) - (b.order ?? 0);
  });

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.todoItem, item.done && styles.todoItemDone]}
      onPress={() => toggleDone(item)}
      onLongPress={() => todoLongPress(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.checkbox, item.done && styles.checkboxDone]}>
        {item.done && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <View style={styles.todoContent}>
        <Text style={[styles.todoText, item.done && styles.todoTextDone]} numberOfLines={2}>
          {item.text}
        </Text>
        {item.category && (
          <Text style={styles.todoCategory}>
            {CATEGORIES.find((c) => c.key === item.category)?.icon} {item.category}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['bottom']}>
        <View style={styles.loader}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Filtres catégories */}
        <View style={styles.catRow}>
          {CATEGORIES.map((cat) => {
            const active = filterCat === cat.key;
            return (
              <TouchableOpacity
                key={cat.key ?? 'all'}
                style={[styles.catChip, active && styles.catChipActive]}
                onPress={() => setFilterCat(cat.key)}
              >
                <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
                  {cat.icon} {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Ajouter une tâche */}
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            value={newText}
            onChangeText={setNewText}
            placeholder="Nouvelle tâche…"
            placeholderTextColor={COLORS.textDim}
            onSubmitEditing={addTodo}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addBtn} onPress={addTodo} disabled={adding || !newText.trim()}>
            {adding ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.addBtnText}>+</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Catégorie pour la nouvelle tâche */}
        <View style={styles.catPickerRow}>
          {CATEGORIES.filter((c) => c.key).map((cat) => {
            const active = newCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.catPickerChip, active && styles.catPickerChipActive]}
                onPress={() => setNewCategory(cat.key)}
              >
                <Text style={styles.catPickerText}>{cat.icon}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Compteur + suppression des faites */}
        {todos.length > 0 && (
          <View style={styles.counterRow}>
            <Text style={styles.counterText}>
              {todos.filter((t) => !t.done).length}/{todos.length} ouvertes
            </Text>
            {todos.some((t) => t.done) && (
              <TouchableOpacity onPress={deleteDone}>
                <Text style={styles.clearDone}>Supprimer les faites</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Liste */}
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {filterCat ? 'Aucune tâche dans cette catégorie' : 'Aucune tâche pour ce roadtrip'}
              </Text>
            </View>
          }
        />

        {/* ─── MODAL ÉDITION ──────────────────────────────────────────── */}
        <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setEditModalVisible(false)}>
            <Pressable style={styles.modalSheet} onPress={() => {}}>
              <Text style={styles.modalTitle}>Modifier la tâche</Text>

              <TextInput
                style={styles.modalInput}
                value={editText}
                onChangeText={setEditText}
                placeholder="Nom de la tâche"
                placeholderTextColor={COLORS.textDim}
              />

              <Text style={styles.modalLabel}>Catégorie</Text>
              <View style={styles.modalCatRow}>
                {CATEGORIES.filter((c) => c.key).map((cat) => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[styles.catPickerChip, editCategory === cat.key && styles.catPickerChipActive]}
                    onPress={() => setEditCategory(cat.key)}
                  >
                    <Text style={styles.catPickerText}>{cat.icon}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditModalVisible(false)}>
                  <Text style={styles.modalCancelText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={saveEdit}>
                  <Text style={styles.modalSaveText}>Enregistrer</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  catRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.md,
  },
  catChip: {
    paddingHorizontal: SPACING.sm + 2, paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  catChipActive: { backgroundColor: COLORS.accentDim, borderColor: COLORS.accent },
  catChipText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  catChipTextActive: { color: COLORS.accent },
  addRow: { flexDirection: 'row', margin: SPACING.md, gap: SPACING.sm },
  addInput: {
    flex: 1, backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    padding: SPACING.md, color: COLORS.text, fontSize: 15,
  },
  addBtn: {
    width: 48, height: 48, borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 24, fontWeight: '700', lineHeight: 26 },
  catPickerRow: {
    flexDirection: 'row', gap: SPACING.xs,
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
  },
  catPickerChip: {
    paddingHorizontal: SPACING.sm + 2, paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  catPickerChipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentDim },
  catPickerText: { fontSize: 14 },
  counterRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
  },
  counterText: { color: COLORS.textMuted, fontSize: 12 },
  clearDone: { color: COLORS.error, fontSize: 12, fontWeight: '600' },
  list: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xxl },
  todoItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.sm, gap: SPACING.sm,
  },
  todoItemDone: { opacity: 0.5 },
  checkbox: {
    width: 24, height: 24, borderRadius: RADIUS.sm,
    borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  todoContent: { flex: 1 },
  todoText: { color: COLORS.text, fontSize: 15, lineHeight: 20 },
  todoTextDone: { textDecorationLine: 'line-through', color: COLORS.textMuted },
  todoCategory: { color: COLORS.textDim, fontSize: 11, marginTop: 4 },
  empty: { paddingVertical: SPACING.xxl, alignItems: 'center' },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },

  // Modal édition
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: SPACING.lg },
  modalSheet: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700', marginBottom: SPACING.md },
  modalInput: {
    backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, padding: SPACING.md, color: COLORS.text, fontSize: 15,
    marginBottom: SPACING.md,
  },
  modalLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 1 },
  modalCatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.lg },
  modalActions: { flexDirection: 'row', gap: SPACING.sm },
  modalCancelBtn: { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center', backgroundColor: COLORS.surfaceElevated },
  modalCancelText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '600' },
  modalSaveBtn: { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center', backgroundColor: COLORS.accent },
  modalSaveText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
