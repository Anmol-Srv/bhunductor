import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', padding: '2rem',
          color: '#e0e0e0', textAlign: 'center'
        }}>
          <h2 style={{ marginBottom: '0.5rem', color: '#ff6b6b' }}>Something went wrong</h2>
          <p style={{ marginBottom: '1rem', color: '#999', maxWidth: '500px' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '8px 16px', background: '#333', border: '1px solid #555',
              borderRadius: '6px', color: '#e0e0e0', cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
