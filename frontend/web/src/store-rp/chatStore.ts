import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ChatMessage } from '../types'
import { aiApi } from '../services/api'

interface ChatState {
  messages: ChatMessage[]
  isOpen: boolean
  isStreaming: boolean
  streamingContent: string   // contenu partiel en cours d'arrivée
  error: string | null
  itineraryId: string | null // itinéraire contextualisé

  // Actions
  open:  () => void
  close: () => void
  toggle: () => void
  setItineraryId: (id: string | null) => void
  sendMessage: (content: string, model?: string, preferences?: object) => Promise<void>
  loadHistory: (itineraryId: string) => Promise<void>
  clearHistory: () => Promise<void>
  addMessage: (msg: ChatMessage) => void
  clearMessages: () => void
}

let msgCounter = 0
const tempId = () => `tmp-${++msgCounter}-${Date.now()}`

export const useChatStore = create<ChatState>()(
  devtools(
    (set, get) => ({
      messages: [],
      isOpen: false,
      isStreaming: false,
      streamingContent: '',
      error: null,
      itineraryId: null,

      open:   () => set({ isOpen: true }),
      close:  () => set({ isOpen: false }),
      toggle: () => set(s => ({ isOpen: !s.isOpen })),

      setItineraryId: (id) => set({ itineraryId: id }),

      sendMessage: async (content, model, preferences) => {
        const { itineraryId } = get()

        // Ajoute le message utilisateur immédiatement
        const userMsg: ChatMessage = {
          id: tempId(),
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
          itineraryId: itineraryId ?? undefined,
        }
        set(s => ({ messages: [...s.messages, userMsg], error: null }))

        // Placeholder assistant en streaming
        const assistantId = tempId()
        const assistantPlaceholder: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          isStreaming: true,
        }
        set(s => ({ messages: [...s.messages, assistantPlaceholder], isStreaming: true, streamingContent: '' }))

        try {
          const response = await aiApi.chatStream(content, itineraryId ?? undefined, model, preferences)
          if (!response.body) throw new Error('Pas de body SSE')

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let accumulated = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.type === 'error') throw new Error(parsed.error || 'Erreur IA')
                const text = parsed.delta ?? parsed.content ?? null
                if (text) {
                  accumulated += text
                  set(s => ({
                    streamingContent: accumulated,
                    messages: s.messages.map(m =>
                      m.id === assistantId ? { ...m, content: accumulated } : m
                    ),
                  }))
                }
              } catch (e) {
                if (e instanceof Error && e.message !== '') throw e
              }
            }
          }

          // Finalise le message
          set(s => ({
            isStreaming: false,
            streamingContent: '',
            messages: s.messages.map(m =>
              m.id === assistantId ? { ...m, content: accumulated || m.content, isStreaming: false } : m
            ),
          }))
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Erreur de communication'
          set(s => ({
            isStreaming: false,
            streamingContent: '',
            error: msg,
            messages: s.messages.filter(m => m.id !== assistantId),
          }))
        }
      },

      loadHistory: async (itineraryId) => {
        try {
          const data = await aiApi.chatHistory(itineraryId)
          set({ messages: data.messages ?? [], itineraryId })
        } catch { /* silently fail */ }
      },

      clearHistory: async () => {
        const { itineraryId } = get()
        if (itineraryId) await aiApi.clearHistory(itineraryId)
        set({ messages: [] })
      },

      addMessage: (msg) => set(s => ({ messages: [...s.messages, msg] })),
      clearMessages: () => set({ messages: [] }),
    })
  )
)
