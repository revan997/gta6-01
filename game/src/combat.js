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
    this.combo = 0; // round-4b: consecutive hits inside the combo window (2 s)
    this.comboTimer = 0; // seconds since the last landed hit
    this.hitStopTimer = 0; // seconds of freeze left after a landed hit (round 4)
    this.isDown = false;
  }

  getHealth() { return this.health; }
  getMaxHealth() { return this.maxHealth; }
  getArmour() { return this.armour; }
  getAmmo() { return this.ammo; }
  getMag() { return this.mag; }
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

  // Round-4b combo: consecutive landed hits inside a 2 s window.
  getCombo() { return this.combo; }

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
    // Round-4b: every landed hit extends the combo (HUD + sting).
    this.combo += 1;
    this.comboTimer = 0;
    this.hitStopTimer = Math.max(this.hitStopTimer, result.killed ? 0.09 : 0.05);
    if (result.killed) {
      // Killing is a heavier crime than merely hitting.
      this.hooks.police?.reportCrime?.('kill');
      if (target.kind === 'pedestrian') this.hooks.traffic?.removePedestrian?.(target);
    }
    // Round 3: record the hit point so the game loop can flash it.
    if (target?.position) {
      this.lastImpact = {
        position: {
          x: target.position.x,
          y: (target.position.y || 0) + 1.1,
          z: target.position.z,
        },
        timer: 0.12,
      };
    }
    this.lastHit = result;
    return result;
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
    this.combo = 0;
    this.comboTimer = 0;
    this.hitStopTimer = 0;
    this.muzzleTimer = 0;
    this.muzzlePosition = null;
  }
}

export function createCombatSystem(options = {}) {
  return new CombatSystem(options);
}

export default CombatSystem;
