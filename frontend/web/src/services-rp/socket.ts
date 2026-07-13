import { io, Socket } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_API_URL || ''

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL || '/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socket.on('connect', () => {
      console.log('[socket] connecté', socket?.id)
    })
    socket.on('disconnect', reason => {
      console.log('[socket] déconnecté:', reason)
    })
    socket.on('connect_error', err => {
      console.error('[socket] erreur connexion:', err.message)
    })
  }
  return socket
}

export function joinItineraryRoom(itineraryId: string) {
  getSocket().emit('join:itinerary', itineraryId)
}

export function leaveItineraryRoom(itineraryId: string) {
  getSocket().emit('leave:itinerary', itineraryId)
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}