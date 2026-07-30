import React from 'react';

export default class CalendarErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[CalendarErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '48px 32px',
          textAlign: 'center',
          color: 'var(--slate)',
          background: 'var(--off)',
          borderRadius: 8,
          border: '1px solid var(--lightgray)',
          margin: '16px 0',
        }}>
          <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>
            Calendar could not render
          </p>
          <p style={{ fontSize: 14, marginBottom: 16 }}>
            {this.state.error?.message || 'An unexpected error occurred in the Calendar.'}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '8px 20px',
              background: 'var(--navy)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
