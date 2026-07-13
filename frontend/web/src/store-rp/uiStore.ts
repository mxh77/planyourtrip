import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { PanelId, SidePanel } from '../types'

interface UIState {
  activePanel: PanelId
  sidePanel: SidePanel
  isSidebarOpen: boolean
  isMobileMapFull: boolean
  // Tailles des colonnes (en %)
  sidebarWidth: number
  chatWidth: number
  // Modale
  modalId: string | null

  setActivePanel:  (id: PanelId) => void
  setSidePanel:    (id: SidePanel) => void
  toggleSidebar:   () => void
  toggleMobileMap: () => void
  setSidebarWidth: (w: number) => void
  setChatWidth:    (w: number) => void
  openModal:  (id: string) => void
  closeModal: () => void
}

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set) => ({
        activePanel:    'itinerary',
        sidePanel:      'none',
        isSidebarOpen:  true,
        isMobileMapFull: false,
        sidebarWidth:   320,
        chatWidth:      380,
        modalId:        null,

        setActivePanel:  (id) => set({ activePanel: id }),
        setSidePanel:    (id) => set({ sidePanel: id }),
        toggleSidebar:   ()   => set(s => ({ isSidebarOpen: !s.isSidebarOpen })),
        toggleMobileMap: ()   => set(s => ({ isMobileMapFull: !s.isMobileMapFull })),
        setSidebarWidth: (w)  => set({ sidebarWidth: w }),
        setChatWidth:    (w)  => set({ chatWidth: w }),
        openModal:  (id) => set({ modalId: id }),
        closeModal: ()   => set({ modalId: null }),
      }),
      {
        name: 'roadtrip-ui',
        partialize: (s) => ({
          sidebarWidth: s.sidebarWidth,
          chatWidth:    s.chatWidth,
          isSidebarOpen: s.isSidebarOpen,
        }),
      }
    )
  )
)
