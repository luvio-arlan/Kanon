export default function ThesisCanvasLoading() {
  return (
    <div className="kanon-ambient-canvas flex h-dvh w-full overflow-hidden bg-canvas">
      <aside className="hidden h-full w-[276px] shrink-0 p-4 pr-0 lg:flex">
        <div className="kanon-surface-specular flex h-full w-full flex-col gap-4 rounded-card border border-hairline bg-sidebar p-4">
          <div className="kanon-shimmer h-9 w-full rounded-control" />
          <div className="kanon-shimmer h-14 w-full rounded-panel" />
          <div className="space-y-2 pt-2">
            {["s1", "s2", "s3", "s4", "s5"].map((k) => (
              <div key={k} className="kanon-shimmer h-10 w-full rounded-control" />
            ))}
          </div>
          <div className="mt-auto kanon-shimmer h-10 w-full rounded-control" />
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-hidden px-5 pb-10 pt-5 sm:px-8 lg:px-10">
        <div className="max-w-[1440px] space-y-6">
          <div className="kanon-shimmer h-12 w-full rounded-card border border-hairline bg-surface" />
          <div className="kanon-shimmer h-64 w-full rounded-card border border-hairline bg-surface" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {["c1", "c2", "c3"].map((k) => (
              <div
                key={k}
                className="kanon-shimmer h-64 rounded-card border border-hairline bg-surface"
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
