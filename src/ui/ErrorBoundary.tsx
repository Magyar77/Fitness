import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** If a screen crashes, show a calm message instead of a blank page. Data is saved as you go. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="screen">
        <h1>Something went wrong</h1>
        <div className="card">
          <p>This screen hit an error. Everything you logged is already saved on this phone.</p>
          <p className="muted small">{this.state.error.message}</p>
          <div className="buttons">
            <button type="button" onClick={() => location.reload()}>Reload</button>
            <button type="button" className="secondary" onClick={() => { location.hash = '#/more'; location.reload(); }}>Go to backup</button>
          </div>
        </div>
      </section>
    );
  }
}
