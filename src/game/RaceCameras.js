import { Vector3 } from 'three';

const MODES = ['chase', 'trackside', 'cockpit', 'overview'];

export class RaceCameras {
  constructor(camera, track) {
    this.camera = camera;
    this.baseFov = camera.fov;
    this.track = track;
    this.mode = 'chase';
    this.targetId = null;
    this.podiumAngle = 0.35;
    this.tvElapsed = 0; this.tvShot = 0; this.tvCameras = [];
    for (let i = 0; i < Math.min(8, track.waypoints.length); i++) {
      const index = Math.floor(i * track.waypoints.length / Math.min(8, track.waypoints.length));
      const point = track.waypoints[index], next = track.waypoints[(index + 1) % track.waypoints.length];
      const tangent = next.clone().sub(point).setY(0).normalize(), normal = new Vector3(-tangent.z, 0, tangent.x);
      this.tvCameras.push(point.clone().addScaledVector(normal, 26 + (i % 2) * 8).add(new Vector3(0, 10 + (i % 3) * 2, 0)));
    }
    this.photoPreviousMode = 'chase'; this.photoYaw = 0; this.photoPitch = 0.32; this.photoDistance = 24;
    this.lookAt = new Vector3();
    const xs = track.waypoints.map((point) => point.x), zs = track.waypoints.map((point) => point.z);
    this.center = new Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
  }

  setTarget(carId) { this.targetId = carId; }
  setMode(mode) { if (mode === 'tv' || MODES.includes(mode)) this.mode = mode; return this.mode; }
  setPhotoMode(enabled) {
    if (enabled && this.mode !== 'photo') { this.photoPreviousMode = this.mode; this.mode = 'photo'; }
    else if (!enabled && this.mode === 'photo') this.mode = this.photoPreviousMode;
    return this.mode;
  }
  orbitPhoto(dx, dy) { this.photoYaw -= dx * 0.006; this.photoPitch = Math.max(-0.12, Math.min(1.2, this.photoPitch + dy * 0.004)); }
  zoomPhoto(delta) { this.photoDistance = Math.max(7, Math.min(90, this.photoDistance * Math.exp(delta * 0.001))); return this.photoDistance; }
  nextMode() { const index = MODES.indexOf(this.mode); this.mode = MODES[(Math.max(0, index) + 1) % MODES.length]; return this.mode; }

  update(cars, dt) {
    const subject = cars.find((candidate) => candidate.id === this.targetId) ?? cars[0];
    const fovSpeedRatio = Math.min(1, (subject?.velocity?.length?.() ?? 0) / 58);
    const targetFov = this.mode === 'chase' ? this.baseFov + fovSpeedRatio * 2.2 : this.baseFov;
    const nextFov = this.camera.fov + (targetFov - this.camera.fov) * (1 - Math.exp(-Math.max(0, dt) * 2.8));
    if (Math.abs(nextFov - this.camera.fov) > 0.02) { this.camera.fov = nextFov; this.camera.updateProjectionMatrix(); }
    if (this.mode === 'podium') {
      const blend = 1 - Math.exp(-Math.max(0, dt) * 2.4);
      this.podiumAngle += Math.max(0, dt) * 0.035;
      this.camera.up.set(0, 1, 0);
      this.camera.position.lerp(new Vector3(Math.sin(this.podiumAngle) * 23, 9, Math.cos(this.podiumAngle) * 23), blend);
      this.lookAt.lerp(new Vector3(0, 2.8, -1.5), blend);
      this.camera.lookAt(this.lookAt);
      return;
    }
    const car = subject;
    if (!car) return;
    const blend = 1 - Math.exp(-Math.max(0, dt) * 4.5);
    if (this.mode === 'tv') {
      this.tvElapsed += Math.max(0, dt);
      if (this.tvElapsed >= 7) { this.tvElapsed = 0; this.tvShot = (this.tvShot + 1) % Math.max(1, this.tvCameras.length); }
      const leader = [...cars].sort((a, b) => b.completedLaps - a.completedLaps || b.progress - a.progress)[0] ?? car;
      this.camera.up.set(0, 1, 0); this.camera.position.lerp(this.tvCameras[this.tvShot] ?? this.center.clone().add(new Vector3(0, 20, 30)), blend);
      this.lookAt.lerp(leader.position.clone().add(new Vector3(0, 1, 0)), blend); this.camera.lookAt(this.lookAt); return;
    }
    if (this.mode === 'photo') {
      const center = car.position.clone().add(new Vector3(0, 1, 0));
      const horizontal = this.photoDistance * Math.cos(this.photoPitch);
      const position = center.clone().add(new Vector3(Math.sin(this.photoYaw) * horizontal, this.photoDistance * Math.sin(this.photoPitch), Math.cos(this.photoYaw) * horizontal));
      this.camera.up.set(0, 1, 0); this.camera.position.lerp(position, blend); this.lookAt.lerp(center, blend); this.camera.lookAt(this.lookAt); return;
    }
    if (this.mode === 'overview') {
      this.camera.up.set(0, 0, -1);
      this.camera.position.lerp(this.center.clone().add(new Vector3(0, 205, 0.01)), blend);
      this.lookAt.lerp(this.center, blend);
      this.camera.lookAt(this.lookAt);
      return;
    }
    this.camera.up.set(0, 1, 0);
    let position;
    if (this.mode === 'cockpit') {
      position = car.position.clone().addScaledVector(car.forward, 1.45).add(new Vector3(0, 1.25, 0));
      this.lookAt.copy(car.position).addScaledVector(car.forward, 48).add(new Vector3(0, 1, 0));
      this.camera.position.lerp(position, blend);
      this.camera.lookAt(this.lookAt);
      return;
    }
    const right = new Vector3(car.forward.z, 0, -car.forward.x).normalize();
    const speed = Math.min(58, car.velocity?.length?.() ?? 0);
    const speedRatio = speed / 58;
    position = this.mode === 'trackside'
      ? car.position.clone().addScaledVector(right, 17).add(new Vector3(0, 8, 0)).addScaledVector(car.forward, -6)
      : car.position.clone().addScaledVector(car.forward, -(15 + speedRatio * 5)).add(new Vector3(0, 7.5 + speedRatio * 2.2, 0));
    this.lookAt.copy(car.position).addScaledVector(car.forward, 6 + speedRatio * 7).add(new Vector3(0, 1.35, 0));
    this.camera.position.lerp(position, blend);
    this.camera.lookAt(this.lookAt);
  }
}
