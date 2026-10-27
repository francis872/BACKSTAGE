import { Component } from 'react';

export default class CapabilityBoundary extends Component {
  state = { failed: false, attempt: 0, reference: null };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) {
    const reference = globalThis.crypto?.randomUUID?.() || `ui-${Date.now().toString(36)}`;
    const kind = ['Error','TypeError','ReferenceError','RangeError','SyntaxError','SecurityError'].includes(error?.name) ? error.name : 'UnexpectedError';
    // Do not log error messages/objects: these can contain addresses, payloads or tokens.
    console.error(JSON.stringify({ event: 'ui.capability_failed', capability: this.props.name || 'workspace', kind, reference }));
    this.setState({ reference });
  }
  componentDidUpdate(previous) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false, reference: null });
  }
  render() {
    if (!this.state.failed) return <div className="capability-content" key={this.state.attempt}>{this.props.children}</div>;
    return <section className="capability-recovery" role="alert" aria-label="Recuperación de herramienta">
      <h2>No pudimos abrir {this.props.label || 'esta herramienta'}</h2>
      <p>Tu trabajo guardado se conserva. Puedes volver a intentarlo o seguir con otra herramienta.</p>
      {this.state.reference && <small>Referencia de diagnóstico: {this.state.reference}</small>}
      <div className="form-actions"><button type="button" onClick={() => this.setState(state => ({ failed: false, reference: null, attempt: state.attempt + 1 }))}>Volver a intentar</button>
        {this.props.onRecover && <button type="button" className="secondary" onClick={this.props.onRecover}>Volver al explorador</button>}</div>
    </section>;
  }
}
