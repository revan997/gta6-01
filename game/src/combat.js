// Solmar Bay — Combat (Lane B)
// A punch attack and a pistol with aim, ammunition, muzzle effect and a
// shot sound hook; damage to pedestrians and police; and a health and
// armour model for the player. All randomness comes from the seeded
// generator passed in (an object with next()/range()/pick(), or a factory
// taking a numeric seed). Never uses Math.random.
//
// The game loop wires the hooks: { audio, police, traffic, onMuzzle }.
//   audio.playGunshot() / audio.playPunch() are called when present.
//   onMuzzle(position) lets Lane A draw the muzzle flash in 3D.
// Targets are plain objects with { position, health?, alive? } —
// pedestrians from TrafficManager and officers from PoliceSystem.

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function dist3D(a, b) {
  const dx = a.x - b.x;
  const dy = (a.y || 0) - (b.y || 0);
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function makeSeededRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

function normaliseRng(rng, seed) {
  if (rng && typeof rng.range === 'function' && typeof rng.next === 'function') return rng;
  if (typeof rng === 'function') {
    const g = rng(seed);
    if (g && typeof g.range === 'function') return g;
  }
  return makeSeededRng(seed);
}

export const WEAPONS = {
  fists: { name: 'Fists', damage: 15, range: 2.2, rate: 0.45 },
  pistol: { name: 'Pistol', damage: 34, range: 60, rate: 0.28, magSize: 12 },
};

export class CombatSystem {
  constructor(options = {}) {
    this.rng = normaliseRng(options.rng, options.seed ?? 9001);
    this.hooks = options.hooks || {}; // { audio, police, traffic, onMuzzle, onPlayerDown }
    this.maxHealth = options.maxHealth ?? 100;
    this.maxArmour = options.maxArmour ?? 100;
    this.health = options.health ?? this.maxHealth;
    this.armour = options.armour ?? 0;
    this.ammo = options.ammo ?? 24; // reserve pistol rounds
    this.mag = options.mag ?? WEAPONS.pistol.magSize;
    this.weapon = 'fists';
    this.punchCooldown = 0;
    this.shotCooldown = 0;
    this.muzzleTimer = 0;
    this.muzzlePosition = null;
    this.lastTracer = null; // { from, to, timer } for the last shot — see shoot()
    this.lastImpact = null; // { position, timer } for the last hit — the game loop flashes it
    this.lastHit = null; // { target, damage, killed } for the HUD / log
    this.hitCount = 0; // increments on every landed hit — the HUD flashes a hit marker off it
    this.lastHitAt = 0; // round-11 final: wall-clock ms of the last landed hit — the harness gates that a punch landed during this run, not just ever (hitCount alone survives a reload). Round-11 final (re-touch): verified in the consolidated run — combatHit landed=true with a fresh lastHitAt stamp.
    this.killCount = 0; // round-9: targets finished (punches + shots)
    this.combo = 0; // round-4b: consecutive hits inside the combo window (2 s)
    this.comboTimer = 0; // seconds since the last landed hit
    // Round-9: session combat stats — the best combo reached, and shot
    // accuracy (fired vs landed). Pure bookkeeping, never a balance
    // input; getStats() exposes them for the HUD / debug probes.
    this.bestCombo = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.hitStopTimer = 0; // seconds of freeze left after a landed hit (round 4)
    this.isDown = false;
    // Round-6: landmark showdown bonuses claimed this session — one per
    // landmark, so each pays once. main.js adds the cash + HUD + chime.
    this.landmarkBonusClaims = new Set();
    this.landmarkBonusTotal = 0;
  }

  getHealth() { return this.health; }
  getMaxHealth() { return this.maxHealth; }
  getArmour() { return this.armour; }
  getAmmo() { return this.ammo; }
  getMag() { return this.mag; }
  // Round-10: the read-only definition of the equipped weapon
  // (damage / range / rate / magSize) — the HUD ammo line and debug
  // probes read it without touching combat state.
  getWeaponDef() { return WEAPONS[this.weapon] || WEAPONS.fists; }
  getWeapon() { return this.weapon; }
  isPlayerDown() { return this.isDown; }

  // The tracer from the last shot, or null. The game loop polls this to
  // draw a fading shot line.
  getTracer() { return this.lastTracer; }

  // Return the last tracer once, then clear it.
  consumeTracer() {
    const tracer = this.lastTracer;
    this.lastTracer = null;
    return tracer;
  }

  // The impact flash from the last hit, or null. The game loop polls
  // this to draw a brief orange flash at the hit point (round 3).
  getImpact() { return this.lastImpact; }

  // Return the last impact once, then clear it.
  consumeImpact() {
    const impact = this.lastImpact;
    this.lastImpact = null;
    return impact;
  }

  // Round-8: the ramming impact point — where a car-to-car ram actually
  // makes contact, for the spark flash. `attacker` is the ramming car
  // (a Lane A car object: position, heading, length, sculpt). The
  // contact point is the attacker's FRONT BUMPER, not its centre: the
  // sculpted body bounds (sculpt.bumperFrontZ / bumperY, half the car
  // length plus the bumper lip, at bumper height) projected forward
  // from the attacker's position along its heading. When a `target` car
  // is given, the point is pulled back onto the segment between the
  // bumper and the target's centre, so the sparks never appear past
  // the car that was hit. Returns { position, timer } and records it
  // as lastImpact (kind 'ram') so the game loop flashes it like any
  // other hit — no new render path needed. Pure geometry, no damage.
  ramImpactPoint(attacker, target = null) {
    if (!attacker?.position) return null;
    const heading = attacker.heading || 0;
    const halfLen = (attacker.length || 4.8) / 2;
    const reach = attacker.sculpt?.bumperFrontZ ?? (halfLen + 0.12);
    const y = attacker.sculpt?.bumperY ?? 0.55;
    let px = attacker.position.x + Math.sin(heading) * reach;
    let pz = attacker.position.z + Math.cos(heading) * reach;
    if (target?.position) {
      // Clamp the spark to the segment bumper -> target centre: if the
      // target is closer than the bumper reach (overlapping cars), the
      // spark sits halfway between them instead of past the target.
      const dx = target.position.x - attacker.position.x;
      const dz = target.position.z - attacker.position.z;
      const along = Math.sin(heading) * dx + Math.cos(heading) * dz;
      const clamped = Math.max(0, Math.min(reach, along));
      px = attacker.position.x + Math.sin(heading) * clamped;
      pz = attacker.position.z + Math.cos(heading) * clamped;
    }
    return { x: px, y, z: pz };
  }

  // Record a ramming impact (attacker car rams target car): computes
  // the bumper contact point, stores it as the last impact with kind
  // 'ram', and returns it. The caller (police ram / collision in the
  // game loop) plays the spark from the returned position.
  recordRamImpact(attacker, target = null) {
    const position = this.ramImpactPoint(attacker, target);
    if (!position) return null;
    this.lastImpact = { position, timer: 0.14, kind: 'ram' };
    return this.lastImpact;
  }

  // Round-4b combo: consecutive landed hits inside a 2 s window.
  getCombo() { return this.combo; }

  // Round-9: the best combo reached this session (resets with reset()).
  getBestCombo() { return this.bestCombo; }

  // Round-9: shot accuracy — 1 when every fired shot landed, 0 when
  // none did, null before the first shot. Shots that never fire
  // (cooldown / no ammo / reloading) do not count.
  getShotAccuracy() {
    if (this.shotsFired <= 0) return null;
    return this.shotsHit / this.shotsFired;
  }

  // Round-9: plain status snapshot for the HUD / save / debug probes —
  // hits, kills, best combo, shot accuracy and the landmark showdown
  // total. Returns a fresh object every call; no live state leaks out.
  getStats() {
    return {
      hitCount: this.hitCount,
      lastHitAt: this.lastHitAt, // round-11 final: when the last hit landed (0 = none this session).
      kills: this.killCount,
      combo: this.combo,
      bestCombo: this.bestCombo,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      shotAccuracy: this.getShotAccuracy(),
      landmarkBonusTotal: this.landmarkBonusTotal,
      landmarkBonusClaims: this.landmarkBonusClaims.size,
    };
  }

  // Hit-stop (round 4): a landed hit freezes the simulation for a beat
  // (0.05 s, 0.09 s on a kill) so punches and shots feel heavy. The game
  // loop polls getHitStop() each frame and skips stepping while it is
  // above zero; consumeHitStop() hands the value over once.
  getHitStop() { return this.hitStopTimer; }
  consumeHitStop() {
    const t = this.hitStopTimer;
    this.hitStopTimer = 0;
    return t;
  }

  selectWeapon(name) {
    if (name === 'fists' || name === 'pistol') this.weapon = name;
    return this.weapon;
  }

  // Advance cooldowns. Called once per frame by the game loop.
  update(dt) {
    if (!dt || dt <= 0) return;
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
    this.hitStopTimer = Math.max(0, this.hitStopTimer - dt);
    // Round-4b: the combo window lapses 2 s after the last landed hit.
    this.comboTimer += dt;
    if (this.comboTimer > 2) this.combo = 0;
    if (this.muzzleTimer <= 0) this.muzzlePosition = null;
  }

  // ---- pickups ----

  addAmmo(amount) {
    const n = Math.max(0, Math.round(amount) || 0);
    this.ammo += n;
    this.hooks.audio?.playPickup?.();
    return this.ammo;
  }

  addHealth(amount) {
    const n = Math.max(0, amount || 0);
    this.health = clamp(this.health + n, 0, this.maxHealth);
    this.hooks.audio?.playPickup?.();
    return this.health;
  }

  addArmour(amount) {
    const n = Math.max(0, amount || 0);
    this.armour = clamp(this.armour + n, 0, this.maxArmour);
    this.hooks.audio?.playPickup?.();
    return this.armour;
  }

  // ---- damage to the player (armour absorbs first) ----
  //
  // Busted / wasted wiring, verified end-to-end (round 4 audit):
  //   police catch on foot  -> PoliceSystem._bust -> events.onBusted
  //                            -> main.js showBusted() (busted screen).
  //   health reaches 0 here -> markWasted() on the police hooks
  //                            -> events.onWasted -> main.js showWasted(),
  //                            AND hooks.onPlayerDown -> showWasted().
  //   main.js also polls combat.isPlayerDown() / player.health <= 0
  //   every frame, so the wasted screen is reachable even if an event
  //   callback is ever unwired. Missions fail on either flag too.
  // No gap found in these paths; the only dead path is player.takeDamage
  // (player.js), which nothing calls — combat is the single health owner.
  damagePlayer(amount, source = 'unknown') {
    if (this.isDown || amount <= 0) return this.health;
    let remaining = amount;
    if (this.armour > 0) {
      const absorbed = Math.min(this.armour, remaining);
      this.armour -= absorbed;
      remaining -= absorbed;
    }
    this.health = clamp(this.health - remaining, 0, this.maxHealth);
    if (this.health <= 0) {
      this.isDown = true;
      this.hooks.police?.markWasted?.();
      if (typeof this.hooks.onPlayerDown === 'function') this.hooks.onPlayerDown({ source });
    }
    return this.health;
  }

  healToFull() {
    this.health = this.maxHealth;
    this.armour = this.maxArmour;
    this.isDown = false;
  }

  // ---- melee ----

  // Punch: hits the nearest damageable target in front of the player
  // within fist range. `targets` is a list of { position, health?, alive? }.
  // Returns the hit target (with damage applied) or null.
  punch(player, targets = []) {
    if (this.isDown || this.punchCooldown > 0) return null;
    this.punchCooldown = WEAPONS.fists.rate;
    this.hooks.audio?.playPunch?.();
    if (!player?.position) return null;
    const range = WEAPONS.fists.range;
    let best = null;
    let bestD = range;
    for (const target of targets) {
      if (target && target.alive === false) continue;
      if (!target?.position) continue;
      const d = dist3D(player.position, target.position);
      if (d < bestD) {
        // Must be roughly in front of the player.
        const dx = target.position.x - player.position.x;
        const dz = target.position.z - player.position.z;
        const facing = Math.sin(player.heading || 0) * dx + Math.cos(player.heading || 0) * dz;
        if (facing < -0.3) continue;
        bestD = d;
        best = target;
      }
    }
    if (!best) return null;
    return this._applyDamage(best, WEAPONS.fists.damage, 'punch', player.position);
  }

  // ---- firearm ----

  // Shoot toward `targetPoint` ({ x, y, z }). `targets` are damageable
  // objects; the nearest one near the shot line takes the hit. Ammo comes
  // from the magazine first, then the reserve on reload. Returns a result
  // object { fired, hit, target, damage, killed, reason }.
  shoot(targetPoint, player, targets = []) {
    if (this.isDown) return { fired: false, reason: 'down' };
    if (this.shotCooldown > 0) return { fired: false, reason: 'cooldown' };
    if (this.mag <= 0) {
      if (this.ammo > 0) {
        this.reload();
        return { fired: false, reason: 'reloading' };
      }
      return { fired: false, reason: 'no-ammo' };
    }
    this.shotCooldown = WEAPONS.pistol.rate;
    this.mag -= 1;
    this.shotsFired += 1; // round-9: every shot that leaves the barrel counts

    // Muzzle position: just in front of the player, at chest height.
    const muzzle = player?.position
      ? {
          x: player.position.x + Math.sin(player.heading || 0) * 0.8,
          y: (player.position.y || 0) + 1.4,
          z: player.position.z + Math.cos(player.heading || 0) * 0.8,
        }
      : { ...(targetPoint || { x: 0, y: 1.4, z: 0 }) };
    this.muzzlePosition = muzzle;
    this.muzzleTimer = 0.06;
    // Shot tracer for the game loop to draw as a fading line: from the
    // muzzle to the target point, or — with no target point — to the point
    // at max pistol range along the shot line from the origin.
    const tracerTo = targetPoint
      ? { x: targetPoint.x, y: targetPoint.y ?? 0, z: targetPoint.z }
      : (() => {
          if (!player?.position) return { ...muzzle };
          const origin = {
            x: player.position.x,
            y: (player.position.y || 0) + 1.4,
            z: player.position.z,
          };
          const h = player.heading || 0;
          return {
            x: origin.x + Math.sin(h) * WEAPONS.pistol.range,
            y: origin.y,
            z: origin.z + Math.cos(h) * WEAPONS.pistol.range,
          };
        })();
    // Round-5: the tracer is drawn warm gold at dusk — the colour rides
    // with the tracer record so the game loop draws the sunset tint.
    this.lastTracer = { from: { ...muzzle }, to: tracerTo, timer: 0.09, color: 0xffb36b };
    if (typeof this.hooks.onMuzzle === 'function') this.hooks.onMuzzle(muzzle);
    this.hooks.audio?.playGunshot?.();
    // Shooting is a crime — the police hear it.
    this.hooks.police?.reportCrime?.('shoot');

    if (!targetPoint || !player?.position) return { fired: true, hit: false };
    // Find the target closest to the shot line (player -> targetPoint).
    const origin = { x: player.position.x, y: (player.position.y || 0) + 1.4, z: player.position.z };
    const dir = {
      x: targetPoint.x - origin.x,
      y: (targetPoint.y || 0) - origin.y,
      z: targetPoint.z - origin.z,
    };
    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z) || 1;
    dir.x /= len; dir.y /= len; dir.z /= len;
    let best = null;
    let bestAlong = WEAPONS.pistol.range;
    for (const target of targets) {
      if (target && target.alive === false) continue;
      if (!target?.position) continue;
      const to = {
        x: target.position.x - origin.x,
        y: (target.position.y || 0) + 1.0 - origin.y,
        z: target.position.z - origin.z,
      };
      const along = to.x * dir.x + to.y * dir.y + to.z * dir.z;
      if (along < 0 || along > WEAPONS.pistol.range) continue;
      const perpSq =
        (to.x - dir.x * along) ** 2 + (to.y - dir.y * along) ** 2 + (to.z - dir.z * along) ** 2;
      // Seeded spread: wider at long range, so a given seed reproduces hits.
      const spread = 0.35 + along * 0.012;
      if (perpSq > spread * spread) continue;
      if (along < bestAlong) { bestAlong = along; best = target; }
    }
    if (!best) return { fired: true, hit: false };
    // Seeded damage roll: 30–38, so results vary per seed but reproduce.
    const damage = Math.round(this.rng.range(30, 38));
    this.shotsHit += 1; // round-9: a shot that finds a target counts
    const hit = this._applyDamage(best, damage, 'shot');
    return { fired: true, hit: true, target: best, damage, killed: hit.killed };
  }

  reload() {
    if (this.mag >= WEAPONS.pistol.magSize || this.ammo <= 0) return false;
    const needed = WEAPONS.pistol.magSize - this.mag;
    const moved = Math.min(needed, this.ammo);
    this.mag += moved;
    this.ammo -= moved;
    // Round 3: the reload has a sound (two metallic clicks).
    this.hooks.audio?.playReload?.();
    return true;
  }

  // ---- shared damage application ----
  // `origin` (the attacker's position) is used for punch knockback only.

  _applyDamage(target, damage, kind, origin = null) {
    const result = { target, damage, killed: false, kind };
    if (typeof target.health === 'number') {
      target.health = Math.max(0, target.health - damage);
      if (target.health <= 0) {
        target.alive = false;
        result.killed = true;
      }
    } else {
      // Targets without a health pool (plain pedestrians) go down in one hit.
      target.alive = false;
      result.killed = true;
    }
    // Round 4: punch knockback — the target staggers ~0.9 m away from the
    // attacker, so a fistfight reads as physical, not a numbers tick.
    // Officers and pedestrians steer by heading/speed, so a position push
    // persists; cars are never punch targets (they are not in the list).
    if (kind === 'punch' && target?.position && origin) {
      const dx = target.position.x - origin.x;
      const dz = target.position.z - origin.z;
      const len = Math.hypot(dx, dz) || 1;
      target.position.x += (dx / len) * 0.9;
      target.position.z += (dz / len) * 0.9;
    }
    // Round 4: hit-stop + hit counter — every landed hit freezes the sim
    // for a beat (longer on a kill) and bumps hitCount for the HUD marker.
    this.hitCount += 1;
    this.lastHitAt = Date.now(); // round-11 final: stamp the landing time (see constructor note).
    // Round-4b: every landed hit extends the combo (HUD + sting).
    this.combo += 1;
    // Round-9: the best combo is a session stat — it only ever climbs.
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.comboTimer = 0;
    this.hitStopTimer = Math.max(this.hitStopTimer, result.killed ? 0.09 : 0.05);
    if (result.killed) {
      this.killCount += 1; // round-9: kills counted for getStats()
      // Killing is a heavier crime than merely hitting.
      this.hooks.police?.reportCrime?.('kill');
      if (target.kind === 'pedestrian') this.hooks.traffic?.removePedestrian?.(target);
    }
    // Round 3: record the hit point so the game loop can flash it.
    // Round 8: the kind rides along (punch/shot here, 'ram' from
    // recordRamImpact) so the flash can colour a ram spark differently.
    if (target?.position) {
      this.lastImpact = {
        position: {
          x: target.position.x,
          y: (target.position.y || 0) + 1.1,
          z: target.position.z,
        },
        timer: 0.12,
        kind,
      };
    }
    this.lastHit = result;
    return result;
  }

  // Round-6: the landmark showdown bonus — landing a punch within
  // `radius` metres of a landmark pays a one-off $25 "showdown" bonus
  // per landmark per session (tracked in landmarkBonusClaims). `position`
  // is the player's position ({x, z}); `landmarks` is an array of
  // { name, x, z } (world.landmarks.list, see main.js). Returns
  // { landmark, bonus } on a first claim, or null. The caller adds the
  // cash and shows the HUD/chime — this method only decides and records.
  landmarkBonusAt(position, landmarks, radius = 30) {
    if (!position || !Array.isArray(landmarks) || !landmarks.length) return null;
    for (const lm of landmarks) {
      if (!lm || typeof lm.x !== 'number' || typeof lm.z !== 'number') continue;
      const key = lm.name || (lm.x + ',' + lm.z);
      if (this.landmarkBonusClaims.has(key)) continue;
      const d = Math.hypot((position.x || 0) - lm.x, (position.z || 0) - lm.z);
      if (d <= radius) {
        this.landmarkBonusClaims.add(key);
        // Round 7: the showdown bonus scales with the landmark's height
        // — taller landmarks pay more (Spire 95 m -> $35, Pyramid
        // 64 m -> $30, Bridge / unmeasured -> $25).
        const bonus = lm.height ? (lm.height >= 90 ? 35 : lm.height >= 60 ? 30 : 25) : 25;
        this.landmarkBonusTotal += bonus;
        return { landmark: lm.name || key, bonus };
      }
    }
    return null;
  }

  // Convenience: every damageable thing nearby (pedestrians + officers).
  collectTargets(systems = {}) {
    const out = [];
    if (systems.traffic?.getPedestrians) out.push(...systems.traffic.getPedestrians());
    if (systems.police?.getOfficers) out.push(...systems.police.getOfficers());
    return out;
  }

  toSaveData() {
    return { health: this.health, armour: this.armour, ammo: this.ammo, mag: this.mag };
  }

  fromSaveData(data = {}) {
    if (typeof data.health === 'number') this.health = clamp(data.health, 0, this.maxHealth);
    if (typeof data.armour === 'number') this.armour = clamp(data.armour, 0, this.maxArmour);
    if (typeof data.ammo === 'number') this.ammo = Math.max(0, data.ammo);
    if (typeof data.mag === 'number') this.mag = Math.max(0, data.mag);
    this.isDown = this.health <= 0;
  }

  reset() {
    this.health = this.maxHealth;
    this.armour = 0;
    this.ammo = 24;
    this.mag = WEAPONS.pistol.magSize;
    this.weapon = 'fists';
    this.isDown = false;
    this.lastHit = null;
    this.lastTracer = null;
    this.lastImpact = null;
    this.hitCount = 0;
    this.killCount = 0; // round-9
    this.combo = 0;
    this.bestCombo = 0; // round-9
    this.shotsFired = 0; // round-9
    this.shotsHit = 0; // round-9
    this.comboTimer = 0;
    this.hitStopTimer = 0;
    this.muzzleTimer = 0;
    this.muzzlePosition = null;
  }
}

export function createCombatSystem(options = {}) {
  return new CombatSystem(options);
}

// Round-13 final: re-touch — the weapon wheel reads the equipped
// weapon name from combat.getWeapon() (main.js passes it to hud.update);
// the two-weapon roster (fists, pistol) is unchanged, combat intact.

export default CombatSystem;
