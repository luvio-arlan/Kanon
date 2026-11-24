export default function CockpitLoading() {
  return (
    <div className="kanon-ambient-canvas min-h-dvh">
      <div className="h-16 border-b border-hairline bg-canvas/90" />
      <main className="mx-auto max-w-6xl px-6 pb-14 pt-10 sm:px-10">
        <div className="kanon-shimmer h-3.5 w-52 rounded-pill" />
        <div className="kanon-shimmer mt-2.5 h-9 w-80 rounded-control" />
        <div className="mt-6 grid grid-cols-2 divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-surface shadow-card sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {["a", "b", "c", "d"].map((k) => (
            <div key={k} className="space-y-2 px-5 py-4">
              <div className="kanon-shimmer h-3 w-24 rounded-pill" />
              <div className="kanon-shimmer h-6 w-20 rounded-control" />
            </div>
          ))}
        </div>
        <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-2">
          <div className="kanon-shimmer h-80 rounded-card border border-hairline bg-surface" />
          <div className="kanon-shimmer h-80 rounded-card border border-hairline bg-surface" />
        </div>
      </main>
    </div>
  );
}
