/**
 * Frames a piece of real product UI on a public page and says plainly that
 * the numbers in it are made up.
 */
export default function Specimen({
  caption,
  children,
}: {
  caption: string
  children: React.ReactNode
}) {
  return (
    <figure className="mt-8">
      {children}
      <figcaption className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        {caption} Sample data — the fund and its prices are invented.
      </figcaption>
    </figure>
  )
}
