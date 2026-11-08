import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { OvertakingPlanner } from '../src/game/OvertakingPlanner.js';
import { RaceWorld } from '../src/game/RaceWorld.js';
import { GameCar } from '../src/game/GameCar.js';
import { RaceSession } from '../src/game/RaceSession.js';
import { formatRaceForce, getRaceCoachSnapshot, renderRaceForceVectors } from '../src/game/RaceCoach.js';

const track = () => createGeneralizationTracks()[0];
const makeCar = (id, x, z, number = 1) => new GameCar({ id, number, position: new Vector3(x, 0, z), forward: new Vector3(1, 0, 0) });

describe('Ultimate Edition lot 1: race explainability and live arcade controls', () => {
  it('exposes live steering force components, the saturated resultant and path measurements', () => {
    const world = new RaceWorld(track());
    const ai = world.cars.find((car) => !car.isPlayer);
    ai.controller.compute({ car: ai, cars: world.cars, deltaTime: 1 / 60 });
    const snapshot = getRaceCoachSnapshot(ai);
    expect(snapshot.behaviors.map(({ name }) => name)).toEqual(['pathFollowing', 'obstacleAvoidance', 'separation', 'pursuit']);
    expect(snapshot.path.segmentIndex).toEqual(expect.any(Number));
    expect(snapshot.behaviors.find(({ name }) => name === 'pathFollowing').force.magnitude).toBeGreaterThan(0);
    expect(snapshot.resultant.magnitude).toBeLessThanOrEqual(ai.maxForce + 1e-6);
    expect(renderRaceForceVectors(snapshot)).toContain('aria-label="Vecteurs de forces Steering calculés en temps réel"');
    expect(formatRaceForce(snapshot.resultant)).toContain('(');
  });

  it('changes actual behavior activation, weights and parameters at runtime', () => {
    const world = new RaceWorld(track());
    const ai = world.cars.find((car) => !car.isPlayer);
    const controller = ai.controller;
    controller.configureBehavior('pathFollowing', { active: false });
    controller.configureBehavior('obstacleAvoidance', { active: false });
    controller.configureBehavior('separation', { active: false });
    controller.configureBehavior('pursuit', { active: false });
    controller.configureBehavior('separation', { active: true, weight: 7.5, parameters: { neighborRadius: 14 } });
    const force = controller.compute({ car: ai, cars: [ai], deltaTime: 1 / 60 });
    expect(force.length()).toBe(0);
    const separation = controller.getBehaviorConfiguration().find(({ name }) => name === 'separation');
    expect(separation).toMatchObject({ active: true, weight: 7.5 });
    expect(controller.separationBehavior.neighborRadius).toBe(14);
    expect(() => controller.configureBehavior('separation', { parameters: { unknown: 1 } })).toThrow(RangeError);
    controller.resetConfiguration();
    expect(controller.separationBehavior.neighborRadius).toBe(9);
    expect(controller.getBehaviorConfiguration().every(({ active }) => active)).toBe(true);
  });

  it('applies distinct real driving parameters for AI personality profiles and restores the arcade defaults', () => {
    const world = new RaceWorld(track());
    const ai = world.cars.find((car) => !car.isPlayer);
    const controller = ai.controller;
    const defaultSpeed = ai.maxSpeed;
    controller.setProfile('prudent');
    expect(ai.maxSpeed).toBeCloseTo(defaultSpeed * 0.9);
    expect(controller.manager.entryFor('separation').weight).toBe(22);
    controller.setProfile('aggressive');
    expect(ai.maxSpeed).toBeCloseTo(defaultSpeed * 1.035);
    expect(controller.overtaking.triggerDistance).toBe(33);
    expect(() => controller.setProfile('random')).toThrow(RangeError);
    controller.reset();
    expect(ai.maxSpeed).toBe(defaultSpeed);
    expect(controller.profile).toBe('balanced');
    expect(controller.obstacleBehavior.lookAhead).toBe(62);
  });

  it('exposes real maxSpeed and maxForce controls through the arcade controller', () => {
    const world = new RaceWorld(track());
    const ai = world.cars.find((car) => !car.isPlayer);
    ai.controller.setMaxSpeed(43.5);
    ai.controller.setMaxForce(17.5);
    const force = ai.controller.compute({ car: ai, cars: [ai], deltaTime: 1 / 60 });
    expect(ai.maxSpeed).toBe(43.5);
    expect(ai.maxForce).toBe(17.5);
    expect(force.length()).toBeLessThanOrEqual(17.5 + 1e-6);
    expect(() => ai.controller.setMaxSpeed(70)).toThrow(RangeError);
    ai.controller.resetConfiguration();
    expect(ai.maxSpeed).toBe(56);
    expect(ai.maxForce).toBe(28);
  });

  it('defends once in a safe adjacent lane and keeps that side while the pursuer remains behind', () => {
    const raceTrack = { waypoints: [new Vector3(0, 0, 0), new Vector3(100, 0, 0), new Vector3(100, 0, 100), new Vector3(0, 0, 100)] };
    const defender = makeCar('defender', 30, 0, 1);
    const pursuer = makeCar('pursuer', 16, 0, 2);
    const planner = new OvertakingPlanner(raceTrack);
    planner.defenseEnabled = true;
    const first = planner.update(defender, [defender, pursuer], 0.1);
    const chosenSide = first.defense.side;
    expect(first.defense).toMatchObject({ active: true, safe: true });
    expect(first.desiredOffset).not.toBe(0);
    const second = planner.update(defender, [defender, pursuer], 0.1);
    expect(second.defense.side).toBe(chosenSide);
    expect(Math.abs(second.laneOffset)).toBeGreaterThan(Math.abs(first.laneOffset));
    const blocker = makeCar('blocker', 25, chosenSide * 4.55, 3);
    const blocked = planner.update(defender, [defender, pursuer, blocker], 0.1);
    expect(blocked.defense.safe).toBe(false);
    expect(blocked.desiredOffset).toBe(0);
    pursuer.position.set(45, 0, 0);
    const cleared = planner.update(defender, [defender, pursuer, blocker], 0.1);
    expect(cleared.defense).toBeNull();
  });

  it('derives professor explanations from planner and path follower observations', () => {
    const world = new RaceWorld(track());
    const ai = world.cars.find((car) => !car.isPlayer);
    ai.controller.compute({ car: ai, cars: world.cars, deltaTime: 1 / 60 });
    const explanation = ai.controller.getDecisionSummary();
    expect(explanation).toMatch(/Path Following|Dépassement|Adversaire|Courbure/);
    expect(getRaceCoachSnapshot(ai).decision).toBe(explanation);
    expect(getRaceCoachSnapshot({ controller: {} })).toBeNull();
  });

  it('opens and closes the live professor panel through its navigation control', () => {
    const panel = { classList: { hidden: true, contains() { return this.hidden; }, toggle(_name, hidden) { this.hidden = hidden; } } };
    const button = { setAttribute: vi.fn() };
    const session = Object.create(RaceSession.prototype);
    session.ui = { querySelector: (selector) => selector === '#race-coach' ? panel : button };
    session.updateCoachPanel = vi.fn();
    session.toggleCoach(true);
    expect(panel.classList.hidden).toBe(false);
    expect(button.setAttribute).toHaveBeenLastCalledWith('aria-expanded', 'true');
    expect(session.updateCoachPanel).toHaveBeenCalledOnce();
    session.toggleCoach(false);
    expect(panel.classList.hidden).toBe(true);
  });
});
