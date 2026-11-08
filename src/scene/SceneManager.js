import * as THREE from 'three';
import { Track } from './Track.js';
import { FormulaCar } from './FormulaCar.js';
import { getRenderProfile } from '../settings/GameSettings.js';

export function releaseSceneResources(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
}

export class SceneManager {
  constructor(container, trackDefinition) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x90a8b5);
    this.scene.fog = new THREE.Fog(0x90a8b5, 180, 440);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 600);
    this.renderProfile = getRenderProfile();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    try {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.renderProfile.pixelRatio));
      this.renderer.shadowMap.enabled = this.renderProfile.shadowsEnabled;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      container.appendChild(this.renderer.domElement);
      this.addEnvironment();
      this.track = new Track(this.scene, trackDefinition);
      this.car = new FormulaCar(this.scene);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
      this.resize();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  setTrack(trackDefinition) {
    const old = this.track.group;
    this.scene.remove(old);
    releaseSceneResources(old);
    this.track = new Track(this.scene, trackDefinition);
  }

  addEnvironment() {
    this.hemisphere = new THREE.HemisphereLight(0xd9efff, 0x394639, 2.1);
    this.scene.add(this.hemisphere);
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { daylight: { value: 1 } },
      vertexShader: 'varying float vHeight; void main(){ vHeight=normalize(position).y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform float daylight; varying float vHeight;
        void main(){
          float h=clamp((vHeight+0.08)/0.82,0.0,1.0); h=h*h*(3.0-2.0*h);
          float warm=1.0-smoothstep(0.08,0.30,abs(daylight-0.66));
          vec3 nightH=vec3(0.13,0.18,0.29), dayH=vec3(0.72,0.82,0.89), sunsetH=vec3(0.87,0.43,0.31);
          vec3 nightZ=vec3(0.025,0.055,0.12), dayZ=vec3(0.20,0.48,0.77), sunsetZ=vec3(0.37,0.27,0.44);
          vec3 horizon=mix(nightH,dayH,clamp(daylight,0.0,1.0));
          vec3 zenith=mix(nightZ,dayZ,clamp(daylight,0.0,1.0));
          horizon=mix(horizon,sunsetH,warm*0.82); zenith=mix(zenith,sunsetZ,warm*0.78);
          vec3 sky=mix(horizon,zenith,h); sky+=vec3(1.0,0.68,0.42)*exp(-pow((vHeight-0.03)*18.0,2.0))*warm*0.12;
          gl_FragColor=vec4(sky,1.0);
        }`,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(560, 32, 20), this.skyMaterial);
    this.skyDome.frustumCulled = false; this.skyDome.renderOrder = -1; this.scene.add(this.skyDome);
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd4a0, transparent: true, opacity: 1, depthWrite: false }));
    this.sunDisc.position.copy(new THREE.Vector3(-95, 145, 70).normalize().multiplyScalar(420)); this.scene.add(this.sunDisc);
    const sun = new THREE.DirectionalLight(0xfff1d5, 3.3);
    sun.position.set(-95, 145, 70);
    sun.castShadow = this.renderProfile.shadowsEnabled;
    sun.shadow.mapSize.set(this.renderProfile.shadowMapSize, this.renderProfile.shadowMapSize);
    this.sun = sun;
    Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 120, bottom: -120 });
    sun.shadow.bias = -0.00025;
    this.scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ color: 0x667b67, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.14;
    ground.receiveShadow = true;
    this.ground = ground;
    this.scene.add(ground);

    const hillGeometry = new THREE.DodecahedronGeometry(1, 1);
    const hillMaterial = new THREE.MeshStandardMaterial({ color: 0x778b78, roughness: 1, flatShading: true });
    const hillCount = Math.max(14, Math.round(46 * this.renderProfile.sceneryDensity));
    const hills = new THREE.InstancedMesh(hillGeometry, hillMaterial, hillCount);
    const transform = new THREE.Object3D();
    for (let index = 0; index < hillCount; index += 1) {
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      const radius = 125 + (index % 8) * 10;
      const height = 14 + (index % 7) * 5;
      transform.position.set(Math.cos(angle) * radius, height / 2 - 0.12, Math.sin(angle) * radius);
      transform.rotation.set((index % 4) * 0.06, angle, (index % 3 - 1) * 0.045);
      transform.scale.set(8 + (index % 5) * 2, height, 8 + (index % 5) * 2);
      transform.updateMatrix(); hills.setMatrixAt(index, transform.matrix);
    }
    hills.instanceMatrix.needsUpdate = true;
    this.scene.add(hills);

    const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x314f44, flatShading: true, roughness: 1 });
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x554637, roughness: 1 });
    const treeCount = Math.max(16, Math.round(54 * this.renderProfile.sceneryDensity));
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.55, 1, 5), trunkMaterial, treeCount);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.4, 1), treeMaterial, treeCount);
    for (let index = 0; index < treeCount; index += 1) {
      const angle = index * 2.399;
      const radius = 103 + (index % 6) * 6;
      const height = 5 + (index % 4) * 1.8;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      transform.position.set(x, height * 0.21, z); transform.rotation.set(0, angle, 0);
      transform.scale.set(1, height * 0.42, 1); transform.updateMatrix(); trunks.setMatrixAt(index, transform.matrix);
      transform.position.set(x, height * 0.82, z); transform.scale.set(height * 0.4, height * 0.82, height * (0.32 + (index % 3) * 0.04));
      transform.updateMatrix(); crowns.setMatrixAt(index, transform.matrix);
    }
    trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
    this.scene.add(trunks, crowns);
  }

  setVisualState({ daylight = 1, wetness = 0, fog = 0.45, exposure = 1.08 } = {}) {
    const nightSky = new THREE.Color(0x080e19), sunsetSky = new THREE.Color(0xc47656), daySky = new THREE.Color(0x90a8b5);
    const sky = daylight <= 0.66 ? nightSky.lerp(sunsetSky, THREE.MathUtils.clamp(daylight / 0.66, 0, 1)) : sunsetSky.lerp(daySky, THREE.MathUtils.clamp((daylight - 0.66) / 0.34, 0, 1));
    const nightSun = new THREE.Color(0x758cc6), sunsetSun = new THREE.Color(0xff8255), daySun = new THREE.Color(0xfff1d5);
    const sunColor = daylight <= 0.66 ? nightSun.lerp(sunsetSun, THREE.MathUtils.clamp(daylight / 0.66, 0, 1)) : sunsetSun.lerp(daySun, THREE.MathUtils.clamp((daylight - 0.66) / 0.34, 0, 1));
    this.scene.background.copy(sky); this.scene.fog.color.copy(sky);
    this.skyMaterial.uniforms.daylight.value = daylight;
    this.sunDisc.material.opacity = THREE.MathUtils.clamp((daylight - 0.08) * 1.7, 0, 1);
    const haze = THREE.MathUtils.clamp(fog + wetness * 0.4, 0, 1);
    this.scene.fog.near = 180 - haze * 42; this.scene.fog.far = 440 - haze * 160;
    this.hemisphere.intensity = 0.28 + daylight * 1.82; this.sun.color.copy(sunColor); this.sun.intensity = 0.42 + daylight * 2.88;
    this.renderer.toneMappingExposure = exposure;
    this.track.setWetness(wetness);
    this.visualState = { daylight, wetness, fog, exposure };
  }

  resize() {
    const element = this.renderer.domElement.parentElement;
    const width = element.clientWidth, height = element.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  render() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver?.disconnect();
    if (this.scene) { releaseSceneResources(this.scene); this.scene.clear(); }
    this.renderer?.renderLists?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement?.remove();
  }
}
