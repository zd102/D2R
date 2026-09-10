import * as THREE from 'three';
import type { SurfaceStyle } from './scene-design.ts';

export const sceneryRandom = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
export function sceneryTexture(style: SurfaceStyle | 'wall' | 'water' | 'lava' | 'bark', seed: number) {
  const random = sceneryRandom(seed), canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = style === 'lava' ? '#61453c' : style === 'water' ? '#7c9b99' : '#b6b4ac'; ctx.fillRect(0, 0, 512, 512);
  const noise = ctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < noise.data.length; i += 4) {
    const n = (random() - .5) * (['earth','mud','sand'].includes(style) ? 42 : 25);
    for (let c = 0; c < 3; c++) noise.data[i + c] = Math.max(0, Math.min(255, noise.data[i + c] + n));
  }
  ctx.putImageData(noise, 0, 0);
  const line = (points: number[][], color: string, width: number) => {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  };
  if (['flagstone','mosaic','wall'].includes(style)) {
    const h = style === 'wall' ? 64 : 128, w = style === 'mosaic' ? 128 : 256;
    for (let row = -1; row < 512 / h + 1; row++) for (let col = -1; col < 512 / w + 1; col++) {
      const x = col * w + (row % 2 ? w / 2 : 0), y = row * h;
      ctx.fillStyle = `rgba(${random() > .5 ? '245,237,211' : '35,32,30'},${.025 + random() * .09})`;
      ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
      ctx.strokeStyle = '#34332f'; ctx.lineWidth = style === 'wall' ? 5 : 3; ctx.strokeRect(x, y, w, h);
      line([[x+3,y+h-4],[x+3,y+3],[x+w-4,y+3]], '#e7e3ce77', 2);
      line([[x+w*.7,y],[x+w*.69,y+h*.18],[x+w*.77,y+h*.4]], '#46443e99', 1.3);
      if (style === 'mosaic') {
        ctx.strokeStyle = '#77776b'; ctx.lineWidth = 3; ctx.strokeRect(x + 15, y + 15, w - 30, h - 30);
        line([[x+w/2,y+28],[x+w-28,y+h/2],[x+w/2,y+h-28],[x+28,y+h/2],[x+w/2,y+28]], '#d9d4b6', 3);
      }
    }
  } else if (style === 'bark') {
    for(let i=0;i<140;i++){const x=random()*512;line([[x,0],[x+random()*12,180],[x-random()*9,350],[x,512]],i%3?'#493d3070':'#e6d2ac60',1+random()*5);}
  } else if (style === 'water') {
    for (let i = 0; i < 120; i++) {
      const x = random() * 512, y = random() * 512;
      line([[x,y],[x+10,y-2],[x+30+random()*35,y]], i % 3 ? '#d8e6d02b' : '#20392e33', 1 + random() * 2);
    }
  } else if (style === 'ice') {
    for (let i = 0; i < 30; i++) {
      const x = random()*512, y = random()*512;
      line([[x,y],[x+23,y+40],[x+15,y+70],[x+50,y+110]], '#eaffff66', 1.5);
      line([[x+23,y+40],[x+53,y+20],[x+80,y+25]], '#274d6844', 2);
    }
  } else {
    for (let i = 0; i < 280; i++) {
      const x = random()*512, y = random()*512, r = 1 + random()*8;
      ctx.beginPath(); ctx.ellipse(x,y,r,r*.45,random()*6,0,Math.PI*2);
      ctx.fillStyle = style === 'snow' ? '#eaf5f526' : style === 'lava' ? '#3b2827cc' : '#393c342a'; ctx.fill();
      if (style === 'earth' || style === 'mud') line([[x,y],[x+2,y-6],[x+4,y-1]], '#b2bc8d55', 1);
    }
    if (style === 'basalt' || style === 'lava') for (let i = 0; i < 50; i++) {
      const x = random()*512, y = random()*512;
      const points=[[x,y],[x+10,y+17],[x+42,y+24],[x+50,y+48],[x+40,y+80],[x+70,y+95]];
      if(style==='lava') {line(points,'#e4944977',18);line(points,'#f5b261',5);line(points,'#fff5cb',1.5);}
      else line(points,'#242024aa',1.7);
    }
    if (style === 'sand' || style === 'snow') for (let y = 0; y < 512; y += 24) {
      const points = Array.from({ length: 33 }, (_, i) => [i*16,y+Math.sin(i*.5+y)*5]);
      line(points, style === 'snow' ? '#eefbff25' : '#6b604015', 3);
    }
  }
  if(style==='lava') {
    // Seamless, warped crust plates with hot fissures, rather than repeated painted bolts.
    const sites=Array.from({length:16},()=>[.18+random()*.64,.18+random()*.64]);
    const pixels=ctx.createImageData(512,512);
    for(let y=0;y<512;y++)for(let x=0;x<512;x++){
      const u=x/128+.2*Math.sin(y/512*Math.PI*4)+.09*Math.sin(x/512*Math.PI*6);
      const v=y/128+.18*Math.sin(x/512*Math.PI*4)+.1*Math.cos(y/512*Math.PI*6);
      const ix=Math.floor(u),iy=Math.floor(v);let first=Infinity,second=Infinity;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const site=sites[((iy+dy+8)%4)*4+(ix+dx+8)%4];
        const distance=(u-ix-dx-site[0])**2+(v-iy-dy-site[1])**2;
        if(distance<first){second=first;first=distance;}else if(distance<second)second=distance;
      }
      const heat=Math.exp(-(second-first)*22),glint=random()*6,i=(y*512+x)*4;
      pixels.data[i]=45+heat*210+glint;pixels.data[i+1]=29+heat*190+glint;pixels.data[i+2]=24+heat*130;pixels.data[i+3]=255;
    }
    ctx.putImageData(pixels,0,0);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}
