// Shown the moment you tap a tab or link, while the next screen loads.
export default function Loading() {
  return (
    <div className="stack" style={{ gap: 14 }} aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ width: 120, height: 12 }} />
      <div className="skeleton" style={{ width: 180, height: 28 }} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="card" style={{ gap: 10 }}>
          <div className="skeleton" style={{ width: "70%", height: 16 }} />
          <div className="skeleton" style={{ width: "45%", height: 12 }} />
          <div className="row">
            <div className="skeleton" style={{ width: 64, height: 30 }} />
            <div className="skeleton" style={{ width: 72, height: 30 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
