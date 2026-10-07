export default function Loading() {
  return (
    <main
      id="main"
      className="shell py-12"
      aria-busy="true"
      aria-label="Loading league"
    >
      <p role="status" className="muted mb-8 text-sm">
        Loading your league…
      </p>
      <div className="h-12 w-2/3 rounded bg-white/5 motion-safe:animate-pulse" />
      <div className="mt-8 h-36 panel motion-safe:animate-pulse" />
      <div className="mt-8 h-96 panel motion-safe:animate-pulse" />
    </main>
  );
}
