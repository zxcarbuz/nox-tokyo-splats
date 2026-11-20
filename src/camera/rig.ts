import * as THREE from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
export function cameraRig(canvas:HTMLCanvasElement, manual:()=>void){
 const camera=new THREE.PerspectiveCamera(35,1,.15,240)
 const controls=new OrbitControls(camera,canvas)
 controls.minDistance=5; controls.maxDistance=150; controls.maxPolarAngle=Math.PI*.49
 controls.enableDamping=false
 const direction=new THREE.Vector3()
 let preset:number|null=0
 const views=[
  {offset:[.64,.55,.76],target:[0,4.8,0],distance:53},
  {offset:[.45,.13,1],target:[0,3,3],distance:27},
  {offset:[-.7,1.24,.54],target:[0,5,0],distance:47}
 ]
 function apply(index:number){
  preset=index
  const {offset,target,distance}=views[index]
  controls.target.fromArray(target)
  camera.position.copy(controls.target).addScaledVector(direction.fromArray(offset).normalize(),distance*Math.max(1,1.44/camera.aspect))
  controls.update()
 }
 const custom=()=>{preset=null;manual()}
 controls.addEventListener('start',custom)
 canvas.onkeydown=event=>{
  if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','+','=','-','Home'].includes(event.key))return
  event.preventDefault()
  if(event.key==='Home'){document.getElementById('reset')?.click();return}
  custom()
  const offset=camera.position.clone().sub(controls.target)
  if(event.key==='+'||event.key==='='||event.key==='-'){
   offset.setLength(THREE.MathUtils.clamp(offset.length()*(event.key==='-'?1.1:.9),controls.minDistance,controls.maxDistance))
  }else if(event.shiftKey){
   const v=new THREE.Vector3()
   v.setFromMatrixColumn(camera.matrixWorld,event.key==='ArrowLeft'||event.key==='ArrowRight'?0:1)
   controls.target.addScaledVector(v,event.key==='ArrowLeft'||event.key==='ArrowDown'?-1:1)
  }else{
   const s=new THREE.Spherical().setFromVector3(offset)
   if(event.key==='ArrowLeft')s.theta-=.09
   if(event.key==='ArrowRight')s.theta+=.09
   if(event.key==='ArrowUp')s.phi-=.07
   if(event.key==='ArrowDown')s.phi+=.07
   s.phi=THREE.MathUtils.clamp(s.phi,.03,controls.maxPolarAngle)
   offset.setFromSpherical(s)
  }
  camera.position.copy(controls.target).add(offset);controls.update()
 }
 return {camera,controls,apply,resize:(w:number,h:number)=>{
  camera.aspect=w/Math.max(1,h); camera.updateProjectionMatrix();if(preset!==null)apply(preset)
 }}
}
