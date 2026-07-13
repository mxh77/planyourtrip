import { motion } from "framer-motion"
import {
  Map, Route, ListTodo, AlertTriangle, Tent,
  BarChart3, Sparkles, ChevronLeft,
} from "lucide-react"
import { useUIStore } from "../../store/uiStore"
import { useItineraryStore } from "../../store/itineraryStore"

type NavItem = {
  id: string
  label: string
  icon: React.ReactNode
  action: () => void
  badge?: number | null
}

export default function MobileBottomNav() {
  const { sidePanel, setSidePanel, activePanel, setActivePanel, openModal, toggleSidebar, isSidebarOpen } = useUIStore()
  const { currentItinerary } = useItineraryStore()

  // Mock check results for badge
  const checkErrors = 0
  const filterCount = 0

  const navItems: NavItem[] = [
    {
      id: "map",
      label: "Carte",
      icon: <Map className="w-5 h-5" />,
      action: () => { setActivePanel("itinerary"); setSidePanel("none"); if (isSidebarOpen) toggleSidebar() },
    },
    {
      id: "steps",
      label: "Étapes",
      icon: <ChevronLeft className="w-5 h-5" />,
      action: () => { if (!isSidebarOpen) toggleSidebar() },
    },
    {
      id: "ai",
      label: "IA",
      icon: <Sparkles className="w-5 h-5" />,
      action: () => setSidePanel(sidePanel === "chat" ? "none" : "chat"),
    },
    {
      id: "summary",
      label: "Résumé",
      icon: <BarChart3 className="w-5 h-5" />,
      action: () => setSidePanel(sidePanel === "summary" ? "none" : "summary"),
    },
    {
      id: "checklist",
      label: "Vérif",
      icon: <AlertTriangle className="w-5 h-5" />,
      action: () => currentItinerary ? setSidePanel(sidePanel === "checklist" ? "none" : "checklist") : null,
      badge: checkErrors > 0 ? checkErrors : null,
    },
  ]

  const isActive = (id: string) => {
    if (id === "map") return !isSidebarOpen && sidePanel === "none"
    if (id === "steps") return isSidebarOpen
    if (id === "ai") return sidePanel === "chat"
    if (id === "summary") return sidePanel === "summary"
    if (id === "checklist") return sidePanel === "checklist"
    return false
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden">
      <div className="flex-1 flex items-center justify-around bg-card border-t border-border/50 px-2 py-1.5 safe-area-bottom">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={item.action}
            className={`relative flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors min-w-0 ${
              isActive(item.id)
                ? "text-accent"
                : "text-muted hover:text-slate-200"
            }`}
          >
            {item.icon}
            <span className="text-[10px] font-medium leading-tight">{item.label}</span>
            {item.badge != null && item.badge > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  )
}
