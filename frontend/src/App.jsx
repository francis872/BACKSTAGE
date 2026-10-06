import { Component } from 'react';

// Error Boundary
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('React Error Boundary caught:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#0f172e',
          color: '#f0f4f9',
          padding: '20px',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{ maxWidth: '600px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '24px', marginBottom: '10px' }}>⚠️ Application Error</h1>
            <p style={{ fontSize: '14px', marginBottom: '20px', color: '#a8b5c8' }}>
              The application encountered an error during initialization.
            </p>
            {this.state.error && (
              <pre style={{
                backgroundColor: '#1a2847',
                padding: '15px',
                borderRadius: '4px',
                textAlign: 'left',
                fontSize: '12px',
                overflow: 'auto',
                marginBottom: '20px',
                color: '#ff3b30'
              }}>
                {this.state.error.toString()}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#2b7fff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Test App - Minimal version to verify React is rendering
function App() {
  console.log('🚀 React App is rendering...');

  return (
    <ErrorBoundary>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f172e',
        color: '#f0f4f9',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '20px'
      }}>
        <div style={{ maxWidth: '600px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>✅ BACKSTAGE</h1>
          <p style={{ fontSize: '18px', color: '#a8b5c8', marginBottom: '30px' }}>
            React is rendering successfully! Open DevTools console to see logs.
          </p>
          <div style={{
            backgroundColor: '#1a2847',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '30px',
            textAlign: 'left',
            fontSize: '14px',
            color: '#06d6d6'
          }}>
            <p>✓ React component mounted</p>
            <p>✓ Error Boundary active</p>
            <p>✓ HTML rendering confirmed</p>
            <p>✓ Check browser console for more logs</p>
          </div>
          <p style={{ fontSize: '12px', color: '#3a4a6b' }}>
            If you see this message, React and the frontend are working correctly.
          </p>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
