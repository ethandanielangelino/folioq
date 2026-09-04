import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-black/[.08] bg-white p-8 shadow-sm dark:border-white/[.08] dark:bg-zinc-900">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/FolioQ-logo.png"
            alt="FolioQ"
            width={44}
            height={44}
            className="h-11 w-11 rounded-xl"
            priority
          />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Welcome to FolioQ
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Sign in to your account to continue
          </p>
        </div>

        <button
          type="button"
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-full border border-black/[.08] bg-white px-5 py-3 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.66Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.88-3.02c-1.08.72-2.45 1.15-4.05 1.15-3.11 0-5.75-2.1-6.69-4.93H1.3v3.11A12 12 0 0 0 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.31 14.3a7.2 7.2 0 0 1 0-4.6V6.59H1.3a12 12 0 0 0 0 10.82l4.01-3.11Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.3 6.59l4.01 3.11C6.25 6.87 8.89 4.77 12 4.77Z"
            />
          </svg>
          Continue with Google
        </button>

        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
          By continuing, you agree to our Terms of Service and Privacy
          Policy.
        </p>
      </div>
    </div>
  );
}
