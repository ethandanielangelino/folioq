import { Trash2 } from 'lucide-react'

/**
 * A remove or delete control: a bin icon that opens out to show its label
 * and turns red when pointed at or focused. The label is always available to
 * screen readers, and on touch screens the bin alone is shown.
 *
 * `binButton` styles any button or trigger; put <BinFace> inside it.
 */
export const binButton =
  'group/bin inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full px-2.5 text-sm font-medium text-zinc-500 transition-[background-color,color] duration-200 ease-out hover:bg-red-50 hover:text-red-600 focus-visible:bg-red-50 focus-visible:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-red-500/15 dark:hover:text-red-400 dark:focus-visible:bg-red-500/15 dark:focus-visible:text-red-400'

export function BinFace({ label }: { label: string }) {
  return (
    <>
      <Trash2
        aria-hidden="true"
        className="h-4 w-4 shrink-0 transition-transform duration-200 ease-out group-hover/bin:-rotate-8 group-focus-visible/bin:-rotate-8"
      />
      {/* Opens from nothing to the label's own width: no guessed sizes, no jump. */}
      <span
        aria-hidden="true"
        className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-250 ease-[cubic-bezier(0.22,0.8,0.24,1)] group-hover/bin:grid-cols-[1fr] group-focus-visible/bin:grid-cols-[1fr]"
      >
        <span className="overflow-hidden whitespace-nowrap">
          <span className="pl-1.5">{label}</span>
        </span>
      </span>
    </>
  )
}

/** A plain bin button, for actions that aren't dialog triggers. */
export default function BinButton({
  label,
  description,
  onClick,
  disabled = false,
  className = '',
}: {
  /** The word or two shown when it opens. */
  label: string
  /** The fuller sentence screen readers hear and the tooltip shows, if the label alone is too short. */
  description?: string
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={description ?? label}
      title={description ?? label}
      className={`${binButton} ${className}`}
    >
      <BinFace label={label} />
    </button>
  )
}
