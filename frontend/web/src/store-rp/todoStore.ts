import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { TodoItem } from '../types'
import { todoApi } from '../services/api'

interface TodoState {
  items: TodoItem[]
  isLoading: boolean
  isSaving: boolean
  isOpen: boolean
  load: () => Promise<void>
  add: (text: string, category?: string) => Promise<void>
  toggle: (id: string) => Promise<void>
  update: (id: string, data: {text?: string; category?: string; priority?: number}) => Promise<void>
  remove: (id: string) => Promise<void>
  clearDone: () => Promise<void>
  setIsOpen: (v: boolean) => void
}

export const useTodoStore = create<TodoState>()(
  devtools(
    (set, get) => ({
      items: [],
      isLoading: false,
      isSaving: false,
      isOpen: false,
      load: async () => {
        set({ isLoading: true })
        try {
          const data = await todoApi.list()
          set({ items: Array.isArray(data) ? data : [], isLoading: false })
        } catch { set({ isLoading: false }) }
      },
      add: async (text, category) => {
        set({ isSaving: true })
        try {
          const item = await todoApi.create({ text, category: category })
          set(s => ({ items: [...s.items, item], isSaving: false }))
        } catch { set({ isSaving: false }) }
      },
      toggle: async (id) => {
        const item = get().items.find(i => i.id === id)
        if (!item) return
        set(s => ({ items: s.items.map(i => i.id === id ? { ...i, done: !i.done } : i) }))
        try { await todoApi.update(id, { done: !item.done }) }
        catch { set(s => ({ items: s.items.map(i => i.id === id ? { ...i, done: item.done } : i) })) }
      },
      update: async (id, data) => {
        set({ isSaving: true })
        try {
          const updated = await todoApi.update(id, data)
          set(s => ({ items: s.items.map(i => i.id === id ? updated : i), isSaving: false }))
        } catch { set({ isSaving: false }) }
      },
      remove: async (id) => {
        set(s => ({ items: s.items.filter(i => i.id !== id) }))
        try { await todoApi.delete(id) }
        catch { get().load() }
      },
      clearDone: async () => {
        set(s => ({ items: s.items.filter(i => !i.done) }))
        try { await todoApi.clearDone() }
        catch { get().load() }
      },
      setIsOpen: (v) => set({ isOpen: v }),
    })
  )
)
