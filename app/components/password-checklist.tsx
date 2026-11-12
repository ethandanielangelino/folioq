import { Check } from 'lucide-react'
import { PASSWORD_RULES } from '@/lib/credentials'

/** The password rules, each ticking off as what has been typed satisfies it. */
export default function PasswordChecklist({ password, id }: { password: string; id?: string }) {
  return (
    <ul id={id} className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password)
        return (
          <li
            key={rule.id}
            className={`flex items-center gap-2 ${
              met ? 'text-mint-800 dark:text-mint-200' : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ${
                met ? 'bg-mint-600 text-white dark:bg-mint-400 dark:text-black' : 'border border-zinc-400/70'
              }`}
            >
              {met && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
            </span>
            {rule.label}
            <span className="sr-only">{met ? ' (done)' : ' (still needed)'}</span>
          </li>
        )
      })}
    </ul>
  )
}
