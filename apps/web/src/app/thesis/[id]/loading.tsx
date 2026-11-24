export default function ThesisCanvasLoading() {
  return (
    <div className="kanon-ambient-canvas min-h-dvh">
      <div className="h-14 border-b border-hairline bg-canvas/90" />
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-8 sm:px-10 lg:grid-cols-[216px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="kanon-shimmer h-12 rounded-control" />
          <div className="kanon-shimmer h-44 rounded-control border border-hairline bg-surface" />
          <div className="kanon-shimmer h-28 rounded-control border border-hairline bg-surface" />
        </div>
        <div className="space-y-6">
          <div className="kanon-shimmer h-64 rounded-card border border-hairline bg-surface" />
          <div className="kanon-shimmer h-48 rounded-card border border-hairline bg-surface" />
        </div>
      </main>
    </div>
  );
}
