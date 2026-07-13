import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckSquare, Square, Plus, Trash2, Edit3, X, AlertTriangle, ListTodo, ChevronDown } from 'lucide-react'
import { useTodoStore } from '../../store/todoStore'

const CAT_LABELS: Record<string, string> = {
  equipement: 'Equipement',
  courses: 'Courses',
  admin: 'Admin',
  divers: 'Divers',
}
const CAT_COLORS: Record<string, string> = {
  equipement: 'border-l-blue-500',
  courses: 'border-l-green-500',
  admin: 'border-l-purple-500',
  divers: 'border-l-slate-500',
}
const CAT_BADGE: Record<string, string> = {
  equipement: 'text-blue-400 bg-blue-500/15',
  courses: 'text-green-400 bg-green-500/15',
  admin: 'text-purple-400 bg-purple-500/15',
  divers: 'text-slate-400 bg-slate-500/15',
}
const PRIO_ICON = {
  0: null,
  1: <AlertTriangle className="w-3 h-3 text-yellow-400" />,
  2: <AlertTriangle className="w-3 h-3 text-red-400" />,
}

export default function TodoPanel() {
  const { items, isLoading, load, add, toggle, update, remove, clearDone, isSaving } = useTodoStore()
  const [newText, setNewText] = useState('')
  const [newCat, setNewCat] = useState('divers')
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [showClear, setShowClear] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all')
  const [showCatPicker, setShowCatPicker] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [load])
  useEffect(() => { if (editId) editRef.current?.focus() }, [editId])

  const handleAdd = () => {
    const t = newText.trim()
    if (!t || isSaving) return
    add(t, newCat)
    setNewText('')
    inputRef.current?.focus()
  }

  const doneCount = items.filter(i => i.done).length
  const total = items.length
  const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0

  const filtered = items.filter(i => {
    if (filter === 'active') return !i.done
    if (filter === 'done') return i.done
    return true
  })

  return (
    <div className="h-full flex flex-col bg-surface-900 border-l border-border/50 overflow-hidden">
      {/* Header */}
      <div className="panel-header shrink-0">
        <h2 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-accent" />
          To-Do List
        </h2>
        {total > 0 && <span className="badge badge-primary text-[10px]">{doneCount}/{total}</span>}
      </div>

      {/* Progress */}
      {total > 0 && (
        <div className="px-3 pt-2 pb-1 shrink-0">
          <div className="w-full h-1.5 bg-border/30 rounded-full overflow-hidden">
            <motion.div className="h-full bg-accent rounded-full" initial={{ width: 0 }} animate={{ width: progress + '%' }} transition={{ duration: 0.5 }} />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-1 px-3 py-1.5 shrink-0 border-b border-border/20">
        {(['all', 'active', 'done'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={"text-[10px] px-2 py-1 rounded-md transition-colors " + (filter === f ? 'bg-accent/20 text-accent font-medium' : 'text-muted hover:text-slate-300')}>
            {f === 'all' ? 'Toutes' : f === 'active' ? 'A faire' : 'Faites'}
          </button>
        ))}
        <div className="flex-1" />
        {doneCount > 0 && (
          <button onClick={() => setShowClear(true)} className="text-[10px] px-2 py-1 text-red-400 hover:bg-red-500/10 rounded-md transition-colors" title="Supprimer les faites">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Add task bar */}
      <div className="px-3 py-2 shrink-0">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input ref={inputRef} value={newText} onChange={e => setNewText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Ajouter une tache..." className="input text-xs pr-8" />
            {newText && (
              <button onClick={() => setNewText('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-slate-300">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setShowCatPicker(v => !v)} className="btn-ghost p-1.5 text-[10px] text-muted hover:text-accent" title="Categorie">
              {newCat ? CAT_LABELS[newCat]?.charAt(0) : <ChevronDown className="w-3 h-3" />}
            </button>
            <AnimatePresence>
              {showCatPicker && (
                <motion.div initial={{ opacity: 0, y: -4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.95 }}
                  className="absolute top-full right-0 mt-1 card p-1 shadow-xl z-10 min-w-[120px]">
                  {['equipement','courses','admin','divers'].map(c => (
                    <button key={c} onClick={() => { setNewCat(c); setShowCatPicker(false) }}
                      className={"w-full text-[11px] text-left px-2 py-1.5 rounded-md " + (newCat === c ? 'bg-accent/15 text-accent' : 'text-slate-300 hover:bg-border/20')}>
                      {CAT_LABELS[c]}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button onClick={handleAdd} disabled={!newText.trim() || isSaving} className="btn-primary p-1.5 disabled:opacity-40" title="Ajouter">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-2 space-y-0.5">
        {isLoading ? (
          <div className="flex items-center justify-center h-20"><span className="w-5 h-5 border border-muted border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-center">
            <ListTodo className="w-8 h-8 text-muted/30 mb-2" />
            <p className="text-xs text-muted/60">{filter === 'all' ? 'Aucune tache' : 'Aucune tache a afficher'}</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map(item => (
              <motion.div key={item.id} layout
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className={"group flex items-start gap-2 rounded-lg px-2.5 py-2 transition-colors border-l-2 " + (item.done ? 'opacity-60' : 'hover:bg-card/60') + ' ' + (item.category ? CAT_COLORS[item.category] || '' : 'border-l-transparent')}>
                <button onClick={() => toggle(item.id)} className="mt-0.5 shrink-0 transition-colors hover:text-accent">
                  {item.done ? <CheckSquare className="w-4 h-4 text-green-400" /> : <Square className="w-4 h-4 text-muted group-hover:text-slate-300" />}
                </button>
                <div className="flex-1 min-w-0">
                  {editId === item.id ? (
                    <input ref={editRef} value={editText} onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { if (editText.trim()) update(item.id, { text: editText.trim() }); setEditId(null) } if (e.key === 'Escape') setEditId(null) }}
                      onBlur={() => { if (editText.trim()) update(item.id, { text: editText.trim() }); setEditId(null) }}
                      className="input text-xs py-0.5 px-1.5 w-full" />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className={"text-xs " + (item.done ? 'line-through text-muted' : 'text-slate-200')}>{item.text}</span>
                      {PRIO_ICON[item.priority as keyof typeof PRIO_ICON]}
                    </div>
                  )}
                  {item.category && (
                    <span className={"text-[9px] px-1.5 py-0.5 rounded-full font-medium mt-0.5 inline-block " + (CAT_BADGE[item.category] || '')}>
                      {CAT_LABELS[item.category]}
                    </span>
                  )}
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!item.done && (
                    <button onClick={() => { setEditId(item.id); setEditText(item.text) }}
                      className="p-1 text-muted hover:text-slate-300 transition-colors" title="Modifier">
                      <Edit3 className="w-3 h-3" />
                    </button>
                  )}
                  <button onClick={() => remove(item.id)} className="p-1 text-muted hover:text-red-400 transition-colors" title="Supprimer">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Clear done modal */}
      <AnimatePresence>
        {showClear && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setShowClear(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="card p-4 mx-3 max-w-[260px] shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-slate-100 mb-2">Supprimer les taches faites ?</h3>
              <p className="text-xs text-muted mb-3">{doneCount} tache{doneCount > 1 ? 's' : ''} terminee{doneCount > 1 ? 's' : ''} seront supprimees.</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowClear(false)} className="btn-ghost text-xs px-3 py-1.5">Annuler</button>
                <button onClick={() => { clearDone(); setShowClear(false) }} className="btn-danger text-xs px-3 py-1.5">Supprimer</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
