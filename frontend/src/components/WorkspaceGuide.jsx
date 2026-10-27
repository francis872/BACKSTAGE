import { useEffect, useRef, useState } from 'react';
import { guidanceFor, readComfortablePreference, saveComfortablePreference } from '../lib/workspaceGuidance.mjs';
import Button from './ui/Button';
import Modal from './ui/Modal';
export default function WorkspaceGuide({ page, onNavigate, role }) {
  const [helpOpen,setHelpOpen]=useState(false);
  const [comfortable,setComfortable]=useState(()=>{try{return readComfortablePreference(window.localStorage);}catch{return false;}});
  const heading=useRef(null), previousPage=useRef(page);
  const info=guidanceFor(page);
  useEffect(()=>{document.documentElement.dataset.reading=comfortable?'comfortable':'standard';try{saveComfortablePreference(window.localStorage,comfortable);}catch{}return()=>{delete document.documentElement.dataset.reading;};},[comfortable]);
  useEffect(()=>{setHelpOpen(false);if(previousPage.current!==page){previousPage.current=page;heading.current?.focus({preventScroll:true});}},[page]);
  return <>
    <header className="workspace-guide">
      <div className="workspace-guide__location"><nav aria-label="Ubicación actual"><button type="button" onClick={()=>onNavigate('mission-control')}>Inicio</button>{page!=='mission-control'&&<><span aria-hidden="true">/</span><span aria-current="page">{info.title}</span></>}</nav><h2 ref={heading} tabIndex={-1}>{info.title}</h2><p>{info.description}</p></div>
      <div className="workspace-guide__actions"><Button variant="secondary" aria-pressed={comfortable} onClick={()=>setComfortable(value=>!value)}>Lectura cómoda</Button><Button variant="secondary" aria-haspopup="dialog" onClick={()=>setHelpOpen(true)}>Ayuda para esta pantalla</Button></div>
    </header>
    <Modal isOpen={helpOpen} onClose={()=>setHelpOpen(false)} title={`Cómo usar: ${info.title}`} className="workspace-help" footer={<Button onClick={()=>setHelpOpen(false)}>Entendido, volver a la pantalla</Button>}>
      <p>{info.description}</p><h3>Por dónde empezar</h3><ol>{info.steps.map(step=><li key={step}>{step}</li>)}</ol>
      <h3>Palabras que encontrarás</h3><dl><div><dt>Proyecto</dt><dd>Un trabajo que reúne un objetivo, los lugares que estudias y sus resultados.</dd></div><div><dt>Activo</dt><dd>Un lugar o recurso de tu organización, como un equipo, vehículo o instalación.</dd></div><div><dt>Fuente</dt><dd>El origen de un dato. Su fecha te ayuda a saber si sigue siendo útil.</dd></div></dl>
      <p>{role==='viewer'?'Tu acceso es de consulta: puedes revisar información. El administrador gestiona los permisos para modificarla.':'Si una acción no está disponible, revisa los requisitos que indica la pantalla o consulta al administrador de tu organización.'}</p>
      <Button variant="secondary" onClick={()=>{setHelpOpen(false);onNavigate('mission-control');}}>Volver al Inicio</Button>
    </Modal>
  </>;
}
