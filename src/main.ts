import * as THREE from 'three'
import {buildCity} from './city/city'
import {buildMobility} from './traffic/mobility'
import {Splats} from './splats/splats'
import {cameraRig} from './camera/rig'
import {createRain} from './weather/rain'
import {el,setupControls,type Toggle} from './ui/controls'
import './ui/style.css'

type Quality='low'|'medium'|'high'
setupControls()
const canvas=el<HTMLCanvasElement>('scene')
function failure(message:string){
 el('engine').textContent='Offline';el('live').textContent='OFFLINE'
 el('notice').textContent=message;el('notice').hidden=false
 const retry=document.createElement('button');retry.textContent='Retry';retry.onclick=()=>location.reload();el('notice').appendChild(retry)
 document.querySelectorAll<HTMLButtonElement|HTMLSelectElement>('button:not(#settings), select').forEach(button=>{if(button!==retry)button.disabled=true})
}
function start(){
 const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'high-performance',premultipliedAlpha:true})
 if(!gl){failure('WebGL 2 is unavailable. Enable hardware acceleration in your browser, then retry.');return}
 let failed=false
 const fail=(message:string)=>{if(!failed){failed=true;failure(message)}}
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail('The graphics connection was lost. Retry to rebuild the city.')})
 THREE.DefaultLoadingManager.onError=()=>fail('A city asset could not be loaded. Retry to reload the scene.')
 const renderer=new THREE.WebGLRenderer({canvas,context:gl,alpha:true,antialias:true})
 renderer.setClearColor(0x000000,0)
 const ext=gl.getExtension('WEBGL_debug_renderer_info')
 const rendererName=String(gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER))
 const scene=new THREE.Scene()
 const hemi=new THREE.HemisphereLight(0xd2dafc,0x927aab,1.3)
 const moon=new THREE.DirectionalLight(0xd9e0ff,2.1);moon.position.set(8,28,16)
 const rim=new THREE.DirectionalLight(0xff6eb3,1.7);rim.position.set(-15,12,-8)
 scene.add(hemi,moon,rim)
 const splats=new Splats()
 const city=buildCity(scene,splats.add.bind(splats))
 splats.build(scene)
 const mobility=buildMobility(scene), rain=createRain(scene)
 const viewButtons=document.querySelectorAll<HTMLButtonElement>('[data-view]')
 function indicateView(index:number){
  el('camlabel').textContent=index<0?'FREE ORBIT':'CAM 0'+(index+1)
  viewButtons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)))
 }
 const rig=cameraRig(canvas,()=>indicateView(-1))
 viewButtons.forEach((b,i)=>b.onclick=()=>{rig.apply(i);indicateView(i)})
 el('reset').onclick=()=>{rig.apply(0);indicateView(0)}
 let quality:Quality='medium'
 const state={rain:true,traffic:true,light:true,pause:matchMedia('(prefers-reduced-motion: reduce)').matches}
 function sync(){
  for(const key of Object.keys(state) as Toggle[])el(key).setAttribute('aria-pressed',String(state[key]))
  rain.enable(state.rain);rim.intensity=state.light?1.7:0;moon.intensity=state.light?2.1:.65;hemi.intensity=state.light?1.3:.55
  el('live').textContent=state.pause?'PAUSED':'LIVE VIEW'
 }
 for(const key of Object.keys(state) as Toggle[])el(key).onclick=()=>{state[key]=!state[key];sync()}
 const bounds=new THREE.Vector2()
 function resize(){
  const w=canvas.clientWidth,h=canvas.clientHeight
  renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='high'?2:quality==='medium'?1.25:.75))
  renderer.setSize(w,h,false);renderer.getDrawingBufferSize(bounds);rig.resize(w,h)
 }
 function setQuality(q:Quality){quality=q;splats.setQuality(q);rain.quality(q);resize();el('splats').textContent=splats.activeCount.toLocaleString('en-US')}
 el<HTMLSelectElement>('quality').onchange=event=>setQuality((event.target as HTMLSelectElement).value as Quality)
 new ResizeObserver(resize).observe(canvas)
 let fps=0,ready=false,last=0,time=0,elapsed=0,frames=0
 setQuality(quality);sync()
 function frame(now:number){
  if(failed)return
  try{
   const seconds=last?(now-last)*.001:0;last=now
   const dt=state.pause?0:Math.min(seconds,.12)
   if(dt){time+=dt;city.update(time);mobility.update(dt,state.traffic);rain.update(time)}
   splats.update(rig.camera,bounds.x,bounds.y)
   renderer.render(scene,rig.camera)
   if(!ready){ready=true;el('notice').hidden=true;el('engine').textContent='WebGL 2'}
   elapsed+=seconds;frames++
   if(elapsed>=.75){fps=frames/elapsed;el('fps').textContent=fps.toFixed(0);el('draws').textContent=String(renderer.info.render.calls);frames=0;elapsed=0}
   requestAnimationFrame(frame)
  }catch(error){console.error(error);fail('The scene could not render. Retry to rebuild it.')}
 }
 Object.assign(window,{nox:{snapshot:()=>{
  const moves=mobility.snapshot()
  return {ready:ready&&!failed,quality,rain:state.rain,paused:state.pause,traffic:state.traffic,light:state.light,camera:[...rig.camera.position.toArray(),...rig.controls.target.toArray()],splats:splats.activeCount,fps,renderer:rendererName,
   mobility:{cars:moves.cars.map(p=>[p.x,p.z]),pedestrians:moves.pedestrians.map(p=>[p.x,p.z])}}
 }}})
 city.update(0);mobility.update(0,true);requestAnimationFrame(frame)
}
try{start()}catch(error){console.error(error);failure('Tokyo could not be initialized. Check WebGL 2 support and retry.')}
