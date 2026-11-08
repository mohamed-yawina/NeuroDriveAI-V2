import * as THREE from 'three';
import { FormulaCar } from './FormulaCar.js';
import { Track } from './Track.js';
import { releaseSceneResources } from './SceneManager.js';
import { getRenderProfile, readGameSettings } from '../settings/GameSettings.js';
import { FrameRateMonitor } from './FrameRateMonitor.js';

const VIEW_ANGLES = Object.freeze({ threeQuarter: Math.PI - 0.52, front: Math.PI, side: Math.PI / 2, rear: 0, top: 0.52 });
// Keep the paddock wall beyond the furthest camera position allowed by the
// showroom zoom. Previously it sat at z=16, exactly where the rear preset
// placed the camera, putting the camera inside the wall mesh.
export const SHOWROOM_BACKDROP_Z = 27;
const SHOWROOM_MAX_CAMERA_DISTANCE = 20;

export function getShowroomViewAngle(view) { return VIEW_ANGLES[view]; }
export function getShowroomCameraPosition(view, rotation, distance, focus = { x: 0, y: 0.7, z: 0 }) {
  if (view === 'top') return new THREE.Vector3(focus.x, focus.y + distance, focus.z);
  const elevation = focus.y + (4.6 - 0.7);
  return new THREE.Vector3(focus.x + Math.sin(rotation) * distance, elevation, focus.z + Math.cos(rotation) * distance);
}
export function shouldAutoRotate(view, dragging) { return !dragging && (view === undefined || view === 'threeQuarter' || view === 'circuit'); }
export function applyOrbitDrag(targetRotation, previousX, currentX, sensitivity = readGameSettings().orbitSensitivity) {
  return targetRotation + (currentX - previousX) * sensitivity;
}
export function adjustShowroomZoom(distance, deltaY, sensitivity = readGameSettings().zoomSensitivity) {
  return THREE.MathUtils.clamp(distance + Math.sign(deltaY) * sensitivity, 8.5, SHOWROOM_MAX_CAMERA_DISTANCE);
}

