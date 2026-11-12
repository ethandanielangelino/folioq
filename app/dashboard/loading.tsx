export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-6">
      <div className="h-10 w-64 rounded-xl bg-black/[.06] dark:bg-white/[.08]" />
      <div className="h-36 rounded-3xl bg-black/[.04] dark:bg-white/[.05]" />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="h-56 rounded-3xl bg-black/[.04] dark:bg-white/[.05]" />
        <div className="h-56 rounded-3xl bg-black/[.04] dark:bg-white/[.05]" />
      </div>
    </div>
  )
}
