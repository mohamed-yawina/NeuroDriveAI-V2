import * as THREE from 'three';

export class SensorDebug {
  constructor(scene, count = 5) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.lines = [];
    for (let i = 0; i < count; i++) {
      const geometry = new THREE.BufferGeometry();
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x67f0c0, depthTest: false }));
      line.renderOrder = 11;
      this.lines.push(line);
      this.group.add(line);
    }
    scene.add(this.group);
  }

  update(readings) {
    readings.forEach((reading, index) => {
      const end = reading.end.clone().setY(0.9);
      const origin = reading.origin.clone().setY(0.9);
      this.lines[index].geometry.setFromPoints([origin, end]);
      this.lines[index].material.color.set(reading.hit ? 0xff9b59 : 0x67f0c0);
    });
  }

  toggle() { this.group.visible = !this.group.visible; return this.group.visible; }
}
