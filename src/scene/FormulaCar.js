import * as THREE from 'three';
export const FORMULA_CAR_MODELS = Object.freeze({
  apex: Object.freeze({ label: 'APEX', noseLength: 3.5, noseRadius: 0.54, frontWing: 2.55, rearWing: 2.25, podWidth: 0.58, bodyWidth: 1, finCount: 4 }),
  velocity: Object.freeze({ label: 'VELOCITY', noseLength: 4.05, noseRadius: 0.43, frontWing: 2.9, rearWing: 2.45, podWidth: 0.5, bodyWidth: 0.94, finCount: 3 }),
  titan: Object.freeze({ label: 'TITAN', noseLength: 3.15, noseRadius: 0.65, frontWing: 2.75, rearWing: 2.6, podWidth: 0.7, bodyWidth: 1.1, finCount: 5 }),
  phantom: Object.freeze({ label: 'PHANTOM', noseLength: 3.8, noseRadius: 0.48, frontWing: 2.12, rearWing: 2.02, podWidth: 0.54, bodyWidth: 0.96, finCount: 2 }),
});
const DRIVER_STYLES = Object.freeze({ classic: { helmetScale: 1, suitScale: 1, helmet: 'sphere' }, nova: { helmetScale: 1.06, suitScale: 0.92, helmet: 'icosahedron' }, vector: { helmetScale: 0.96, suitScale: 1.08, helmet: 'dodecahedron' } });
export class FormulaCar {
  constructor(scene, { primaryColor = 0xe83c48, secondaryColor = 0xf0bf66, driverNumber = null, model = 'apex', driver = null } = {}) {
    this.root = new THREE.Group(); this.root.scale.setScalar(1.35);
    this.model = Object.hasOwn(FORMULA_CAR_MODELS, model) ? model : 'apex';
    const shape = FORMULA_CAR_MODELS[this.model];
    this.root.userData.visualModel = this.model;
    const mat = (color, roughness = 0.6, metalness = 0.1) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const paint = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.28, clearcoat: 0.72, clearcoatRoughness: 0.24 });
    const livery = new THREE.Color(primaryColor), darkLivery = livery.clone().multiplyScalar(0.55);
    const red = paint(livery), redDark = paint(darkLivery), carbon = mat(0x131a20, 0.72, 0.15), tire = new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.97 }), cockpit = new THREE.MeshPhysicalMaterial({ color: 0x71bfc5, roughness: 0.18, metalness: 0.3, transparent: true, opacity: 0.68, clearcoat: 0.8 }), accent = mat(secondaryColor, 0.42, 0.65), alloy = mat(0x8c969b, 0.32, 0.72);
    const box = (size, pos, material) => { const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material); m.position.set(...pos); m.castShadow = true; m.receiveShadow = true; this.root.add(m); return m; };
    box([1.8 * shape.bodyWidth,.2,3.25],[0,.22,0],carbon); box([1.65 * shape.bodyWidth,.2,1.25],[0,.37,.52],redDark);
    // Raised body panels and slim livery stripes add definition without changing the vehicle model.
    box([.12,.035,2.35],[0,.49,-.05],accent); box([.09,.035,1.2],[0,.51,1.13],red);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(shape.noseRadius,shape.noseLength, this.model === 'phantom' ? 4 : 7),red); nose.rotation.x=-Math.PI/2; nose.position.set(0,.35,-1.85 - (shape.noseLength - 3.5) * .42); nose.scale.set(1,1,.42); nose.castShadow=true; this.root.add(nose);
    box([shape.frontWing,.16,.42],[0,.5,-3.12],carbon); box([shape.frontWing * .88,.12,.35],[0,.63,-3.02],redDark); for(const x of [-.8,.8])box([.12,.48,.3],[x,.23,-3.08],red);
    // Upright wing endplates and rear supports are visual-only details.
    for (const x of [-1.19, 1.19]) box([.08,.3,.5],[x,.55,-3.12],red);
    box([shape.rearWing,.16,.55],[0,1.05,1.65],carbon); box([shape.rearWing * .81,.12,.35],[0,1.19,1.56],redDark); for(const x of [-.83,.83])box([.12,.86,.18],[x,.62,1.7],red); box([.3,.85,.26],[0,.68,1.7],redDark);
    const rearLamp = new THREE.Mesh(new THREE.BoxGeometry(.18,.13,.08), new THREE.MeshStandardMaterial({ color: 0xff1c24, emissive: 0xb60008, emissiveIntensity: 1.4 }));
    rearLamp.position.set(0,.72,2.48); this.root.add(rearLamp);
    this.drsFlap = box([1.92,.045,.15],[0,1.265,1.39],accent);
    // Rear diffuser fins and layered front wing flaps are static render details.
    for(let index=0;index<shape.finCount;index++){const x=(index-(shape.finCount-1)/2)*.22;box([.055,.24,.72],[x,.14,2.24],carbon);}
    for(const x of [-.72,0,.72])box([.58,.045,.16],[x,.57,-3.36],accent);
    for (const x of [-1.24, 1.24]) box([.07,.37,.38],[x,.49,-3.12],redDark);
    for(const x of [-.79,.79]){const pod=new THREE.Mesh(new THREE.BoxGeometry(shape.podWidth,.58,1.55),red);pod.position.set(x,.43,.22);pod.castShadow=true;this.root.add(pod);box([.08,.44,.95],[x*1.32,.38,.28],accent);}
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.36,.68,1.6,7),red);body.rotation.x=Math.PI/2;body.position.set(0,.58,.12);body.castShadow=true;this.root.add(body);
    const canopy=new THREE.Mesh(new THREE.CylinderGeometry(.57,.37,.6,7,1,true),cockpit);canopy.rotation.x=Math.PI/2;canopy.position.set(0,.79,-.3);canopy.scale.set(.82,1.05,.7);this.root.add(canopy);
    const halo=new THREE.Mesh(new THREE.TorusGeometry(.52,.055,5,8,Math.PI),accent);halo.rotation.x=Math.PI/2;halo.position.set(0,1.06,-.38);halo.scale.set(.88,1.05,.75);this.root.add(halo);box([.1,.42,.1],[0,.88,-.02],accent);
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(.16,.27,.43,8), carbon); intake.rotation.x = Math.PI / 2; intake.position.set(0,.91,.43); intake.castShadow = true; intake.name = 'engine-air-intake'; this.root.add(intake);
    for (const side of [-1, 1]) {
      const mirrorStem = new THREE.Mesh(new THREE.CylinderGeometry(.025,.035,.48,5), carbon); mirrorStem.position.set(side * .79,.7,-.7); mirrorStem.rotation.z = side * -.42; mirrorStem.rotation.x = -.34; mirrorStem.name = 'side-mirror-stem'; this.root.add(mirrorStem);
      const mirror = box([.19,.105,.24],[side * .98,.82,-.82],redDark); mirror.name = 'side-mirror';
      const mirrorFace = box([.145,.014,.17],[side * .98,.82,-.946],cockpit); mirrorFace.name = 'side-mirror-face';
    }
    this.driver = this.addDriver(driver, red, accent);
    for (const side of [-1, 1]) {
      const support = new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,1.55,5), carbon);
      support.position.set(side * .81, .47, -.74); support.rotation.z = side * -.22; support.castShadow = true; this.root.add(support);
    }
    for (const x of [-0.95, 0.95]) {
      const wishbone = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 5), alloy);
      wishbone.position.set(x, 0.34, -1.82); wishbone.rotation.z = x < 0 ? 0.16 : -0.16; this.root.add(wishbone);
    }
    this.driverNumber = driverNumber !== null && driverNumber !== undefined && Number.isInteger(Number(driverNumber)) && Number(driverNumber) >= 0 && Number(driverNumber) <= 99 ? Number(driverNumber) : null;
    this.root.userData.driverNumber = this.driverNumber;
    if (this.driverNumber !== null) this.addDriverNumber(this.driverNumber, accent);
    this.wheels=[];for(const x of [-1.05,1.05])for(const z of [-1.95,1.72]){const wheel=new THREE.Group();wheel.position.set(x,.3,z);wheel.userData.front=z<0;const tm=new THREE.Mesh(new THREE.CylinderGeometry(.62,.62,.43,10),tire);tm.rotation.z=Math.PI/2;tm.castShadow=true;wheel.add(tm);const outer=x>0?.23:-.23;const ring=new THREE.Mesh(new THREE.TorusGeometry(.49,.035,5,12),alloy);ring.rotation.y=Math.PI/2;ring.position.x=outer;wheel.add(ring);const hub=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.48,10),alloy);hub.rotation.z=Math.PI/2;wheel.add(hub);for(let spoke=0;spoke<6;spoke++){const bar=new THREE.Mesh(new THREE.BoxGeometry(.055,.37,.045),alloy);bar.position.set(outer*1.04,0,0);bar.rotation.x=spoke*Math.PI/3;wheel.add(bar);}this.root.add(wheel);this.wheels.push(wheel);}scene.add(this.root);
  }
  addDriver(config, suitMaterial, trimMaterial) {
    if (!config) return null;
    const style = DRIVER_STYLES[config.avatar] ?? DRIVER_STYLES.classic;
    const helmetColor = Number.isInteger(config.helmetColor) ? config.helmetColor : 0xf5f5f5;
    const suitColor = Number.isInteger(config.suitColor) ? config.suitColor : 0x222832;
    const skinColor = Number.isInteger(config.skinColor) ? config.skinColor : 0xb77955;
    const group = new THREE.Group(); group.name = 'driver-avatar'; group.position.set(0, .72, -.34);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: suitColor, roughness: .7 });
    const skinMaterial = new THREE.MeshStandardMaterial({ color: skinColor, roughness: .78 });
    const gloveMaterial = new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: .83 });
    const suit = new THREE.Mesh(new THREE.SphereGeometry(.24 * style.suitScale, 10, 7), bodyMaterial);
    suit.scale.set(1, 1.22, .82); suit.position.y = -.06; group.add(suit);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.075, .09, .16, 8), skinMaterial); neck.position.set(0, .12, -.01); group.add(neck);
    const limb = (a, b, radius, material, name) => {
      const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(.02, delta.length() - radius * 2), 3, 6), material);
      mesh.position.copy(start.add(end).multiplyScalar(.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); mesh.name = name; group.add(mesh); return mesh;
    };
    for (const side of [-1, 1]) {
      limb([side * .12, -.04, -.02], [side * .25, -.16, -.22], .067, bodyMaterial, 'driver-arm');
      const glove = new THREE.Mesh(new THREE.SphereGeometry(.065, 7, 5), gloveMaterial); glove.position.set(side * .25, -.16, -.24); glove.name = 'driver-glove'; group.add(glove);
      limb([side * .09, -.2, .02], [side * .1, -.32, -.08], .065, bodyMaterial, 'driver-leg');
      const boot = new THREE.Mesh(new THREE.BoxGeometry(.14, .09, .22), gloveMaterial); boot.position.set(side * .1, -.34, -.14); boot.name = 'driver-boot'; group.add(boot);
    }
    const helmetGeometry = style.helmet === 'icosahedron' ? new THREE.IcosahedronGeometry(.2 * style.helmetScale, 1)
      : style.helmet === 'dodecahedron' ? new THREE.DodecahedronGeometry(.2 * style.helmetScale, 1)
        : new THREE.SphereGeometry(.2 * style.helmetScale, 12, 8);
    const helmet = new THREE.Mesh(helmetGeometry, new THREE.MeshPhysicalMaterial({ color: helmetColor, roughness: .28, metalness: .12, clearcoat: .75 }));
    helmet.position.set(0, .22, -.03); group.add(helmet);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(.145 * style.helmetScale, 10, 6, 0, Math.PI * 2, .32, .85), new THREE.MeshStandardMaterial({ color: 0x172027, metalness: .6, roughness: .22 }));
    visor.position.set(0, .23, -.145); visor.scale.set(1, .63, .38); group.add(visor);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(.045, .19, .03), trimMaterial); stripe.position.set(0, .24, .156); group.add(stripe);
    this.root.add(group); return group;
  }
  addDriverNumber(number, material) {
    const patterns = { 0: ['top','upperLeft','upperRight','lowerLeft','lowerRight','bottom'], 1: ['upperRight','lowerRight'], 2: ['top','upperRight','middle','lowerLeft','bottom'], 3: ['top','upperRight','middle','lowerRight','bottom'], 4: ['upperLeft','upperRight','middle','lowerRight'], 5: ['top','upperLeft','middle','lowerRight','bottom'], 6: ['top','upperLeft','middle','lowerLeft','lowerRight','bottom'], 7: ['top','upperRight','lowerRight'], 8: ['top','upperLeft','upperRight','middle','lowerLeft','lowerRight','bottom'], 9: ['top','upperLeft','upperRight','middle','lowerRight','bottom'] };
    const positions = { top: [0, -.135, .20, .035, 0], middle: [0, 0, .20, .035, 0], bottom: [0, .135, .20, .035, 0], upperLeft: [-.082, -.068, .035, .15, 0], upperRight: [.082, -.068, .035, .15, 0], lowerLeft: [-.082, .068, .035, .15, 0], lowerRight: [.082, .068, .035, .15, 0] };
    const digits = String(number).padStart(2, '0');
    [...digits].forEach((digit, index) => {
      const group = new THREE.Group(); group.position.set((index - (digits.length - 1) / 2) * .24, .525, .15);
      for (const segment of patterns[digit]) {
        const [x, z, width, depth] = positions[segment];
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, .018, depth), material); mesh.position.set(x, 0, z); group.add(mesh);
      }
      this.root.add(group);
    });
  }
  sync(agent,dt){this.root.position.copy(agent.position);this.root.position.y=.32;this.root.rotation.y=Math.atan2(-agent.forward.x,-agent.forward.z);for(const w of this.wheels){w.rotation.x+=agent.velocity.length()*dt*.8;w.rotation.y=THREE.MathUtils.damp(w.rotation.y,w.userData.front?(agent.steeringInput??0)*.34:0,9,dt);}this.drsFlap.rotation.x=THREE.MathUtils.damp(this.drsFlap.rotation.x,agent.raceMechanics?.drsActive?-.32:0,7,dt);}
}
