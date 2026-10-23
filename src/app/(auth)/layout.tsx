import { APP_NAME } from "@/lib/app-config";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <aside className="hidden w-[42%] flex-col justify-between bg-rail p-12 text-rail-foreground lg:flex">
        <div className="flex items-center gap-3 text-xl font-medium">
          <span className="flex size-10 items-center justify-center rounded-md bg-white/15 font-bold">
            {APP_NAME.slice(0, 1)}
          </span>
          {APP_NAME}
        </div>
        <div className="flex max-w-md flex-col gap-4">
          <p className="text-3xl leading-tight font-light">
            Préparez, exécutez et tracez vos interventions terrain.
          </p>
          <p className="text-sm text-white/70">Flows · Formulaires · Signatures · Documents</p>
        </div>
      </aside>
      <main className="flex flex-1 items-center justify-center bg-muted p-6">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
