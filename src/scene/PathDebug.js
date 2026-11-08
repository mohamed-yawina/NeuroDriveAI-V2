import * as THREE from 'three';

export class PathDebug {
  constructor(scene, waypoints, halfWidth) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.group.visible = false;
    this.velocity = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 1, 0x39c7ff, 1.3, 0.7);
    this.steering = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xffa43a, 1.1, 0.6);
    this.group.add(this.velocity, this.steering);
    this.predicted = this.marker(0xffd34e, 0.8);
    this.projection = this.marker(0xffffff, 0.65);
    this.target = this.marker(0x63f1ad, 0.95);
    this.group.add(this.predicted, this.projection, this.target);
    this.group.add(this.boundary(waypoints, halfWidth), this.boundary(waypoints, -halfWidth));
  }

  marker(color, radius) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), new THREE.MeshBasicMaterial({ color, depthTest: false }));
    mesh.renderOrder = 10;
    return mesh;
  }

  boundary(points, side) {
    const vertices = points.map((point, index) => {
      const before = points[(index - 1 + points.length) % points.length];
      const after = points[(index + 1) % points.length];
      const tangent = new THREE.Vector3().subVectors(after, before).normalize();
      return point.clone().add(new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(side)).setY(0.24);
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
    const line = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: side > 0 ? 0xff6868 : 0x69e9c5, depthTest: false }));
    line.renderOrder = 9;
    return line;
  }

  update(vehicle, metrics) {
    this.velocity.position.copy(vehicle.position).setY(1.1);
    const velocity = vehicle.velocity.clone();
    if (velocity.lengthSq() > 1e-6) this.velocity.setDirection(velocity.normalize());
    this.velocity.setLength(Math.max(0.1, Math.min(18, vehicle.velocity.length() * 0.45)));
    this.steering.position.copy(vehicle.position).setY(1.25);
    const force = vehicle.steering.clone();
    if (force.lengthSq() > 1e-6) this.steering.setDirection(force.normalize());
    this.steering.setLength(Math.max(0.1, Math.min(9, vehicle.steering.length() * 0.7)));
    this.predicted.position.copy(metrics.predictedPosition).setY(0.9);
    this.projection.position.copy(metrics.projection).setY(0.9);
    this.target.position.copy(metrics.target).setY(0.9);
  }

  toggle() { this.group.visible = !this.group.visible; return this.group.visible; }
}
