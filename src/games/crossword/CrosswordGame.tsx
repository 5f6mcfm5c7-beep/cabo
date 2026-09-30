type CrosswordGameProps = {
  onBack: () => void
}

function CrosswordGame({ onBack }: CrosswordGameProps) {
  return (
    <main className="page">
      <section className="card hero">
        <button className="backButton" onClick={onBack}>
          ← Zurück zur Spielekiste
        </button>

        <p className="eyebrow">Online-Coop</p>
        <h1>Kreuzworträtsel 🧩</h1>
        <p className="subtitle">
          Löst gemeinsam ein Kreuzworträtsel.
        </p>
      </section>
    </main>
  )
}

export default CrosswordGame