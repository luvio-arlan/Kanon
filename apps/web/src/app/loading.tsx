export default function CockpitLoading() {
  return (
    <div className="kanon-ambient-canvas flex h-dvh w-full overflow-hidden bg-canvas">
      <aside className="hidden h-full w-[276px] shrink-0 p-4 pr-0 lg:flex">
        <div className="kanon-surface-specular flex h-full w-full flex-col gap-4 rounded-card border border-hairline bg-sidebar p-4">
          <div className="kanon-shimmer h-8 w-32 rounded-control" />
          <div className="kanon-shimmer h-10 w-full rounded-control" />
          <div className="space-y-2 pt-2">
            {["a", "b", "c", "d", "e"].map((k) => (
              <div key={k} className="kanon-shimmer h-9 w-full rounded-control" />
            ))}
          </div>
          <div className="mt-auto space-y-2">
            <div className="kanon-shimmer h-10 w-full rounded-control" />
            <div className="kanon-shimmer h-10 w-full rounded-control" />
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-hidden px-5 pb-10 pt-5 sm:px-8 lg:px-9">
        <div className="space-y-5">
          <div className="flex items-end justify-between border-b border-hairline pb-5 pt-1">
            <div className="space-y-2.5">
              <div className="h-[1.5px] w-8 bg-accent-coral/60" />
              <div className="kanon-shimmer h-9 w-64 rounded-control" />
            </div>
            <div className="kanon-shimmer hidden h-10 w-56 rounded-control sm:block" />
          </div>
          <div className="kanon-shimmer h-12 w-full rounded-card border border-hairline bg-surface" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {["a", "b", "c", "d"].map((k) => (
              <div
                key={k}
                className="kanon-shimmer h-[132px] rounded-card border border-hairline bg-surface"
              />
            ))}
          </div>
          <div className="kanon-shimmer h-14 w-full rounded-card border border-hairline bg-surface" />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <div className="kanon-shimmer h-[340px] rounded-card border border-hairline bg-surface" />
            <div className="kanon-shimmer h-[340px] rounded-card border border-hairline bg-surface" />
          </div>
        </div>
      </main>
    </div>
  );
}
