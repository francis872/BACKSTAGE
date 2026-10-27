import { useEffect, useRef, useState } from 'react';
import OrbitalGlobe from './OrbitalGlobe';

export default function OrbitalEntry({ onEnter }) {
 const [entering,setEntering]=useState(false);
 const timer=useRef(null),started=useRef(false),finished=useRef(false);
 useEffect(()=>()=>window.clearTimeout(timer.current),[]);
 function finish() { if(finished.current)return;finished.current=true;onEnter(); }
 function enter() {
  if(started.current)return;started.current=true;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}
  setEntering(true);timer.current=window.setTimeout(finish,1500);
 }
 return (
  <main className={'orbital-entry'+(entering?' is-entering':'')} aria-busy={entering}>
   <div className="orbital-entry__stars" aria-hidden="true" />
   <header className="orbital-entry__header"><a href="/" className="orbital-wordmark" aria-label="BACKSTAGE, inicio"><span className="orbital-brandmark" aria-hidden="true" />BACKSTAGE</a><span className="orbital-entry__edition">Una nueva perspectiva</span></header>
   <div className="orbital-entry__world" onAnimationEnd={event=>{if(event.target===event.currentTarget&&event.animationName==='orbital-dive')finish();}}><OrbitalGlobe /></div>
   <div className="orbital-entry__center">
    <p className="orbital-entry__eyebrow"><span /> Inteligencia territorial</p>
    <h1>BACKSTAGE</h1>
    <p className="orbital-entry__message">Mira más allá del mapa.</p>
    <p className="orbital-entry__description">Conecta lugares, descubre oportunidades<br className="orbital-entry__break" /> y dale dirección a tu próxima decisión.</p>
    <button className="orbital-launch" type="button" onClick={enter} disabled={entering} aria-label="Explora tu territorio: ir al acceso de BACKSTAGE">
     <span className="orbital-launch__symbol" aria-hidden="true"><span className="orbital-launch__ring" /><svg viewBox="0 0 24 24" fill="none"><path d="M6 18 18 6M6 6h12v12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
     <span className="orbital-launch__label">{entering?'Abriendo tu mundo…':'Explora tu territorio'}</span>
    </button>
   </div>
   <footer className="orbital-entry__footer"><span>El territorio, desde otra perspectiva.</span><span className="orbital-entry__coordinates">04° 39′ N &nbsp; 74° 04′ O</span></footer>
  </main>
 );
}
