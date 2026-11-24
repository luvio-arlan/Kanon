export default function ThesisCanvasLoading() {
  return (
    <div className="kanon-ambient-canvas min-h-dvh">
      <div className="h-14 border-b border-hairline bg-canvas/85" />
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-8 sm:px-10 lg:grid-cols-[216px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="h-12 animate-pulse rounded-control bg-titanium-subtle" />
          <div className="h-44 animate-pulse rounded-control bg-surface" />
        </div>
        <div className="space-y-6">
          <div className="h-64 animate-pulse rounded-card border border-hairline bg-surface" />
          <div className="h-48 animate-pulse rounded-card border border-hairline bg-surface" />
        </div>
      </main>
    </div>
  );
}
