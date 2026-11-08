import { Vector3 } from 'three';

const MODES = ['chase', 'hood', 'cockpit', 'rear', 'trackside', 'overview'];

export class RaceCameras {
  constructor(camera, track) {
    this.camera = camera;
    this.baseFov = camera.fov;
    this.track = track;
    this.mode = 'chase';
    this.effectsEnabled = true;
    this.targetId = null;
    this.podiumAngle = 0.35;
    this.tvElapsed = 0; this.tvShot = 0; this.tvCameras = [];
    this.positionTarget = new Vector3();
    this.lookTarget = new Vector3();
    this.forward = new Vector3();
    this.right = new Vector3();
    this.center = new Vector3();
    const bounds = track.waypoints.reduce((result, point) => {
      result.minX = Math.min(result.minX, point.x); result.maxX = Math.max(result.maxX, point.x);
      result.minZ = Math.min(result.minZ, point.z); result.maxZ = Math.max(result.maxZ, point.z);
      return result;
    }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    this.center.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
    const cameraCount = Math.min(8, track.waypoints.length);
    for (let i = 0; i < cameraCount; i++) {
      const index = Math.floor(i * track.waypoints.length / cameraCount);
      const point = track.waypoints[index], next = track.waypoints[(index + 1) % track.waypoints.length];
      const tangent = next.clone().sub(point).setY(0).normalize(), normal = new Vector3(-tangent.z, 0, tangent.x);
      this.tvCameras.push(point.clone().addScaledVector(normal, 26 + (i % 2) * 8).add(new Vector3(0, 10 + (i % 3) * 2, 0)));
    }
    this.photoPreviousMode = 'chase'; this.photoYaw = 0; this.photoPitch = 0.32; this.photoDistance = 24;
  }

  setTarget(carId) { this.targetId = carId; }
  setMode(mode) {
    if (mode === 'tv') { if (this.mode !== 'tv') this.previousMode = this.mode; this.mode = mode; }
    else if (MODES.includes(mode)) this.mode = mode;
    return this.mode;
  }
  setPhotoMode(enabled) {
    if (enabled && this.mode !== 'photo') { this.photoPreviousMode = this.mode; this.mode = 'photo'; }
    else if (!enabled && this.mode === 'photo') this.mode = this.photoPreviousMode;
    return this.mode;
  }
  orbitPhoto(dx, dy) { this.photoYaw -= dx * 0.006; this.photoPitch = Math.max(-0.12, Math.min(1.2, this.photoPitch + dy * 0.004)); }
  zoomPhoto(delta) { this.photoDistance = Math.max(7, Math.min(90, this.photoDistance * Math.exp(delta * 0.001))); return this.photoDistance; }
  nextMode() { const index = MODES.indexOf(this.mode); this.mode = MODES[(Math.max(0, index) + 1) % MODES.length]; return this.mode; }

  update(cars, dt) {
    let car = cars[0];
    for (const candidate of cars) if (candidate.id === this.targetId) { car = candidate; break; }
    if (!car) return;
    const safeDt = Math.min(0.1, Math.max(0, Number(dt) || 0));
    const blend = 1 - Math.exp(-safeDt * 4.5);
    const speed = car.velocity?.length?.() ?? 0;
    const speedRatio = Math.min(1, speed / 58);
    const dynamicFov = this.effectsEnabled && (this.mode === 'chase' || this.mode === 'hood') ? 2.2 * speedRatio : 0;
    const nextFov = this.camera.fov + (this.baseFov + dynamicFov - this.camera.fov) * (1 - Math.exp(-safeDt * 2.8));
    if (Math.abs(nextFov - this.camera.fov) > 0.002) { this.camera.fov = nextFov; this.camera.updateProjectionMatrix(); }

    if (this.mode === 'podium') {
      this.podiumAngle += safeDt * 0.035;
      this.positionTarget.set(Math.sin(this.podiumAngle) * 23, 9, Math.cos(this.podiumAngle) * 23);
      this.lookTarget.set(0, 2.8, -1.5);
      this.camera.up.set(0, 1, 0); this.camera.position.lerp(this.positionTarget, blend);
      this.camera.lookAt(this.lookTarget); return;
    }
    this.forward.copy(car.forward).setY(0).normalize();
    this.lookTarget.copy(car.position);

    if (this.mode === 'tv') {
      this.tvElapsed += safeDt;
      if (this.tvElapsed >= 7) { this.tvElapsed = 0; this.tvShot = (this.tvShot + 1) % Math.max(1, this.tvCameras.length); }
      let leader = car;
      for (const candidate of cars) if ((candidate.completedLaps ?? 0) > (leader.completedLaps ?? 0)
        || ((candidate.completedLaps ?? 0) === (leader.completedLaps ?? 0) && (candidate.progress ?? 0) > (leader.progress ?? 0))) leader = candidate;
      this.positionTarget.copy(this.tvCameras[this.tvShot] ?? this.center);
      if (!this.tvCameras[this.tvShot]) { this.positionTarget.y += 20; this.positionTarget.z += 30; }
      this.camera.up.set(0, 1, 0); this.camera.position.lerp(this.positionTarget, blend);
      this.lookTarget.copy(leader.position).y += 1; this.camera.lookAt(this.lookTarget); return;
    }
    if (this.mode === 'photo') {
      this.lookTarget.copy(car.position).y += 1;
      const horizontal = this.photoDistance * Math.cos(this.photoPitch);
      this.positionTarget.set(Math.sin(this.photoYaw) * horizontal, this.photoDistance * Math.sin(this.photoPitch), Math.cos(this.photoYaw) * horizontal).add(this.lookTarget);
      this.camera.up.set(0, 1, 0); this.camera.position.lerp(this.positionTarget, blend); this.camera.lookAt(this.lookTarget); return;
    }
    if (this.mode === 'overview') {
      this.positionTarget.copy(this.center); this.positionTarget.y += 205; this.positionTarget.z += 0.01; this.lookTarget.copy(this.center);
      this.camera.up.set(0, 0, -1); this.camera.position.lerp(this.positionTarget, blend); this.camera.lookAt(this.lookTarget); return;
    }
    this.camera.up.set(0, 1, 0);
    if (this.mode === 'cockpit') {
      this.positionTarget.copy(car.position).addScaledVector(this.forward, 1.45); this.positionTarget.y += 1.25;
      this.lookTarget.addScaledVector(this.forward, 48); this.lookTarget.y += 1;
      this.camera.position.lerp(this.positionTarget, blend); this.camera.lookAt(this.lookTarget); return;
    }
    if (this.mode === 'hood') {
      this.positionTarget.copy(car.position).addScaledVector(this.forward, 3.05); this.positionTarget.y += 1.42;
      this.lookTarget.addScaledVector(this.forward, 64); this.lookTarget.y += 1.2;
      this.camera.position.lerp(this.positionTarget, blend); this.camera.lookAt(this.lookTarget); return;
    }
    if (this.mode === 'rear') {
      this.positionTarget.copy(car.position).addScaledVector(this.forward, -3.5); this.positionTarget.y += 1.55;
      this.lookTarget.addScaledVector(this.forward, -45); this.lookTarget.y += 1.25;
      this.camera.position.lerp(this.positionTarget, blend); this.camera.lookAt(this.lookTarget); return;
    }
    this.right.set(this.forward.z, 0, -this.forward.x).normalize();
    if (this.mode === 'trackside') {
      this.positionTarget.copy(car.position).addScaledVector(this.right, 17).addScaledVector(this.forward, -6); this.positionTarget.y += 8;
    } else {
      this.positionTarget.copy(car.position).addScaledVector(this.forward, -(15 + speedRatio * 5)); this.positionTarget.y += 7.5 + speedRatio * 2.2;
    }
    this.lookTarget.addScaledVector(this.forward, 6 + speedRatio * 7); this.lookTarget.y += 1.35;
    this.camera.position.lerp(this.positionTarget, blend); this.camera.lookAt(this.lookTarget);
  }
}
