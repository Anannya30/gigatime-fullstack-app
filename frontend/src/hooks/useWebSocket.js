import { useCallback, useEffect, useRef, useState } from 'react'
import { ACCESS_TOKEN_KEY } from '../api/slidesApi'

// Default to the host the page was opened from (so it works when the app is
// accessed by the server's IP/hostname, not just on the server itself); use wss
// when the page is served over https. Override with VITE_WS_BASE at build time.
const WS_BASE =
  import.meta.env.VITE_WS_BASE ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
const RECONNECT_MS = 3000

let notifSeq = 0

/**
 * Subscribes to the backend notifications WebSocket once the user is logged in
 * (an access token exists). Surfaces slide.complete / slide.failed events as
 * notifications and invokes `onSlideUpdate` so the slide list can refetch.
 *
 * @param {boolean} enabled  connect only when true (e.g. authenticated)
 * @param {Function} [onSlideUpdate]  called on slide.complete / slide.failed
 * @param {Function} [onProgress]  called on slide.progress: (slideId, progress)
 */
export function useWebSocket(enabled, onSlideUpdate, onProgress) {
  const [notifications, setNotifications] = useState([])
  const socketRef = useRef(null)
  const reconnectRef = useRef(null)
  const closedRef = useRef(false)
  // Keep the latest callbacks without forcing reconnects.
  const onUpdateRef = useRef(onSlideUpdate)
  const onProgressRef = useRef(onProgress)
  useEffect(() => {
    onUpdateRef.current = onSlideUpdate
    onProgressRef.current = onProgress
  }, [onSlideUpdate, onProgress])

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
        if (msg.type === 'slide.progress') {
          // Live tiles-processed update for an in-flight slide — no toast, just
          // drive the progress bar.
          const total = msg.tiles_total
          if (total && total > 0) {
            const done = msg.tiles_done ?? 0
            onProgressRef.current?.(msg.slide_id, {
              tilesDone: done,
              tilesTotal: total,
              pct: Math.min(100, Math.round((done / total) * 100)),
            })
          }
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
