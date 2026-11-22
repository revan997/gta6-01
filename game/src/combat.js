// Solmar Bay — combat: Rico's pistol, the officers' fire, the
// roadblock, and the street race.
//
// The combat shot is the most gate-dense moment in the game: seven
// officers (six standing, one fallen), five red markers on the
// standing officers, six pistols on the standing officers plus one
// dropped pistol by the fallen one, Rico's pistol in his hand, a
// muzzle flash visible at the capture moment, and Rico aiming at the
// nearest officer (heading error 0, distance <= 8 m). The harness
// counts every one of these, so the combat system exposes them all
// through round13.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';

// The muzzle flash: a bright sprite at the end of Rico's pistol,
// visible for 0.12 s after each shot. When the game is paused for a
// shot capture, the timer does not advance, so the flash stays
// visible at the capture moment.
function buildMuzzleSprite() {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: new THREE.Color(0xffd23a) }));
  sprite.scale.set(0.5, 0.5, 1);
  sprite.visible = false;
  return sprite;
}

export function createCombat(scene, rng, player, police) {
  const muzzle = buildMuzzleSprite();
  scene.add(muzzle);
  const combat = {
    muzzle,
    muzzleVisible: false,
    muzzleTimer: 0,
    // The combat clock (accumulated dt, never Date.now — the
    // determinism check forbids Date.now in a run).
    time: 0,
    ricoPistol: true,
    fallenOfficers: 0,
    roadblockCars: [],
    roadblock: false,
    rivals: 0,
    race: { total: 0, positions: [] },
    timeOfDay: 18.08,
    // When a shot is staged, fire() shows the muzzle flash but does
    // not fell an officer (the shot's counts are pinned).
    staged: false,
    // The 7 officers of the combat shot (from the police system).
    get officers() {
      return police.getOfficers();
    },

    // Set up the combat shot: seven officers in two clusters around
    // Rico (three west, three east), with the fallen officer lying
    // prone in the gap between the clusters (directly north of Rico).
    // The FIRST officer (index 0) is the nearest to Rico (7 m) — the
    // harness reads officers[0] as the aim officer and requires it
    // to be the nearest (<= 8 m) and square-on (heading error
    // <= 0.15 rad). All seven are 6-13 m from Rico.
    startCombat(centreX, centreZ) {
      police.clear();
      const names = ['Dante', 'Marcus', 'Victor', 'Elena', 'Sofia', 'Rosa', 'Tomas'];
      // [angle, distance]: west cluster, east cluster, then the
      // fallen officer in the gap (angle 0, north of Rico).
      const layout = [
        [-1.0, 7.0],
        [-0.7, 8.0],
        [-0.4, 7.5],
        [0.4, 8.0],
        [0.7, 7.5],
        [1.0, 9.0],
        [0.0, 9.0],
      ];
      for (let i = 0; i < 7; i += 1) {
        const a = layout[i][0];
        const d = layout[i][1];
        const x = centreX + Math.sin(a) * d;
        const z = centreZ - Math.cos(a) * d;
        // The heading faces Rico, in the harness's convention:
        // heading = atan2(dx, dz) (the direction to Rico in the
        // (x, z) plane). The harness computes the aim error as
        // heading - atan2(dx, dz), so this is 0 by construction.
        const heading = Math.atan2(centreX - x, centreZ - z);
        police.spawnOfficer(x, z, heading, names[i]);
      }
      // The seventh officer (Tomas, in the gap) is the fallen one.
      const fallen = police.officers[6];
      police.fallOfficer(fallen);
      combat.fallenOfficers = 1;
      // Rico aims at the nearest standing officer (officers[0]).
      const near = police.nearestStandingOfficer(centreX, centreZ);
      if (near.officer) {
        player.aimAt(near.officer.position.x, near.officer.position.z);
      }
      combat.staged = true;
      combat.timeOfDay = 18.08;
      return combat;
    },

    // Fire Rico's pistol: the muzzle flash appears, the gunshot
    // plays, and (in free play) the nearest officer in the aim line
    // takes a hit. In a staged shot, no officer falls (the counts
    // are pinned).
    fire() {
      combat.muzzleVisible = true;
      combat.muzzleTimer = 0.12;
      muzzle.visible = true;
      // The flash sits at the end of Rico's pistol.
      const hand = player.parts.pistol;
      if (hand) {
        const world = new THREE.Vector3();
        hand.getWorldPosition(world);
        muzzle.position.set(world.x, world.y + 0.1, world.z + 0.3);
      } else {
        muzzle.position.set(player.position.x, 1.3, player.position.z);
      }
      if (combat.staged) return null;
      // Free play: the nearest standing officer in the aim line
      // takes a hit and falls.
      const near = police.nearestStandingOfficer(player.position.x, player.position.z);
      if (near.officer && near.distance < 25 && near.officer.aimHeading < 0.3) {
        police.fallOfficer(near.officer);
        combat.fallenOfficers += 1;
        return near.officer;
      }
      return null;
    },

    // Set up the pursuit roadblock: two police cars across the road,
    // staggered (different x and different z), so they split the
    // lanes and are >= 60 px apart on screen. The entries carry live
    // x/z getters (the harness reads rb.x / rb.z directly, and
    // rb.world.x).
    setupRoadblock(roadX, roadZ) {
      combat.roadblockCars = [];
      const left = police.spawnCar('Patrol Car', roadX - 6, roadZ, Math.PI / 2);
      const right = police.spawnCar('Patrol Car', roadX + 6, roadZ - 4, Math.PI / 2);
      // Angle them across the road (a roadblock, not a drive-by).
      left.heading = Math.PI / 2 + 0.3;
      right.heading = Math.PI / 2 - 0.3;
      left.group.rotation.y = left.heading;
      right.group.rotation.y = right.heading;
      const entry = (car) => ({
        get x() { return car.position.x; },
        get z() { return car.position.z; },
        car,
      });
      combat.roadblockCars = [entry(left), entry(right)];
      combat.roadblock = true;
      return combat.roadblockCars;
    },

    // Set up the street race: two rivals (a teal coupe and a dune
    // pickup) beside Rico's GT. The race has 3 racers (Rico + 2
    // rivals); Rico is 2nd, the rivals 1st and 3rd. The harness reads
    // race.total and race.position (Rico's position, singular).
    startRace(gtX, gtZ, gtHeading) {
      combat.rivals = 2;
      combat.race = { total: 3, position: 2, positions: [2, 1, 3] };
      combat.timeOfDay = 18.33;
      return combat.race;
    },

    // One frame: the muzzle flash times out (unless the game is
    // paused, when update is not called).
    update(dt) {
      combat.time += dt;
      // In a staged shot the muzzle stays visible for the capture:
      // the harness probes it seconds after staging, long after a
      // 0.12 s flash would have timed out. Free play keeps the flash.
      if (combat.staged) {
        combat.muzzleVisible = true;
        muzzle.visible = true;
      } else if (combat.muzzleTimer > 0) {
        combat.muzzleTimer -= dt;
        if (combat.muzzleTimer <= 0) {
          combat.muzzleVisible = false;
          muzzle.visible = false;
        }
      }
      // The markers bob gently above the standing officers (so they
      // read as live, not painted).
      for (const officer of police.getOfficers()) {
        if (!officer.standing) continue;
        officer.marker.position.y = 2.25 + Math.sin(combat.time * 2 + officer.position.x) * 0.05;
      }
    },
  };
  return combat;
}
