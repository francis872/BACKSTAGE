function PlatformArchitecture() {
  return (
    <section>
      <h2>Arquitectura de Plataforma</h2>
      <p>
        Diseño orientado a misión (estilo Palantir + SpaceX): panel operativo, jerarquía tipográfica fuerte,
        superficies oscuras y enfoque en decisiones de alto impacto.
      </p>

      <div className="card-grid">
        <article className="card">
          <h3>Capas Backend</h3>
          <ul>
            <li><strong>Routes</strong>: orquestan endpoints REST por dominio.</li>
            <li><strong>Controllers</strong>: validan payload y status HTTP.</li>
            <li><strong>Services</strong>: lógica de negocio y acceso SQL.</li>
            <li><strong>Middleware</strong>: autenticación, RBAC y manejo de errores.</li>
          </ul>
        </article>

        <article className="card">
          <h3>Roles y permisos</h3>
          <ul>
            <li><strong>admin</strong>: CRUD total + gestión de usuarios.</li>
            <li><strong>analyst</strong>: escritura operativa (riesgo, retail, territorial, scoring).</li>
            <li><strong>viewer</strong>: solo lectura de analítica y consultas.</li>
          </ul>
          <p className="message">
            Usuarios seed: admin@backstage.local / analyst@backstage.local / viewer@backstage.local
          </p>
        </article>

        <article className="card">
          <h3>Dominios API</h3>
          <ul>
            <li>/locations, /insights, /real-estate</li>
            <li>/risk-assessments, /risk-components</li>
            <li>/recommendations, /integrations, /scoring</li>
            <li>/territorial (EarthArt), /users, /auth</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

export default PlatformArchitecture;
