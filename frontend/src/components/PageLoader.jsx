const DOTS = ['#1877F2', '#34A853', '#EA4335'];

/**
 * overlay=true  → fills the parent container (position:absolute, needs parent position:relative)
 * overlay=false → inline centered block (use inside table cells, cards, etc.)
 */
export default function PageLoader({ text = 'Loading…', overlay = true }) {
  const inner = (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {DOTS.map((color, i) => (
          <div key={i} style={{
            width: 13, height: 13, borderRadius: '50%', background: color,
            animation: `xlDot 1.1s ${i * 0.18}s ease-in-out infinite`,
          }} />
        ))}
      </div>
      <div style={{
        fontSize: 13, color: '#64748b',
        fontFamily: "'Inter',sans-serif", fontWeight: 500,
      }}>
        {text}
      </div>
      <style>{`
        @keyframes xlDot {
          0%,100% { transform: translateY(0) scale(0.65); opacity: 0.4; }
          45%      { transform: translateY(-9px) scale(1.1); opacity: 1; }
        }
      `}</style>
    </div>
  );

  if (!overlay) {
    return (
      <div style={{ padding: '40px 20px', display: 'flex',
        alignItems: 'center', justifyContent: 'center' }}>
        {inner}
      </div>
    );
  }

  /* Fills the nearest position:relative parent — covers only the content area */
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(255,255,255,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {inner}
    </div>
  );
}
