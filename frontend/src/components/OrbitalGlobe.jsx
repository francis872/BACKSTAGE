import { useEffect, useRef } from 'react';

// Stylized continental outlines used only for the decorative entry globe.
const continents = [
 [[-168,68],[-140,72],[-120,60],[-103,70],[-80,60],[-60,49],[-78,25],[-88,16],[-105,23],[-117,33],[-133,53],[-155,60]],
 [[-81,12],[-64,10],[-47,-4],[-35,-9],[-43,-23],[-54,-34],[-67,-55],[-75,-40],[-79,-13]],
 [[-17,35],[3,37],[24,32],[35,31],[50,12],[43,-12],[32,-30],[18,-35],[10,-15],[-5,5],[-17,14]],
 [[-10,36],[-10,55],[8,62],[23,71],[55,70],[80,75],[130,67],[170,61],[155,45],[130,32],[119,18],[108,4],[97,10],[80,8],[68,25],[43,13],[35,30],[25,40],[9,43]],
 [[112,-11],[136,-11],[154,-25],[146,-39],[128,-35],[113,-23]],
 [[-53,59],[-43,60],[-20,77],[-42,83],[-60,76]],
 [[47,-13],[50,-16],[47,-26],[43,-24]],
 [[130,31],[139,35],[143,44],[145,45],[142,33]],
];
function inside(x, y, polygon) {
 let result = false;
 for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
  const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
  if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) result = !result;
 }
 return result;
}
const points = [];
for (let lat = -56; lat <= 81; lat += 2.7) {
 for (let lon = -178; lon < 180; lon += 2.7 / Math.max(.3, Math.cos(lat * Math.PI / 180))) {
  if (continents.some(p => inside(lon, lat, p))) points.push([lat * Math.PI / 180, lon * Math.PI / 180]);
 }
}

export default function OrbitalGlobe({ className = '' }) {
 const host = useRef(null);
 const canvas = useRef(null);
 useEffect(() => {
  const element = host.current, surface = canvas.current, ctx = surface.getContext('2d');
  if (!ctx) return undefined;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0, height = 0, frame = 0, last = 0, elapsed = 0, visible = true;
  const tilt = -.24, ct = Math.cos(tilt), st = Math.sin(tilt);
  function draw() {
   if (!width || !height) return;
   const cx = width / 2, cy = height / 2, radius = Math.min(width, height) * .325;
   const yaw = .55 + elapsed * .00013;
   ctx.clearRect(0, 0, width, height);
   const project = (lat, lon) => {
    const x = Math.cos(lat) * Math.sin(lon + yaw), y = -Math.sin(lat), z = Math.cos(lat) * Math.cos(lon + yaw);
    return [cx + radius * (x * ct - y * st), cy + radius * (x * st + y * ct), z];
   };
   const halo = ctx.createRadialGradient(cx, cy, radius * .8, cx, cy, radius * 1.65);
   halo.addColorStop(0, 'rgba(101,133,181,.15)'); halo.addColorStop(1, 'rgba(57,83,136,0)');
   ctx.fillStyle = halo; ctx.fillRect(0, 0, width, height);
   ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.35);
   ctx.strokeStyle = 'rgba(214,66,75,.36)'; ctx.lineWidth = .8;
   ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.47, radius * .55, 0, 0, Math.PI * 2); ctx.stroke();
   ctx.setLineDash([2, 9]); ctx.strokeStyle = 'rgba(146,168,203,.22)';
   ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.67, radius * .71, 0, 0, Math.PI * 2); ctx.stroke();
   ctx.restore();
   const ocean = ctx.createRadialGradient(cx - radius * .4, cy - radius * .5, radius * .03, cx, cy, radius * 1.13);
   ocean.addColorStop(0, '#304e78'); ocean.addColorStop(.48, '#182b49'); ocean.addColorStop(.8, '#0c172b'); ocean.addColorStop(1, '#050a12');
   ctx.fillStyle = ocean; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
   ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
   ctx.lineWidth = .6; ctx.strokeStyle = 'rgba(142,166,204,.23)';
   function line(coordinates) {
    ctx.beginPath(); let pen = false;
    for (const [lat, lon] of coordinates) {
     const [x,y,z] = project(lat,lon);
     if (z <= 0) { pen = false; continue; }
     if (pen) ctx.lineTo(x,y); else ctx.moveTo(x,y);
     pen = true;
    }
    ctx.stroke();
   }
   for (let lat = -60; lat <= 60; lat += 20) {
    const coords = []; for (let lon = -180; lon <= 180; lon += 3) coords.push([lat*Math.PI/180,lon*Math.PI/180]); line(coords);
   }
   for (let lon = -180; lon < 180; lon += 30) {
    const coords = []; for (let lat = -90; lat <= 90; lat += 3) coords.push([lat*Math.PI/180,lon*Math.PI/180]); line(coords);
   }
   for (const [lat,lon] of points) {
    const [x,y,z] = project(lat,lon); if (z <= .025) continue;
    ctx.fillStyle = 'rgba(185,206,235,' + (.22 + z * .66) + ')';
    ctx.beginPath(); ctx.arc(x, y, Math.max(.55, radius / 180) * (.6 + z * .65), 0, Math.PI*2); ctx.fill();
   }
   const shadow = ctx.createLinearGradient(cx-radius,cy-radius,cx+radius,cy+radius*.3);
   shadow.addColorStop(0,'rgba(3,6,15,0)');shadow.addColorStop(.55,'rgba(3,6,15,.05)');shadow.addColorStop(1,'rgba(3,6,15,.9)');
   ctx.fillStyle=shadow;ctx.fillRect(cx-radius,cy-radius,radius*2,radius*2);ctx.restore();
   ctx.strokeStyle='rgba(140,173,218,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke();
   const orbit = elapsed * .00025 - .7;
   ctx.save();ctx.translate(cx,cy);ctx.rotate(-.35);
   const ox=Math.cos(orbit)*radius*1.47,oy=Math.sin(orbit)*radius*.55;
   ctx.fillStyle='#ffb0b7';ctx.shadowColor='#d6424b';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(ox,oy,2.6,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function tick(time) {
   frame = 0;
   if (document.hidden || !visible || motion.matches) { last = 0; return; }
   if (time - last >= 32) { if (last) elapsed += Math.min(time-last,80); last=time; draw(); }
   frame=requestAnimationFrame(tick);
  }
  function restart() {
   cancelAnimationFrame(frame); frame=0; last=0; draw();
   if (!document.hidden && visible && !motion.matches) frame=requestAnimationFrame(tick);
  }
  const resize = new ResizeObserver(([entry]) => {
   width=entry.contentRect.width;height=entry.contentRect.height;
   const dpr=Math.min(window.devicePixelRatio||1,1.75);
   surface.width=Math.round(width*dpr);surface.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);restart();
  });
  const intersection=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;restart();});
  resize.observe(element);intersection.observe(element);
  motion.addEventListener('change',restart);document.addEventListener('visibilitychange',restart);
  return ()=>{cancelAnimationFrame(frame);resize.disconnect();intersection.disconnect();motion.removeEventListener('change',restart);document.removeEventListener('visibilitychange',restart);};
 },[]);
 return <div ref={host} className={'orbital-globe '+className} aria-hidden="true"><canvas ref={canvas} /></div>;
}
