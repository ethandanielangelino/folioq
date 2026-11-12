'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Check } from 'lucide-react'

type Toast = { id: number; message: string }

const ToastContext = createContext<(message: string) => void>(() => {})

/** Call the returned function with a short confirmation, e.g. toast('Thesis saved'). */
export function useToast() {
  return useContext(ToastContext)
}

const LIFETIME_MS = 3200

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const toast = useCallback((message: string) => {
    const id = nextId.current++
    setToasts((current) => [...current.slice(-2), { id, message }])
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), LIFETIME_MS)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-toast-in pointer-events-auto flex items-center gap-2.5 rounded-full bg-black py-2.5 pr-5 pl-3.5 text-sm font-medium text-white shadow-lg shadow-black/20 dark:bg-white dark:text-black"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-mint-400 text-black">
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
