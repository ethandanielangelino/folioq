'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { askAssistant } from '@/app/components/portfolio/ask'

/**
 * Asks the assistant a question that came in with the link (`?ask=…`, sent
 * from the home page), once, then clears it from the address so a reload
 * doesn't ask again.
 */
export default function AskOnArrival({ question }: { question: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const asked = useRef(false)

  useEffect(() => {
    // Wait a frame so the assistant panel is listening before the question is sent.
    // The check lives inside the frame: React may run this effect twice in
    // development, cancelling the first frame, and the question must still go once.
    const frame = requestAnimationFrame(() => {
      if (asked.current) return
      asked.current = true
      askAssistant(question)
      router.replace(`${pathname}#assistant`, { scroll: false })
    })
    return () => cancelAnimationFrame(frame)
  }, [question, pathname, router])

  return null
}
