import * as THREE from 'three';
import { createTrackBoundaries, createTrackWaypoints } from './trackGeometry.js';
import { getRenderProfile } from '../settings/GameSettings.js';

const SEGMENTS = 700;

function createAsphaltTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const index = (y * size + x) * 4;
    const noise = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(x * y, 1442695041)) >>> 0;
    const grain = (noise & 23) - 11;
    const patch = Math.sin(x * 0.043 + Math.sin(y * 0.031) * 2.4) * 2.1 + Math.sin(y * 0.067 + Math.cos(x * 0.019) * 1.3) * 1.6;
    const fineAggregate = noise % 137 === 0 ? -18 : noise % 113 === 0 ? 9 : 0;
    const value = Math.max(32, Math.min(91, 66 + grain + patch + fineAggregate));
    data[index] = value; data[index + 1] = value + 4; data[index + 2] = value + 8; data[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

export class Track {
  constructor(scene, definition = null) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    const fallbackPoints = createTrackWaypoints();
    const selected = definition ?? { waypoints: fallbackPoints, boundaries: createTrackBoundaries(fallbackPoints) };
    this.id = selected.id ?? 'original';
    this.label = selected.label ?? selected.name ?? 'Circuit Azur';
    this.waypoints = selected.waypoints;
    this.controlPoints = selected.controlPoints ?? null;
    this.boundaries = selected.boundaries;
    this.halfWidth = selected.halfWidth ?? (Number.isFinite(selected.width) ? selected.width / 2 : 8.2);
    this.sceneryDensity = getRenderProfile().sceneryDensity;
    this.build();
  }

  createWaypoints() { return createTrackWaypoints(); }

  build() {
    const curve = new THREE.CatmullRomCurve3(this.waypoints, true, 'centripetal');
    const samples = curve.getPoints(SEGMENTS);
    const roadPositions = [];
    const roadUvs = [];
    const trackLength = curve.getLength();
    for (let index = 0; index < SEGMENTS; index++) {
      const t = index / SEGMENTS, nextT = (index + 1) / SEGMENTS;
      const point = curve.getPointAt(t), next = curve.getPointAt(nextT);
      const tangent = curve.getTangentAt(t), nextTangent = curve.getTangentAt(nextT);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const nextNormal = new THREE.Vector3(-nextTangent.z, 0, nextTangent.x).normalize();
      const left = point.clone().addScaledVector(normal, this.halfWidth).setY(0.11);
      const right = point.clone().addScaledVector(normal, -this.halfWidth).setY(0.11);
      const nextLeft = next.clone().addScaledVector(nextNormal, this.halfWidth).setY(0.11);
      const nextRight = next.clone().addScaledVector(nextNormal, -this.halfWidth).setY(0.11);
      roadPositions.push(...left.toArray(), ...right.toArray(), ...nextRight.toArray(), ...left.toArray(), ...nextRight.toArray(), ...nextLeft.toArray());
      const u = t * trackLength / 9, nextU = nextT * trackLength / 9;
      roadUvs.push(u, 0, u, 1, nextU, 1, u, 0, nextU, 1, nextU, 0);
    }
    const roadGeometry = new THREE.BufferGeometry();
    roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
    roadGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
    roadGeometry.computeVertexNormals();
    this.asphaltMaterial = new THREE.MeshStandardMaterial({ color: 0xb5b9bc, map: createAsphaltTexture(), roughness: 0.94, side: THREE.DoubleSide });
    this.asphaltBaseColor = new THREE.Color(0xb5b9bc); this.asphaltWetColor = new THREE.Color(0x8b9ca7);
    const road = new THREE.Mesh(roadGeometry, this.asphaltMaterial);
    road.receiveShadow = true;
    this.group.add(road);

    const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xeff5f6, roughness: 0.7 });
    const lineOffset = Math.max(1, this.halfWidth - 0.7);
    for (const side of [-1, 1]) {
      const points = samples.map((point, index) => {
        const tangent = curve.getTangent(index / (samples.length - 1));
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        return point.clone().addScaledVector(normal, side * lineOffset).setY(0.42);
      });
      this.group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), SEGMENTS, 0.16, 5, true), lineMaterial));
    }
    this.addCurbs(curve);
    this.addRubberLines(curve);
    this.addRunoff(curve);
    this.addBarriers(curve);
    this.addBrakingMarkers(curve);
    this.addStartFinish(curve);
    this.addWaypoints();
  }

  // Render-only racing-line deposits; they reuse the runtime spline and never
  // participate in collision, projection, lap counting or steering geometry.
  addRubberLines(curve) {
    if (this.sceneryDensity < 0.7) return;
    const sampleCount = Math.max(48, Math.round(112 * this.sceneryDensity));
    const rubberMaterial = new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.98, transparent: true, opacity: 0.32, depthWrite: false });
    for (const lateralOffset of [-0.92, 0.92]) {
      const points = [];
      for (let index = 0; index <= sampleCount; index += 1) {
        const t = index / sampleCount, point = curve.getPointAt(t), tangent = curve.getTangentAt(t);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        points.push(point.addScaledVector(normal, lateralOffset).setY(0.126));
      }
      const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true, 'centripetal'), sampleCount, 0.12, 4, true), rubberMaterial);
      line.name = 'render-only-rubber-line'; line.renderOrder = 2; this.group.add(line);
    }
  }

  setWetness(wetness) {
    const amount = THREE.MathUtils.clamp(wetness, 0, 1);
    this.asphaltMaterial.color.copy(this.asphaltBaseColor).lerp(this.asphaltWetColor, amount * 0.52);
    this.asphaltMaterial.roughness = 0.94 - amount * 0.49;
    this.asphaltMaterial.metalness = amount * 0.16;
    this.asphaltMaterial.needsUpdate = true;
  }

  addCurbs(curve) {
    const geometry = new THREE.BoxGeometry(1.45, 0.16, 2.1);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const segmentCount = Math.max(20, Math.round(220 * this.sceneryDensity));
    const curbCount = segmentCount * 2;
    const curbs = new THREE.InstancedMesh(geometry, material, curbCount);
    const transform = new THREE.Object3D();
    const instanceColor = new THREE.Color();
    let instance = 0;
    for (let index = 0; index < segmentCount; index++) {
      const t = index / segmentCount, point = curve.getPointAt(t), tangent = curve.getTangentAt(t);
      const angle = Math.atan2(tangent.x, tangent.z);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      for (const side of [-1, 1]) {
        if (index % 5 > 2) continue;
        transform.position.copy(point).addScaledVector(normal, side * (this.halfWidth + 0.15)).setY(0.2);
        transform.rotation.set(0, angle, 0); transform.updateMatrix();
        curbs.setMatrixAt(instance, transform.matrix);
        curbs.setColorAt(instance, instanceColor.setHex(Math.floor(index / 2) % 2 ? 0xef4655 : 0xf1f3ed));
        instance += 1;
      }
    }
    curbs.count = instance; curbs.instanceMatrix.needsUpdate = true;
    if (curbs.instanceColor) curbs.instanceColor.needsUpdate = true;
    curbs.castShadow = false; curbs.receiveShadow = true; this.group.add(curbs);
  }

  addRunoff(curve) {
    const positions = [];
    for (let index = 0; index < SEGMENTS; index++) {
      const t = index / SEGMENTS, nextT = (index + 1) / SEGMENTS;
      const point = curve.getPointAt(t), next = curve.getPointAt(nextT);
      const tangent = curve.getTangentAt(t), nextTangent = curve.getTangentAt(nextT);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const nextNormal = new THREE.Vector3(-nextTangent.z, 0, nextTangent.x).normalize();
      const outer = point.clone().addScaledVector(normal, this.halfWidth + 3.8).setY(0.08);
      const inner = point.clone().addScaledVector(normal, this.halfWidth + 0.1).setY(0.08);
      const nextOuter = next.clone().addScaledVector(nextNormal, this.halfWidth + 3.8).setY(0.08);
      const nextInner = next.clone().addScaledVector(nextNormal, this.halfWidth + 0.1).setY(0.08);
      positions.push(...outer.toArray(), ...inner.toArray(), ...nextInner.toArray(), ...outer.toArray(), ...nextInner.toArray(), ...nextOuter.toArray());
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const runoff = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x526773, roughness: 0.95, side: THREE.DoubleSide }));
    runoff.receiveShadow = true;
    this.group.add(runoff);
  }

  addBarriers(curve) {
    const geometry = new THREE.BoxGeometry(3.8, 0.78, 0.85);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const segmentCount = Math.max(20, Math.round(112 * this.sceneryDensity));
    const barriers = new THREE.InstancedMesh(geometry, material, segmentCount * 2);
    const transform = new THREE.Object3D();
    const instanceColor = new THREE.Color();
    let instance = 0;
    for (let index = 0; index < segmentCount; index++) {
      const t = index / segmentCount, point = curve.getPointAt(t), tangent = curve.getTangentAt(t);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      for (const side of [-1, 1]) {
        if (index % 3 === 1) continue;
        transform.position.copy(point).addScaledVector(normal, side * (this.halfWidth + 6.1)).setY(0.55);
        transform.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0); transform.updateMatrix();
        barriers.setMatrixAt(instance, transform.matrix);
        barriers.setColorAt(instance, instanceColor.setHex(index % 6 < 3 ? 0x77848a : 0x23313a));
        instance += 1;
      }
    }
    barriers.count = instance; barriers.instanceMatrix.needsUpdate = true;
    if (barriers.instanceColor) barriers.instanceColor.needsUpdate = true;
    barriers.castShadow = false; barriers.receiveShadow = true; this.group.add(barriers);
  }

  addStartFinish(curve) {
    const start = this.waypoints[0];
    const tangent = new THREE.Vector3().subVectors(this.waypoints[1], start).setY(0).normalize();
    const gate = new THREE.Group();
    const materials = [0x111b22, 0xf4f4ee].map((color) => new THREE.MeshStandardMaterial({ color }));
    let tileIndex = 0;
    if (Math.abs(this.halfWidth - 8.2) < 1e-8) {
      for (let x = -7; x <= 7; x += 2) {
        const tile = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.035, 0.8), materials[Math.abs(x / 2) % 2]);
        tile.position.set(x, 0.14, 0); gate.add(tile);
      }
    } else {
      for (let x = -this.halfWidth + 0.9; x < this.halfWidth; x += 2) {
        const tile = new THREE.Mesh(new THREE.BoxGeometry(Math.min(1.95, this.halfWidth - x), 0.035, 0.8), materials[tileIndex % 2]);
        tile.position.set(x, 0.14, 0); gate.add(tile); tileIndex += 1;
      }
    }
    gate.position.copy(start).addScaledVector(tangent, 4);
    gate.rotation.y = Math.atan2(tangent.x, tangent.z);
    this.startLightMaterials = [];
    const carbon = new THREE.MeshStandardMaterial({ color: 0x15191e, roughness: 0.8, metalness: 0.45 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(this.halfWidth * 2 + 2, 0.65, 0.7), carbon);
    frame.position.set(0, 8.4, 0); gate.add(frame);
    for (const x of [-this.halfWidth - 0.65, this.halfWidth + 0.65]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 8.6, 0.55), carbon);
      post.position.set(x, 4.25, 0); gate.add(post);
    }
    const lightHousing = new THREE.Mesh(new THREE.BoxGeometry(5.1, 1.2, 0.9), carbon);
    lightHousing.position.set(0, 7.65, 0.05); gate.add(lightHousing);
    for (let index = 0; index < 5; index += 1) {
      const lightMaterial = new THREE.MeshBasicMaterial({ color: 0x341013 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), lightMaterial);
      lamp.position.set((index - 2) * 0.88, 7.65, 0.55); gate.add(lamp); this.startLightMaterials.push(lightMaterial);
    }
    this.startGate = gate;
    this.group.add(gate);
    this.addPitBuilding(start, tangent);
    this.addGrandstands(curve);
    this.addTracksideAds(curve);
  }

  addTracksideAds(curve) {
    const count = Math.max(8, Math.round(18 * this.sceneryDensity));
    const board = new THREE.InstancedMesh(new THREE.BoxGeometry(7.2, 1.25, 0.22), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.12 }), count);
    const stripe = new THREE.InstancedMesh(new THREE.BoxGeometry(7.2, 0.12, 0.25), new THREE.MeshStandardMaterial({ color: 0xe10600, roughness: 0.5, metalness: 0.18 }), count);
    const transform = new THREE.Object3D();
    const colors = [0x252a31, 0xf5f5f5, 0x8c080c, 0x252a31, 0x414b55, 0xf5f5f5];
    for (let index = 0; index < count; index += 1) {
      const fraction = (index + 0.5) / count;
      const point = curve.getPointAt(fraction), tangent = curve.getTangentAt(fraction);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const side = index % 2 ? -1 : 1;
      transform.position.copy(point).addScaledVector(normal, side * (this.halfWidth + 10.5)).setY(1.65);
      transform.rotation.set(0, Math.atan2(tangent.x, tangent.z) + side * Math.PI / 2, 0);
      transform.updateMatrix(); board.setMatrixAt(index, transform.matrix); stripe.setMatrixAt(index, transform.matrix);
      board.setColorAt(index, new THREE.Color(colors[index % colors.length]));
      transform.position.y += 0.59; transform.updateMatrix(); stripe.setMatrixAt(index, transform.matrix);
    }
    board.instanceMatrix.needsUpdate = true; stripe.instanceMatrix.needsUpdate = true;
    if (board.instanceColor) board.instanceColor.needsUpdate = true;
    board.castShadow = false; board.receiveShadow = true; stripe.castShadow = false;
    this.group.add(board, stripe);
  }

  addBrakingMarkers(curve) {
    const samples = 800;
    let apexFraction = 0.25, maximumTurn = -Infinity;
    for (let index = 4; index < samples - 4; index += 1) {
      const fraction = index / samples;
      if (fraction < 0.08 || fraction > 0.92) continue;
      const before = curve.getTangentAt((index - 1) / samples);
      const after = curve.getTangentAt((index + 1) / samples);
      const turn = Math.acos(THREE.MathUtils.clamp(before.dot(after), -1, 1));
      if (turn > maximumTurn) { maximumTurn = turn; apexFraction = fraction; }
    }
    const length = curve.getLength();
    const boardMaterial = new THREE.MeshStandardMaterial({ color: 0x171b20, roughness: 0.7, metalness: 0.2 });
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0xa3a8aa, roughness: 0.58, metalness: 0.55 });
    const digitMaterial = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
    const segmentMap = { 0: [0, 1, 2, 3, 4, 5], 1: [1, 2], 5: [0, 2, 3, 5, 6] };
    const markerGroup = new THREE.Group();
    this.brakingMarkers = [];
    for (const distance of [150, 100, 50]) {
      const fraction = ((apexFraction * length - distance) % length + length) % length / length;
      const point = curve.getPointAt(fraction), tangent = curve.getTangentAt(fraction);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      for (const side of [-1, 1]) {
        const sign = new THREE.Group();
        sign.position.copy(point).addScaledVector(normal, side * (this.halfWidth + 10.8));
        sign.rotation.y = Math.atan2(tangent.x, tangent.z) - side * Math.PI / 2;
        const board = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.82, 0.16), boardMaterial);
        board.position.y = 3.25; sign.add(board);
        for (const x of [-1.23, 1.23]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.05, 0.12), postMaterial);
          post.position.set(x, 1.72, 0); sign.add(post);
        }
        const specs = [];
        String(distance).split('').forEach((digit, digitIndex) => {
          const offsetX = (digitIndex - 1) * 0.72;
          for (const segment of segmentMap[digit]) {
            if ([0, 3, 6].includes(segment)) {
              const y = segment === 0 ? 3.49 : segment === 3 ? 3.01 : 3.25;
              specs.push({ x: offsetX, y, sx: 0.24, sy: 0.055 });
            } else {
              const right = [1, 2].includes(segment);
              const lower = [2, 3, 4].includes(segment);
              specs.push({ x: offsetX + (right ? 0.15 : -0.15), y: 3.25 + (lower ? -0.12 : 0.12), sx: 0.055, sy: 0.19 });
            }
          }
        });
        const segments = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), digitMaterial, specs.length);
        const transform = new THREE.Object3D();
        specs.forEach(({ x, y, sx, sy }, index) => { transform.position.set(x, y, 0.105); transform.scale.set(sx, sy, 0.04); transform.updateMatrix(); segments.setMatrixAt(index, transform.matrix); });
        segments.instanceMatrix.needsUpdate = true; sign.add(segments);
        sign.userData.distanceToApex = distance; markerGroup.add(sign); this.brakingMarkers.push(sign);
      }
    }
    this.group.add(markerGroup);
  }

  setStartLights(count) {
    const active = Math.max(0, Math.min(this.startLightMaterials?.length ?? 0, Math.floor(count)));
    this.startLightMaterials?.forEach((material, index) => material.color.setHex(index < active ? 0xe10600 : 0x341013));
  }

  addPitBuilding(start, tangent) {
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const center = start.clone().addScaledVector(normal, this.halfWidth + 18).addScaledVector(tangent, 10);
    const building = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(34, 7, 8), new THREE.MeshStandardMaterial({ color: 0x222832, roughness: 0.82 }));
    body.position.y = 3.5; building.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(36, 0.7, 9), new THREE.MeshStandardMaterial({ color: 0x8c080c, roughness: 0.62, metalness: 0.18 }));
    roof.position.y = 7.35; building.add(roof);
    const windows = new THREE.Mesh(new THREE.BoxGeometry(31, 2.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x8faab4, roughness: 0.25, metalness: 0.3 }));
    windows.position.set(0, 4.8, 4.06); building.add(windows);
    building.position.copy(center); building.rotation.y = Math.atan2(tangent.x, tangent.z);
    body.castShadow = roof.castShadow = false; body.receiveShadow = roof.receiveShadow = false;
    this.group.add(building);
  }

  addGrandstands(curve) {
    const positions = [];
    const standSegments = Math.max(6, Math.round(16 * this.sceneryDensity));
    for (let index = 0; index < standSegments; index += 1) {
      const t = index / standSegments, point = curve.getPointAt(t), tangent = curve.getTangentAt(t);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      for (const side of [-1, 1]) {
        if (index % 4 === 0 && side < 0) continue;
        const center = point.clone().addScaledVector(normal, side * (this.halfWidth + 24));
        positions.push({ center, angle: Math.atan2(tangent.x, tangent.z) });
      }
    }
    const geometry = new THREE.BoxGeometry(18, 0.65, 2.4);
    const material = new THREE.MeshStandardMaterial({ color: 0x303943, roughness: 0.92 });
    const stands = new THREE.InstancedMesh(geometry, material, positions.length * 4);
    const transform = new THREE.Object3D(); const instanceColor = new THREE.Color(); let instance = 0;
    positions.forEach(({ center, angle }, standIndex) => {
      for (let row = 0; row < 4; row += 1) {
        transform.position.copy(center).add(new THREE.Vector3(0, 1 + row * 0.8, row * 0.32));
        transform.rotation.set(0, angle + Math.PI / 2, 0); transform.updateMatrix();
        stands.setMatrixAt(instance, transform.matrix);
        stands.setColorAt(instance, instanceColor.setHex(standIndex % 2 ? 0x303943 : 0x3c4651));
        instance += 1;
      }
    });
    stands.instanceMatrix.needsUpdate = true; if (stands.instanceColor) stands.instanceColor.needsUpdate = true;
    stands.castShadow = false; stands.receiveShadow = true; this.group.add(stands);
    const crowdCount = Math.min(600, positions.length * 12);
    const crowdGeometry = new THREE.SphereGeometry(0.25, 5, 4);
    const crowdMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    this.crowd = new THREE.InstancedMesh(crowdGeometry, crowdMaterial, crowdCount);
    this.crowdBaseY = new Float32Array(crowdCount); this.crowdPhase = new Float32Array(crowdCount);
    const crowdColors = [0xdadada, 0xe10600, 0x1976d2, 0xffd04b, 0x3ba879];
    const crowdMatrix = new THREE.Object3D(), color = new THREE.Color();
    for (let index = 0; index < crowdCount; index++) {
      const stand = positions[Math.floor(index / 12)], seat = index % 12;
      crowdMatrix.position.set(stand.center.x + (seat - 5.5) * 0.78, 5.6 + (seat % 2) * 0.18, stand.center.z + ((Math.floor(index / 6) % 2) ? 0.3 : -0.3));
      crowdMatrix.scale.set(0.72, 1 + (seat % 3) * 0.12, 0.72); crowdMatrix.updateMatrix(); this.crowd.setMatrixAt(index, crowdMatrix.matrix);
      this.crowdBaseY[index] = crowdMatrix.position.y; this.crowdPhase[index] = index * 1.71; this.crowd.setColorAt(index, color.setHex(crowdColors[index % crowdColors.length]));
    }
    this.crowd.instanceMatrix.needsUpdate = true; if (this.crowd.instanceColor) this.crowd.instanceColor.needsUpdate = true; this.crowd.castShadow = false; this.group.add(this.crowd);
  }

  updateCrowd(dt, excitement = 0.12) {
    if (!this.crowd) return;
    this.crowd.userData.elapsed = (this.crowd.userData.elapsed ?? 0) + Math.max(0, dt);
    const elapsed = this.crowd.userData.elapsed, amount = THREE.MathUtils.clamp(excitement, 0, 1), transform = new THREE.Object3D();
    for (let index = 0; index < this.crowd.count; index++) {
      this.crowd.getMatrixAt(index, transform.matrix); transform.matrix.decompose(transform.position, transform.quaternion, transform.scale);
      transform.position.y = this.crowdBaseY[index] + Math.sin(elapsed * (3 + amount * 9) + this.crowdPhase[index]) * (0.025 + amount * 0.22);
      transform.updateMatrix(); this.crowd.setMatrixAt(index, transform.matrix);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
  }

  addWaypoints() {
    const group = new THREE.Group();
    // Path references remain available in Steering Academy, while race line decoration stays understated.
    const geometry = new THREE.SphereGeometry(0.24, 8, 5);
    const material = new THREE.MeshBasicMaterial({ color: 0x8c080c, transparent: true, opacity: 0.48 });
    for (const point of this.controlPoints ?? this.waypoints) {
      const marker = new THREE.Mesh(geometry, material);
      marker.position.copy(point).setY(0.85);
      group.add(marker);
    }
    this.group.add(group);
  }
}
