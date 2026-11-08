import * as THREE from 'three';
export class FormulaCar {
  constructor(scene, { primaryColor = 0xe83c48 } = {}) {
    this.root = new THREE.Group(); this.root.scale.setScalar(1.35);
    const mat = (color, roughness = 0.6, metalness = 0.1) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const paint = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.28, clearcoat: 0.72, clearcoatRoughness: 0.24 });
    const livery = new THREE.Color(primaryColor), darkLivery = livery.clone().multiplyScalar(0.55);
    const red = paint(livery), redDark = paint(darkLivery), carbon = mat(0x131a20, 0.72, 0.15), tire = new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.97 }), cockpit = new THREE.MeshPhysicalMaterial({ color: 0x71bfc5, roughness: 0.18, metalness: 0.3, transparent: true, opacity: 0.68, clearcoat: 0.8 }), gold = mat(0xf0bf66, 0.42, 0.65), alloy = mat(0x8c969b, 0.32, 0.72);
    const box = (size, pos, material) => { const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material); m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; this.root.add(m); return m; };
    box([1.8,.2,3.25],[0,.22,0],carbon); box([1.65,.2,1.25],[0,.37,.52],redDark);
    // Raised body panels and slim livery stripes add definition without changing the vehicle model.
    box([.12,.035,2.35],[0,.49,-.05],gold); box([.09,.035,1.2],[0,.51,1.13],red);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.54,3.5,6),red); nose.rotation.x=-Math.PI/2; nose.position.set(0,.35,-1.85); nose.scale.set(1,1,.42); nose.castShadow=true; this.root.add(nose);
    box([2.55,.16,.42],[0,.5,-3.12],carbon); box([2.25,.12,.35],[0,.63,-3.02],redDark); for(const x of [-.8,.8])box([.12,.48,.3],[x,.23,-3.08],red);
    // Upright wing endplates and rear supports are visual-only details.
    for (const x of [-1.19, 1.19]) box([.08,.3,.5],[x,.55,-3.12],red);
    box([2.25,.16,.55],[0,1.05,1.65],carbon); box([1.82,.12,.35],[0,1.19,1.56],redDark); for(const x of [-.83,.83])box([.12,.86,.18],[x,.62,1.7],red); box([.3,.85,.26],[0,.68,1.7],redDark);
    const rearLamp = new THREE.Mesh(new THREE.BoxGeometry(.18,.13,.08), new THREE.MeshStandardMaterial({ color: 0xff1c24, emissive: 0xb60008, emissiveIntensity: 1.4 }));
    rearLamp.position.set(0,.72,2.48); this.root.add(rearLamp);
    this.drsFlap = box([1.92,.045,.15],[0,1.265,1.39],gold);
    // Rear diffuser fins and layered front wing flaps are static render details.
    for(const x of [-.48,-.16,.16,.48])box([.055,.24,.72],[x,.14,2.24],carbon);
    for(const x of [-.72,0,.72])box([.58,.045,.16],[x,.57,-3.36],gold);
    for (const x of [-1.24, 1.24]) box([.07,.37,.38],[x,.49,-3.12],redDark);
    for(const x of [-.79,.79]){const pod=new THREE.Mesh(new THREE.BoxGeometry(.58,.58,1.55),red);pod.position.set(x,.43,.22);pod.castShadow=true;this.root.add(pod);box([.08,.44,.95],[x*1.32,.38,.28],gold);}
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.36,.68,1.6,7),red);body.rotation.x=Math.PI/2;body.position.set(0,.58,.12);body.castShadow=true;this.root.add(body);
    const canopy=new THREE.Mesh(new THREE.CylinderGeometry(.57,.37,.6,7,1,true),cockpit);canopy.rotation.x=Math.PI/2;canopy.position.set(0,.79,-.3);canopy.scale.set(.82,1.05,.7);this.root.add(canopy);
    const halo=new THREE.Mesh(new THREE.TorusGeometry(.52,.055,5,8,Math.PI),gold);halo.rotation.x=Math.PI/2;halo.position.set(0,1.06,-.38);halo.scale.set(.88,1.05,.75);this.root.add(halo);box([.1,.42,.1],[0,.88,-.02],gold);
    for (const side of [-1, 1]) {
      const support = new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,1.55,5), carbon);
      support.position.set(side * .81, .47, -.74); support.rotation.z = side * -.22; support.castShadow = true; this.root.add(support);
    }
    for (const x of [-0.95, 0.95]) {
      const wishbone = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 5), alloy);
      wishbone.position.set(x, 0.34, -1.82); wishbone.rotation.z = x < 0 ? 0.16 : -0.16; this.root.add(wishbone);
    }
    this.wheels=[];for(const x of [-1.05,1.05])for(const z of [-1.95,1.72]){const wheel=new THREE.Group();wheel.position.set(x,.3,z);const tm=new THREE.Mesh(new THREE.CylinderGeometry(.62,.62,.43,10),tire);tm.rotation.z=Math.PI/2;tm.castShadow=true;wheel.add(tm);const outer=x>0?.23:-.23;const ring=new THREE.Mesh(new THREE.TorusGeometry(.49,.035,5,12),alloy);ring.rotation.y=Math.PI/2;ring.position.x=outer;wheel.add(ring);const hub=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.48,10),alloy);hub.rotation.z=Math.PI/2;wheel.add(hub);for(let spoke=0;spoke<6;spoke++){const bar=new THREE.Mesh(new THREE.BoxGeometry(.055,.37,.045),alloy);bar.position.set(outer*1.04,0,0);bar.rotation.x=spoke*Math.PI/3;wheel.add(bar);}this.root.add(wheel);this.wheels.push(wheel);}scene.add(this.root);
  }
  sync(agent,dt){this.root.position.copy(agent.position);this.root.position.y=.32;this.root.rotation.y=Math.atan2(-agent.forward.x,-agent.forward.z);for(const w of this.wheels)w.rotation.x+=agent.velocity.length()*dt*.8;this.drsFlap.rotation.x=THREE.MathUtils.damp(this.drsFlap.rotation.x,agent.raceMechanics?.drsActive?-.32:0,7,dt);}
}
