function App() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0f172e',
      color: '#f0f4f9',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '20px'
    }}>
      <div style={{ textAlign: 'center', maxWidth: '600px' }}>
        <h1 style={{ fontSize: '48px', margin: '0 0 20px 0' }}>✅ BACKSTAGE</h1>
        <p style={{ fontSize: '18px', color: '#a8b5c8', margin: '0 0 30px 0' }}>
          React is rendering successfully!
        </p>
        <div style={{
          backgroundColor: '#1a2847',
          padding: '20px',
          borderRadius: '8px',
          textAlign: 'left',
          fontSize: '14px',
          color: '#06d6d6'
        }}>
          <p>✓ React component is working</p>
          <p>✓ HTML rendering confirmed</p>
          <p>✓ System is operational</p>
        </div>
      </div>
    </div>
  );
}

export default App;
