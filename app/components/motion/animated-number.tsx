'use client'

import { useEffect } from 'react'
import { motion, useSpring, useTransform } from 'motion/react'

/** A figure that rolls to its new value instead of jumping. */
export default function AnimatedNumber({
  value,
  from,
  format,
  className,
}: {
  value: number
  /** Where to start from on first render. Defaults to the value itself (no roll). */
  from?: number
  format: (value: number) => string
  className?: string
}) {
  const spring = useSpring(from ?? value, { stiffness: 150, damping: 24 })
  // Springs creep over their last fraction; show the exact figure once that close.
  const text = useTransform(spring, (current) =>
    format(Math.abs(current - value) <= Math.abs(value) * 0.0005 ? value : current)
  )

  useEffect(() => {
    spring.set(value)
  }, [spring, value])

  return <motion.span className={className}>{text}</motion.span>
}
