// Rules for the email and password someone signs up with. Pure functions with
// no imports, so the same checks run in the browser, on the server, and under
// plain `node --test`.

export const PASSWORD_MIN = 8

export interface PasswordRule {
  id: 'length' | 'lower' | 'upper' | 'number' | 'symbol'
  label: string
  test: (password: string) => boolean
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: `At least ${PASSWORD_MIN} characters`, test: (p) => p.length >= PASSWORD_MIN },
  { id: 'lower', label: 'A lowercase letter', test: (p) => /\p{Ll}/u.test(p) },
  { id: 'upper', label: 'A capital letter', test: (p) => /\p{Lu}/u.test(p) },
  { id: 'number', label: 'A number', test: (p) => /\d/.test(p) },
  // Anything that isn't a letter, a digit, or a space.
  { id: 'symbol', label: 'A symbol, such as ! ? # or @', test: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
]

/** The rules this password still breaks. Empty means it is acceptable. */
export function passwordProblems(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password))
}

/** One sentence naming everything that is missing, or null when nothing is. */
export function passwordError(password: string): string | null {
  const missing = passwordProblems(password)
  if (missing.length === 0) return null
  return `The password still needs: ${missing.map((rule) => rule.label.toLowerCase()).join(', ')}.`
}

/**
 * Whether this is shaped like a real email address: one @, something before
 * it, and a domain with a dot and a proper ending after it. Whether the
 * mailbox exists is proven separately, by the confirmation email.
 */
export function isValidEmail(input: string): boolean {
  const email = input.trim()
  if (email.length === 0 || email.length > 254 || /\s/.test(email)) return false

  const at = email.lastIndexOf('@')
  if (at <= 0 || at !== email.indexOf('@')) return false

  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return false
  }
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false

  const labels = domain.split('.')
  if (labels.length < 2) return false
  if (!labels.every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) {
    return false
  }
  // The ending (.com, .edu, .sg) is letters only and at least two long.
  return /^[A-Za-z]{2,}$/.test(labels[labels.length - 1])
}
