import OrbitalGlobe from './OrbitalGlobe';

export default function AccessFrame({ mode, onBack, children }) {
 return (
  <main className="app app-auth immersive-auth">
   <div className="immersive-auth__navigation"><button type="button" className="auth-return" onClick={onBack}><span aria-hidden="true">←</span> Volver al inicio</button><span className="orbital-wordmark"><span className="orbital-brandmark" aria-hidden="true" />BACKSTAGE</span></div>
   <section className={'form-section auth-screen auth-screen--immersive '+(mode==='register'?'is-registration':'')}>
    <aside className="auth-story"><p className="auth-story__eyebrow">Tu territorio. Tu perspectiva.</p><h2>{mode==='register'?'Dale un lugar a tus ideas.':'Tu próxima decisión empieza aquí.'}</h2><p>Una mirada más amplia.<br />Un camino más claro.</p><OrbitalGlobe className="auth-story__globe" /><span className="auth-story__caption">Explora · Conecta · Decide</span></aside>
    <div className="auth-form-panel">{children}</div>
   </section>
  </main>
 );
}
