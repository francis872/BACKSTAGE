import { QUICK_START } from '../lib/workspaceGuidance.mjs';
import Button from './ui/Button';
export default function QuickStart({ onNavigate }) {
  return <div className="quick-start" aria-labelledby="quick-start-heading"><div><p className="quick-start__eyebrow">A tu ritmo</p><h2 id="quick-start-heading">¿Qué quieres hacer?</h2><p>Elige una opción para empezar. Puedes volver al Inicio en cualquier momento.</p></div><div className="quick-start__options">{QUICK_START.map((item,i)=><article key={item.page}><span className="quick-start__number" aria-hidden="true">{i+1}</span><h3>{item.title}</h3><p>{item.description}</p><Button onClick={()=>onNavigate(item.page)}>{item.action}</Button></article>)}</div></div>;
}
