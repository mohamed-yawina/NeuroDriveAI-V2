import * as THREE from 'three';

const MAX_EFFECTS = 96;
const RAIN_STREAKS = 96;

/** Fixed-capacity procedural visual effects. Particle state is cosmetic and never enters RaceWorld. */
export class RaceParticles {
  constructor(scene, { bounds = 80 } = {}) {
    this.scene = scene; this.bounds = bounds; this.effects = []; this.rainEnabled = false; this.elapsed = 0; this.disposed = false;
    this.effectPositions = new Float32Array(MAX_EFFECTS * 3); this.effectColors = new Float32Array(MAX_EFFECTS * 3);
    this.effectGeometry = new THREE.BufferGeometry();
    this.effectGeometry.setAttribute('position', new THREE.BufferAttribute(this.effectPositions, 3));
    this.effectGeometry.setAttribute('color', new THREE.BufferAttribute(this.effectColors, 3));
    this.effectMaterial = new THREE.PointsMaterial({ size: 0.62, vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false, sizeAttenuation: true });
    this.effectPoints = new THREE.Points(this.effectGeometry, this.effectMaterial); scene.add(this.effectPoints);
    this.rainPositions = new Float32Array(RAIN_STREAKS * 6);
    for (let i = 0; i < RAIN_STREAKS; i++) { const x = ((i * 37) % 101) / 50 - 1, z = ((i * 61) % 97) / 48 - 1; this.rainPositions.set([x, 4, z, x - 0.12, 2.8, z - 0.12], i * 6); }
    this.rainGeometry = new THREE.BufferGeometry(); this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainMaterial = new THREE.LineBasicMaterial({ color: 0xa9d5e8, transparent: true, opacity: 0.38 });
    this.rainLines = new THREE.LineSegments(this.rainGeometry, this.rainMaterial); this.rainLines.visible = false; scene.add(this.rainLines);
  }
  setRain(enabled) { this.rainEnabled = Boolean(enabled); this.rainLines.visible = this.rainEnabled; }
  emit(position, type = 'dust', count = 12) {
    const color = type === 'water' ? 0x8fcce5 : type === 'smoke' ? 0x777b80 : 0xb99766;
    for (let i = 0; i < count; i++) {
      const angle = (i * 2.399) % (Math.PI * 2), radius = ((i * 17) % 11) * 0.08;
      this.effects.push({ x: position.x + Math.cos(angle) * radius, y: 0.28 + (i % 5) * 0.12, z: position.z + Math.sin(angle) * radius, vx: Math.cos(angle) * 0.7, vy: 1.2 + (i % 4) * 0.22, vz: Math.sin(angle) * 0.7, life: 0.65 + (i % 5) * 0.08, color });
    }
    if (this.effects.length > MAX_EFFECTS) this.effects.splice(0, this.effects.length - MAX_EFFECTS);
  }
  update(dt, follow = null) {
    if (this.disposed) return;
    const step = Math.max(0, Math.min(dt, 0.1)); this.elapsed += step;
    for (const particle of this.effects) { particle.life -= step; particle.x += particle.vx * step; particle.y += particle.vy * step; particle.z += particle.vz * step; particle.vy -= 2.8 * step; }
    this.effects = this.effects.filter((particle) => particle.life > 0);
    this.effects.forEach((particle, index) => {
      this.effectPositions.set([particle.x, particle.y, particle.z], index * 3);
      const color = new THREE.Color(particle.color).multiplyScalar(Math.min(1, particle.life));
      this.effectColors.set([color.r, color.g, color.b], index * 3);
    });
    this.effectGeometry.setDrawRange(0, this.effects.length); this.effectGeometry.attributes.position.needsUpdate = true; this.effectGeometry.attributes.color.needsUpdate = true;
    if (this.rainEnabled && follow) {
      for (let i = 0; i < RAIN_STREAKS; i++) {
        const offset = i * 6, phase = (this.elapsed * (18 + i % 11) + i * 0.71) % 24;
        const x = follow.x + (((i * 37) % 101) / 50 - 1) * this.bounds, z = follow.z + (((i * 61) % 97) / 48 - 1) * this.bounds;
        this.rainPositions.set([x, follow.y + 8 - phase / 3, z, x - 0.15, follow.y + 6.7 - phase / 3, z - 0.15], offset);
      }
      this.rainGeometry.attributes.position.needsUpdate = true;
    }
  }
  dispose() { if (this.disposed) return; this.disposed = true; this.scene.remove(this.effectPoints, this.rainLines); this.effectGeometry.dispose(); this.effectMaterial.dispose(); this.rainGeometry.dispose(); this.rainMaterial.dispose(); this.effects.length = 0; }
}
