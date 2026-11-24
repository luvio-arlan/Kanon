export default function CockpitLoading() {
  return (
    <div className="kanon-ambient-canvas min-h-dvh">
      <div className="h-16 border-b border-hairline bg-canvas/85" />
      <main className="mx-auto max-w-6xl px-6 pb-14 pt-10 sm:px-10">
        <div className="h-9 w-80 animate-pulse rounded-control bg-titanium-subtle" />
        <div className="mt-6 h-20 w-full animate-pulse rounded-card border border-hairline bg-surface" />
        <div className="mt-8 grid grid-cols-1 gap-7 lg:grid-cols-2">
          <div className="h-80 animate-pulse rounded-card border border-hairline bg-surface" />
          <div className="h-80 animate-pulse rounded-card border border-hairline bg-surface" />
        </div>
      </main>
    </div>
  );
}