export function weatherTexture(rain: boolean) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  if (rain) {
    const gradient = ctx.createLinearGradient(16,0,16,32); gradient.addColorStop(0,'#ffffff00'); gradient.addColorStop(1,'#ffffffaa');
    ctx.fillStyle = gradient; ctx.fillRect(14,0,3,32);
  } else {
    const gradient = ctx.createRadialGradient(16,16,0,16,16,15); gradient.addColorStop(0,'#fff'); gradient.addColorStop(.35,'#ffffffcc'); gradient.addColorStop(1,'#ffffff00');
    ctx.fillStyle = gradient; ctx.fillRect(0,0,32,32);
  }
  return new THREE.CanvasTexture(canvas);
}

export function sceneryDecal(kind: 'leaves' | 'web' | 'dirt' | 'blood' | 'runes', seed = 1) {
  const random=sceneryRandom(seed),canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  if(kind==='leaves') {
    ctx.strokeStyle='#d6dfa2';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(128,248);ctx.quadraticCurveTo(95,100,128,8);ctx.stroke();
    for(let i=0;i<13;i++)for(const side of [-1,1]){
      const y=26+i*16,w=Math.sin((i+1)/15*Math.PI)*100;
      ctx.beginPath();ctx.moveTo(122,y+12);ctx.quadraticCurveTo(122+side*w*.65,y-25,122+side*w,y-14);
      ctx.quadraticCurveTo(122+side*w*.7,y+20,122,y+17);ctx.fillStyle=i%3?'#8ba367':'#bdd08c';ctx.fill();
      ctx.strokeStyle='#dce2a34d';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(122,y+14);ctx.lineTo(122+side*w,y-14);ctx.stroke();
    }
  } else if(kind==='web') {
    ctx.strokeStyle='#e8ede694';ctx.lineWidth=1;
    for(let i=0;i<13;i++) {const a=i*Math.PI*2/13;ctx.beginPath();ctx.moveTo(128,128);ctx.lineTo(128+Math.cos(a)*124,128+Math.sin(a)*124);ctx.stroke();}
    for(let r=10;r<126;r+=11){ctx.beginPath();for(let i=0;i<=13;i++){const a=i*Math.PI*2/13;ctx.lineTo(128+Math.cos(a)*(r+random()*4),128+Math.sin(a)*(r+random()*4));}ctx.stroke();}
  } else if(kind==='runes') {
    ctx.strokeStyle='#d7cab0c0';ctx.lineWidth=2;
    for(let i=0;i<18;i++) {ctx.save();ctx.translate(128,128);ctx.rotate(i*Math.PI/9);ctx.beginPath();ctx.moveTo(-3,-94);ctx.lineTo(-3,-116);ctx.lineTo(6,-106);ctx.lineTo(-6,-102);ctx.stroke();ctx.restore();}
    for(const r of [88,120]){ctx.beginPath();ctx.arc(128,128,r,0,Math.PI*2);ctx.stroke();}
  } else {
    for(let i=0;i<230;i++) {
      const x=random()*256,y=random()*256,d=Math.hypot(x-128,y-128)/128;
      if(d>1)continue;
      ctx.fillStyle=kind==='blood'?`rgba(95,12,13,${(1-d)*.65})`:`rgba(65,60,42,${(1-d)*.23})`;
      ctx.beginPath();ctx.ellipse(x,y,4+random()*26,2+random()*11,random()*6,0,Math.PI*2);ctx.fill();
    }
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
