'use client'

import { useEffect, useSyncExternalStore } from 'react'
import {
  motion,
  useAnimationControls,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react'

const FINE_POINTER = '(hover: hover) and (pointer: fine)'

/** True on devices with a mouse or trackpad. Touch screens keep their normal scrolling. */
function useFinePointer(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(FINE_POINTER)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia(FINE_POINTER).matches,
    () => false
  )
}

/**
 * Makes whatever is inside feel like a physical object on the page:
 *
 * - it shakes briefly when the pointer arrives (and once when it scrolls into view)
 * - it leans toward the pointer while hovered
 * - with `draggable`, it can be picked up and springs back when let go
 * - with `float`, it bobs gently while idle
 *
 * All of it switches off when the device asks for reduced motion.
 */
export default function Wiggle({
  children,
  className = '',
  draggable = false,
  tilt = 5,
  float = 0,
  floatDelay = 0,
  shake: shakeAmount = 1,
  shakeOnView = false,
  onTap,
}: {
  children: React.ReactNode
  /** Positioning classes for the outermost element. */
  className?: string
  draggable?: boolean
  /** Maximum lean toward the pointer, in degrees. 0 turns it off. */
  tilt?: number
  /** Idle bob distance in pixels. 0 turns it off. */
  float?: number
  floatDelay?: number
  /** How hard it shakes on hover. 1 is the full wiggle, 0 turns it off. */
  shake?: number
  /** Shake once when scrolled into view, for devices that can't hover. */
  shakeOnView?: boolean
  onTap?: () => void
}) {
  const reduceMotion = useReducedMotion()
  const finePointer = useFinePointer()
  const controls = useAnimationControls()

  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const spring = { stiffness: 220, damping: 18, mass: 0.6 }
  const rotateY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-tilt, tilt]), spring)
  const rotateX = useSpring(useTransform(pointerY, [-0.5, 0.5], [tilt, -tilt]), spring)

  const canDrag = draggable && finePointer

  function shake() {
    if (reduceMotion || shakeAmount === 0) return
    controls.start({
      rotate: [0, -2.6, 2.1, -1.4, 0.8, 0].map((degrees) => degrees * shakeAmount),
      transition: { duration: 0.6, ease: 'easeInOut' },
    })
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (reduceMotion || !finePointer || tilt === 0) return
    const box = event.currentTarget.getBoundingClientRect()
    pointerX.set((event.clientX - box.left) / box.width - 0.5)
    pointerY.set((event.clientY - box.top) / box.height - 0.5)
  }

  function onPointerLeave() {
    pointerX.set(0)
    pointerY.set(0)
  }

  // Stop any shake that's mid-flight if the component goes away.
  useEffect(() => () => controls.stop(), [controls])

  return (
    <motion.div
      className={className}
      animate={float > 0 && !reduceMotion ? { y: [0, -float, 0] } : undefined}
      transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: floatDelay }}
    >
      <motion.div
        animate={controls}
        drag={canDrag}
        dragSnapToOrigin
        dragElastic={0.18}
        dragTransition={{ bounceStiffness: 340, bounceDamping: 15 }}
        whileDrag={{ scale: 1.04 }}
        onHoverStart={shake}
        onTap={onTap}
        onViewportEnter={shakeOnView ? shake : undefined}
        viewport={{ once: true, amount: 0.6 }}
        className={canDrag ? 'cursor-grab active:cursor-grabbing' : undefined}
        style={{ touchAction: canDrag ? 'none' : undefined }}
      >
        <motion.div
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          style={{ rotateX, rotateY, transformPerspective: 900 }}
        >
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
