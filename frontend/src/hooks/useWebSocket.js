import { useCallback, useEffect, useRef, useState } from 'react'
import { ACCESS_TOKEN_KEY } from '../api/slidesApi'

const WS_BASE = import.meta.env.VITE_WS_BASE || 'ws://localhost/ws'
const RECONNECT_MS = 3000

let notifSeq = 0

/**
 * Subscribes to the backend notifications WebSocket once the user is logged in
 * (an access token exists). Surfaces slide.complete / slide.failed events as
 * notifications and invokes `onSlideUpdate` so the slide list can refetch.
 *
 * @param {boolean} enabled  connect only when true (e.g. authenticated)
 * @param {Function} [onSlideUpdate]  called on every slide status event
 */
export function useWebSocket(enabled, onSlideUpdate) {
  const [notifications, setNotifications] = useState([])
  const socketRef = useRef(null)
  const reconnectRef = useRef(null)
  const closedRef = useRef(false)
  // Keep the latest callback without forcing reconnects.
  const onUpdateRef = useRef(onSlideUpdate)
  useEffect(() => {
    onUpdateRef.current = onSlideUpdate
  }, [onSlideUpdate])

  useEffect(() => {
    if (!enabled) return undefined
    closedRef.current = false

    function connect() {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY)
      if (!token) return
      const ws = new WebSocket(`${WS_BASE}/notifications/?token=${token}`)
      socketRef.current = ws

      ws.onmessage = (event) => {
        let msg
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }
        if (msg.type === 'slide.complete' || msg.type === 'slide.failed') {
          notifSeq += 1
          const notification = {
            id: `n${notifSeq}`,
            slideId: msg.slide_id,
            filename: msg.filename,
            status: msg.status,
            timestamp: new Date().toISOString(),
          }
          setNotifications((prev) => [notification, ...prev])
          onUpdateRef.current?.(notification)
        }
      }

      ws.onclose = () => {
        socketRef.current = null
        if (!closedRef.current) {
          reconnectRef.current = setTimeout(connect, RECONNECT_MS)
        }
      }
      // Let onclose drive the retry on errors too.
      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      closedRef.current = true
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (socketRef.current) socketRef.current.close()
    }
  }, [enabled])

  const clearNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  return { notifications, clearNotification, unreadCount: notifications.length }
}
