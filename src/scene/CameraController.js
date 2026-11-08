import * as THREE from 'three';
export class CameraController {
  constructor(camera){this.camera=camera;this.mode='chase';this.lookTarget=new THREE.Vector3();this.up=new THREE.Vector3(0,1,0);this.topPosition=new THREE.Vector3(0,195,.01);}
  toggle(){this.mode=this.mode==='chase'?'overview':'chase';return this.mode;}
  update(agent,dt){dt=Math.min(dt,.05);if(this.mode==='overview'){this.camera.position.lerp(this.topPosition,1-Math.exp(-2.5*dt));this.lookTarget.lerp(new THREE.Vector3(0,0,0),1-Math.exp(-2.5*dt));this.camera.lookAt(this.lookTarget);return;}const desired=agent.position.clone().addScaledVector(agent.forward,-17).add(new THREE.Vector3(0,9.5,0));this.camera.position.lerp(desired,1-Math.exp(-4.2*dt));this.lookTarget.copy(agent.position).addScaledVector(agent.forward,8).add(new THREE.Vector3(0,1.6,0));this.camera.up.lerp(this.up,1-Math.exp(-3*dt)).normalize();this.camera.lookAt(this.lookTarget);}
}
