import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { seek } from '../src/ai/SeekBehavior.js';
import { PathFollowing } from '../src/ai/PathFollowing.js';
import { SteeringVehicle } from '../src/ai/SteeringVehicle.js';
describe('Steering behaviors',()=>{
  it('computes steering as desired velocity minus current velocity',()=>{const f=seek(new Vector3(),new Vector3(10,0,0),new Vector3(0,0,3),10,100);expect(f.x).toBeCloseTo(10);expect(f.z).toBeCloseTo(-3);});
  it('limits seek force to maxForce',()=>{const f=seek(new Vector3(),new Vector3(0,0,100),new Vector3(0,0,-20),30,4);expect(f.length()).toBeCloseTo(4);});
  it('projects onto the current cyclic segment and aims ahead by path distance',()=>{const pts=[0,10,20,30].map(x=>new Vector3(x,0,0)),follower=new PathFollowing(pts,{lookAhead:12,maxSpeed:10,maxForce:20}),force=follower.update(new Vector3(),new Vector3());expect(follower.index).toBe(0);expect(follower.target.x).toBeCloseTo(22);expect(force.x).toBeGreaterThan(0);});
  it('integrates elapsed time with stable substeps and constant-acceleration displacement',()=>{
    for(const dt of [.02,.1,.4]){
      const v=new SteeringVehicle({position:new Vector3(),maxSpeed:100,maxForce:100,mass:1,drag:0});v.velocity.set(0,0,0);v.update(new Vector3(10,0,0),dt);
      expect(v.velocity.x).toBeCloseTo(10*dt);
      expect(v.position.x).toBeCloseTo(.5*10*dt*dt);
    }
  });
  it('caps speed after integrating acceleration over the full elapsed time',()=>{const v=new SteeringVehicle({position:new Vector3(),maxSpeed:5,maxForce:100,mass:1,drag:0});v.velocity.set(0,0,0);v.update(new Vector3(100,0,0),1);expect(v.velocity.length()).toBeCloseTo(5);expect(v.position.x).toBeGreaterThan(0);});
});
