import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Send, Loader2, Trash2, Sparkles,
  RotateCcw, ChevronDown, Bot, User,
} from 'lucide-react'
import { useChatStore } from '../../store/chatStore'
import { useItineraryStore } from '../../store/itineraryStore'
import toast from 'react-hot-toast'

const QUICK_PROMPTS = [
  'Suggère-moi des campings pour cette étape',
  'Quelles randonnées à faire ici ?',
  'Optimise mon itinéraire',
  'Donne-moi des activités pour familles',
  'Quel est le meilleur moment pour partir ?',
]

const AI_MODELS = [
  { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', badge: 'DeepSeek' },
  { value: 'gpt-4.1', label: 'GPT-4.1', badge: 'OpenAI' },
]

export default function ChatBot() {
  const [input, setInput] = useState('')
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0].value)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { messages, isStreaming, error, sendMessage, clearHistory, loadHistory } = useChatStore()
  const { currentItinerary } = useItineraryStore()

  // Charger l'historique quand l'itinéraire change
  useEffect(() => {
    if (currentItinerary) {
      loadHistory(currentItinerary.id)
    }
  }, [currentItinerary?.id, loadHistory])

  // Auto-scroll vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    await sendMessage(text, selectedModel)
  }, [input, isStreaming, sendMessage, selectedModel])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClearHistory = async () => {
    if (!confirm('Vider l\'historique du chat ?')) return
    await clearHistory()
    toast.success('Historique vidé')
  }

  return (
    <div className="h-full flex flex-col bg-surface-900 border-l border-border/50 overflow-hidden">
      {/* Header */}
      <div className="panel-header shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-slate-100">Assistant IA</h2>
            {currentItinerary && (
              <p className="text-[10px] text-muted truncate max-w-[150px]">{currentItinerary.name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Sélecteur de modèle */}
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            disabled={isStreaming}
            className="text-[10px] bg-slate-800 border border-border/50 rounded-md px-1.5 py-0.5
                       text-slate-300 cursor-pointer hover:border-accent/40 focus:outline-none
                       focus:border-accent/60 disabled:opacity-40 transition-colors"
            title="Modèle IA"
          >
            {AI_MODELS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <button onClick={handleClearHistory} className="btn-icon text-muted hover:text-red-400" title="Vider l'historique">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 pb-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-accent/60" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-300">Comment puis-je vous aider ?</p>
              <p className="text-xs text-muted mt-1">Posez vos questions sur votre road trip</p>
            </div>
            <div className="w-full space-y-1.5 pt-2">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => { setInput(p); inputRef.current?.focus() }}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg
                             bg-slate-800/50 hover:bg-slate-800 border border-border/30
                             hover:border-accent/30 text-slate-300 transition-all duration-150"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5
                ${msg.role === 'user' ? 'bg-primary/20' : 'bg-accent/20'}`}
              >
                {msg.role === 'user'
                  ? <User className="w-3 h-3 text-primary" />
                  : <Bot className="w-3 h-3 text-accent" />
                }
              </div>

              {/* Bulle */}
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm
                  ${msg.role === 'user'
                    ? 'bg-primary/20 text-slate-100 rounded-tr-sm'
                    : 'bg-card border border-border/40 text-slate-200 rounded-tl-sm'
                  }`}
              >
                {msg.role === 'assistant' ? (
                  <>
                    <div className="chat-prose">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content || (msg.isStreaming ? '▍' : '')}
                      </ReactMarkdown>
                    </div>
                    {msg.isStreaming && (
                      <span className="inline-block w-1.5 h-3.5 bg-accent/80 rounded-sm ml-0.5 animate-pulse" />
                    )}
                  </>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
              <Bot className="w-3 h-3 text-accent" />
            </div>
            <div className="card border-border/40 px-3 py-2 rounded-2xl rounded-tl-sm">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 bg-accent/60 rounded-full"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions rapides */}
      {messages.length > 0 && (
        <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto shrink-0 scrollbar-hide">
          {QUICK_PROMPTS.slice(0, 3).map(p => (
            <button
              key={p}
              onClick={() => { setInput(p); inputRef.current?.focus() }}
              className="shrink-0 text-[11px] px-2.5 py-1 rounded-full
                         bg-slate-800 border border-border/30 text-muted
                         hover:border-accent/30 hover:text-slate-300 transition-all"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Zone de saisie */}
      <div className="px-3 pb-3 shrink-0">
        <div className="flex items-end gap-2 bg-slate-800 rounded-2xl border border-border/50 focus-within:border-accent/40 transition-colors px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Posez une question…"
            rows={1}
            disabled={isStreaming}
            style={{ resize: 'none', maxHeight: '120px', overflowY: 'auto' }}
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500
                       focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                       bg-accent text-slate-900 hover:bg-accent-hover
                       disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isStreaming
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Send className="w-3.5 h-3.5" />
            }
          </button>
        </div>
        <p className="text-[10px] text-muted/50 text-center mt-1.5">
          Entrée pour envoyer · Maj+Entrée pour saut de ligne
        </p>
      </div>
    </div>
  )
}