/** Lightweight showroom reused by the home and garage views. */
export class MenuShowroom {
  constructor(container) {
    this.container = container; this.disposed = false; this.dragging = false; this.rotation = Math.PI - 0.52; this.targetRotation = this.rotation; this.distance = 16;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x101216); this.scene.fog = new THREE.Fog(0x101216, 22, 52);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 600); this.originalFov = this.camera.fov; this.camera.position.set(7, 4.5, 9);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    const renderProfile = getRenderProfile();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, renderProfile.pixelRatio)); this.renderer.shadowMap.enabled = renderProfile.shadowsEnabled; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.className = 'showroom-canvas'; this.renderer.domElement.setAttribute('aria-label', 'Monoplace F1 3D, faites glisser pour la tourner et utilisez la molette pour zoomer');
    container.append(this.renderer.domElement);
    this.performanceMonitor = new FrameRateMonitor(container, { enabled: renderProfile.showFps, profile: renderProfile.quality });
    this.scene.add(new THREE.HemisphereLight(0xe9efff, 0x222329, 2.25));
    const key = new THREE.SpotLight(0xffece8, 100, 45, Math.PI / 4, 0.45); key.position.set(-8, 13, 7); key.castShadow = true; this.keyLight = key; this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xe10600, 4); rim.position.set(8, 6, -6); this.scene.add(rim);
    key.shadow.mapSize.set(renderProfile.shadowMapSize, renderProfile.shadowMapSize); key.castShadow = renderProfile.shadowsEnabled;
    const fill = new THREE.SpotLight(0xe5e9ef, 58, 42, Math.PI / 3.2, 0.6); fill.position.set(10, 10, 2); fill.castShadow = false; this.scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x191b20, roughness: 0.82, metalness: 0.12 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.05; floor.receiveShadow = true; this.scene.add(floor);
    const grid = new THREE.GridHelper(84, 42, 0x34383e, 0x25282d); grid.position.y = -0.035; this.scene.add(grid);
    this.addPaddockBackdrop();
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.45, 0.26, 64), new THREE.MeshStandardMaterial({ color: 0x272a30, roughness: 0.42, metalness: 0.58 })); platform.position.y = 0.08; platform.receiveShadow = true; platform.castShadow = true; this.scene.add(platform);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(5.1, 0.035, 8, 96), new THREE.MeshBasicMaterial({ color: 0xe10600 })); stripe.rotation.x = Math.PI / 2; stripe.position.y = 0.22; this.scene.add(stripe);
    this.carCustomization = { primaryColor: 0xe10600, secondaryColor: 0xf5f5f5, driverNumber: 7, model: 'apex', driver: null };
    this.car = new FormulaCar(this.scene, this.carCustomization); this.car.root.position.y = 0.27; this.car.root.scale.setScalar(1.15);
    this.circuitGroup = null; this.focus = new THREE.Vector3(0, 0.7, 0);
    this.pointerDown = (event) => { this.dragging = true; this.pointerX = event.clientX; this.renderer.domElement.setPointerCapture?.(event.pointerId); };
    this.pointerMove = (event) => { if (!this.dragging) return; this.targetRotation = applyOrbitDrag(this.targetRotation, this.pointerX, event.clientX); if (this.view !== 'circuit') this.view = 'custom'; this.pointerX = event.clientX; };
    this.pointerUp = () => { this.dragging = false; };
    this.wheel = (event) => { const factor = readGameSettings().zoomSensitivity; if (this.view === 'circuit') this.circuitSpan = THREE.MathUtils.clamp(this.circuitSpan + Math.sign(event.deltaY) * 2 * factor, 30, 180); else this.distance = adjustShowroomZoom(this.distance, event.deltaY, factor); };
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown); window.addEventListener('pointermove', this.pointerMove); window.addEventListener('pointerup', this.pointerUp); this.renderer.domElement.addEventListener('wheel', this.wheel, { passive: true });
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
    this.windowResize = () => this.resize(); window.addEventListener('resize', this.windowResize); this.resize();
    this.previous = performance.now(); this.running = true; this.frameId = requestAnimationFrame((now) => this.animate(now));
  }
  addPaddockBackdrop() {
    const backdropOffset = SHOWROOM_BACKDROP_Z - 16;
    const carbon = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.74, metalness: 0.25 });
    const graphite = new THREE.MeshStandardMaterial({ color: 0x292d33, roughness: 0.64, metalness: 0.35 });
    const red = new THREE.MeshStandardMaterial({ color: 0x8c080c, roughness: 0.52, metalness: 0.25 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x6f7d86, roughness: 0.23, metalness: 0.45, transparent: true, opacity: 0.62 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(27, 8.5, 0.8), carbon); wall.position.set(0, 4.25, SHOWROOM_BACKDROP_Z); this.scene.add(wall);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(28, 0.42, 1.1), red); fascia.position.set(0, 8.72, SHOWROOM_BACKDROP_Z); this.scene.add(fascia);
    for (const x of [-13.2, 13.2]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 8.2, 1.2), graphite); pillar.position.set(x, 4.1, 15.7 + backdropOffset); this.scene.add(pillar);
      const window = new THREE.Mesh(new THREE.BoxGeometry(0.1, 6.4, 0.15), glass); window.position.set(x * 0.92, 4.25, 15.55 + backdropOffset); this.scene.add(window);
    }
    const garageBand = new THREE.Mesh(new THREE.BoxGeometry(21, 2.7, 0.16), graphite); garageBand.position.set(0, 3.5, 15.48 + backdropOffset); this.scene.add(garageBand);
    const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(2.8, 0.06, 0.1), new THREE.MeshBasicMaterial({ color: 0xf4e9da }), 7);
    const transform = new THREE.Object3D();
    for (let index = 0; index < 7; index += 1) { transform.position.set((index - 3) * 3.3, 7.8, 14.9 + backdropOffset); transform.updateMatrix(); lights.setMatrixAt(index, transform.matrix); }
    lights.instanceMatrix.needsUpdate = true; this.scene.add(lights);
    const cabinetGeometry = new THREE.BoxGeometry(1.1, 1.35, 0.9);
    const cabinets = new THREE.InstancedMesh(cabinetGeometry, red, 4);
    for (let index = 0; index < 4; index += 1) { transform.position.set(-9 + index * 1.65, 0.68, 12.1 + backdropOffset); transform.rotation.set(0, 0.08, 0); transform.updateMatrix(); cabinets.setMatrixAt(index, transform.matrix); }
    cabinets.instanceMatrix.needsUpdate = true; this.scene.add(cabinets);
  }
  setColor(color) { this.setCustomization({ ...this.carCustomization, primaryColor: Number.parseInt(String(color).replace('#', ''), 16) }); }
  setCustomization(patch = {}) {
    const next = { primaryColor: 0xe10600, secondaryColor: 0xf5f5f5, driverNumber: 7, model: 'apex', driver: null, ...this.carCustomization, ...patch };
    for (const key of ['primaryColor', 'secondaryColor']) if (!Number.isInteger(next[key]) || next[key] < 0 || next[key] > 0xffffff) return false;
    if (!Number.isInteger(next.driverNumber) || next.driverNumber < 0 || next.driverNumber > 99) return false;
    if (!['apex', 'velocity', 'titan', 'phantom'].includes(next.model)) return false;
    const visible = this.car.root.visible;
    this.car.root.removeFromParent(); releaseSceneResources(this.car.root);
    this.carCustomization = next;
    this.car = new FormulaCar(this.scene, next); this.car.root.position.y = 0.27; this.car.root.scale.setScalar(1.15); this.car.root.visible = visible;
    return true;
  }
  setCircuit(definition) {
    if (this.circuitGroup) { this.scene.remove(this.circuitGroup); releaseSceneResources(this.circuitGroup); this.circuitGroup = null; }
    this.circuitDefinition = definition;
    const circuit = new Track(this.scene, definition); this.circuitGroup = circuit.group; this.car.root.visible = false;
    const xs = definition.waypoints.map((point) => point.x), zs = definition.waypoints.map((point) => point.z);
    this.focus.set((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
    this.circuitSpan = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + 48;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(this.circuitSpan * 2, this.circuitSpan * 2), new THREE.MeshStandardMaterial({ color: 0x25272d, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(this.focus.x, -0.22, this.focus.z); ground.receiveShadow = true; circuit.group.add(ground);
    this.originalFog ??= this.scene.fog; this.scene.fog = null;
    this.camera.fov = 48; this.camera.updateProjectionMatrix();
    this.view = 'circuit';
  }
  setVehicle() { if (this.circuitGroup) { this.scene.remove(this.circuitGroup); releaseSceneResources(this.circuitGroup); this.circuitGroup = null; } this.circuitDefinition = null; this.scene.fog = this.originalFog ?? this.scene.fog; this.car.root.visible = true; this.focus.set(window.innerWidth < 900 ? 2.5 : 0, 0.7, 0); this.camera.fov = this.originalFov; this.camera.updateProjectionMatrix(); this.view = 'threeQuarter'; this.targetRotation = Math.PI - 0.52; this.distance = 16; }
  setView(view) { const angle = getShowroomViewAngle(view); if (Number.isFinite(angle)) { this.setVehicle(); this.targetRotation = angle; this.view = view; } }
  resetCamera() { this.setView('threeQuarter'); }
  applySettings() {
    const profile = getRenderProfile();
    this.performanceMonitor?.setEnabled(profile.showFps); this.performanceMonitor?.setProfile(profile.quality);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, profile.pixelRatio));
    this.renderer.shadowMap.enabled = profile.shadowsEnabled;
    this.keyLight.castShadow = profile.shadowsEnabled;
    this.keyLight.shadow.map?.dispose?.(); this.keyLight.shadow.map = null;
    this.keyLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
    if (this.circuitGroup && this.circuitDefinition) this.setCircuit(this.circuitDefinition);
    this.resize();
    return profile;
  }
  resize() { const { clientWidth: width, clientHeight: height } = this.container; if (!width || !height) return; const profile = getRenderProfile(); const ratio = Math.min(devicePixelRatio || 1, profile.pixelRatio); if (this.renderer.getPixelRatio && Math.abs(this.renderer.getPixelRatio() - ratio) > 1e-3) this.renderer.setPixelRatio(ratio); if (!this.circuitGroup) this.focus.x = width < 900 ? 2.5 : 0; this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height); }
  setActive(active) {
    if (this.disposed || this.running === Boolean(active)) return;
    this.running = Boolean(active);
    if (this.running) { this.previous = performance.now(); this.frameId = requestAnimationFrame((now) => this.animate(now)); }
    else cancelAnimationFrame(this.frameId);
  }
  animate(now) {
    if (this.disposed || !this.running) return; this.frameId = requestAnimationFrame((time) => this.animate(time));
    const dt = Math.min((now - this.previous) / 1000, 0.05); this.previous = now;
    if (shouldAutoRotate(this.view, this.dragging)) this.targetRotation += dt * 0.08;
    this.rotation += (this.targetRotation - this.rotation) * Math.min(1, dt * 4); this.car.root.rotation.y = 0;
    if (this.view === 'circuit') { const radius = this.circuitSpan * 0.55; this.camera.position.set(this.focus.x + Math.sin(this.rotation) * radius, this.circuitSpan * 1.45, this.focus.z + Math.cos(this.rotation) * radius); this.camera.lookAt(this.focus); }
    else {
      this.camera.position.copy(getShowroomCameraPosition(this.view, this.rotation, Math.min(this.distance, SHOWROOM_MAX_CAMERA_DISTANCE), this.focus));
      this.camera.lookAt(this.focus);
    }
    this.performanceMonitor?.update(now); this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; cancelAnimationFrame(this.frameId); this.resizeObserver.disconnect(); this.performanceMonitor?.dispose(); this.performanceMonitor = null;
    this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown); this.renderer.domElement.removeEventListener('wheel', this.wheel); window.removeEventListener('pointermove', this.pointerMove); window.removeEventListener('pointerup', this.pointerUp); window.removeEventListener('resize', this.windowResize);
    releaseSceneResources(this.scene); this.scene.clear(); this.renderer.renderLists?.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
