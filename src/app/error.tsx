"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="shell py-16">
      <div role="alert" className="panel p-8">
        <h1>Something went wrong</h1>
        <p className="muted mt-4">
          We couldn’t load the dashboard. Please try again.
        </p>
        <button type="button" className="button mt-6" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </main>
  );
}
