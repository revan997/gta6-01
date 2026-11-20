// Solmar Bay — Combat (Lane B)
// Round-13B: the staged combat shot gives its six officers a visible
// pistol mesh + red marker (main.js makePersonMesh hostile flag); the
// CombatSystem pistol itself is unchanged.
// Round 14: no combat change — the staged aim pose lives in player.js
// (setAim) and the frozen muzzle flash in main.js.
// A punch attack and firearms with aim, ammunition, muzzle effect and a
// shot sound hook; damage to pedestrians and police; and a health and
// armour model for the player. Round 17: the arsenal is fists, pistol,
// SMG (fast, 30-round mag) and shotgun (heavy, 6-shell mag) — all four
// are real definitions in WEAPONS, unlocked by finishing missions 1 / 3.
// Round 18: the rifle joins them (mission 4's reward, 38 dmg / 90 m
// range / 24-round mag) — all five wheel slots are real guns now.
// All randomness comes from the seeded
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
  pistol: { name: 'Pistol', damage: 34, range: 60, rate: 0.28, magSize: 12, reserveStart: 24 },
  // Round 17: two REAL unlockable firearms — the wheel's slots 3-4
  // stop being LOCKED placeholders. SMG: fast, light hits, big mag
  // (Mama Lou's gift for finishing mission 1). Shotgun: slow, heavy
  // hits, short range, tiny mag (mission 3's reward). Both are
  // full combat definitions (damage / range / rate / magSize /
  // reserveStart) — shoot() / reload() / equip() read them, never a
  // hardcoded pistol value. Round 18: the rifle (slot 5) joins them
  // the same way — mission 4's reward, a real definition below.
  smg: { name: 'SMG', damage: 18, range: 55, rate: 0.09, magSize: 30, reserveStart: 60 },
  shotgun: { name: 'Shotgun', damage: 55, range: 28, rate: 0.9, magSize: 6, reserveStart: 12 },
  // Round 18: the RIFLE is real now — the long-range precision gun
  // (Mama Lou's reward for finishing mission 4, Long Tail). Damage
  // 38 (tuned off the plan's 34 so it is distinct from the pistol's
  // 34), range 90 (the longest in the arsenal), slow-ish rate 0.14,
  // 24-round mag, 48 in reserve. shoot() / reload() / equip() read
  // it like every other gun; the wheel's slot 5 is LOCKED only until
  // mission 4 is done, never because the gun has no code.
  rifle: { name: 'Rifle', damage: 38, range: 90, rate: 0.14, magSize: 24, reserveStart: 48 },
};
// Round 18: wheel order — the HUD renders these five slots; all five
// WEAPONS keys can now be owned (the rifle joins fists / pistol /
// SMG / shotgun once mission 4 is finished).
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];

export class CombatSystem {
  constructor(options = {}) {
    this.rng = normaliseRng(options.rng, options.seed ?? 9001);
    this.hooks = options.hooks || {}; // { audio, police, traffic, onMuzzle, onPlayerDown }
    this.maxHealth = options.maxHealth ?? 100;
    this.maxArmour = options.maxArmour ?? 100;
    this.health = options.health ?? this.maxHealth;
    this.armour = options.armour ?? 0;
    // Round 17: the owned arsenal + per-weapon ammo. this.ammo /
    // this.mag always mirror the EQUIPPED weapon (the rest of the
    // class + the HUD read those two fields); the maps hold every
    // weapon's load, so switching guns never destroys a magazine.
    // A fresh profile owns fists + pistol; SMG / shotgun arrive via
    // unlockWeapon() (mission 1 / mission 3 rewards).
    this.owned = new Set(['fists', 'pistol']);
    this.ammoByWeapon = { fists: 0, pistol: options.ammo ?? 24, smg: 0, shotgun: 0, rifle: 0 };
    this.magByWeapon = { fists: 0, pistol: options.mag ?? WEAPONS.pistol.magSize, smg: 0, shotgun: 0, rifle: 0 };
    this.ammo = this.ammoByWeapon.pistol;
    this.mag = this.magByWeapon.pistol;
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
    if (typeof name !== 'string') return this.weapon;
    const key = name.toLowerCase();
    // Round 17: a locked weapon is REFUSED — the equipped weapon
    // stays put, never silently swapped for another gun.
    if (!WEAPONS[key] || !this.owned.has(key)) return this.weapon;
    if (key !== this.weapon) {
      // Park the outgoing weapon's load, load the incoming one.
      this.ammoByWeapon[this.weapon] = this.ammo;
      this.magByWeapon[this.weapon] = this.mag;
      this.weapon = key;
      this.ammo = this.ammoByWeapon[key] ?? 0;
      this.mag = this.magByWeapon[key] ?? 0;
    }
    return this.weapon;
  }

  // Round 17: equip() is the same gate as selectWeapon() — any weapon
  // Rico OWNS can be equipped; anything else is refused.
  equip(name) { return this.selectWeapon(name); }

  // Round 17: ownership + per-weapon ammo, for the HUD wheel and the
  // save system. hasWeapon() is the lock check; getWeaponState() is
  // the whole arsenal in one plain object (no live state leaks out).
  hasWeapon(name) { return typeof name === 'string' && this.owned.has(name.toLowerCase()); }
  isOwned(name) { return this.hasWeapon(name); }
  getOwnedWeapons() { return Object.keys(WEAPONS).filter((k) => this.owned.has(k)); }
  getWeaponAmmo(name) {
    const key = typeof name === 'string' ? name.toLowerCase() : '';
    const def = WEAPONS[key];
    if (!def) return null;
    return { mag: this.magByWeapon[key] ?? 0, reserve: this.ammoByWeapon[key] ?? 0, magSize: def.magSize ?? 0 };
  }
  getWeaponState() {
    this._syncAmmoMaps();
    const weapons = {};
    for (const key of Object.keys(WEAPONS)) {
      weapons[key] = {
        name: WEAPONS[key].name,
        owned: this.owned.has(key),
        mag: this.magByWeapon[key] ?? 0,
        reserve: this.ammoByWeapon[key] ?? 0,
        magSize: WEAPONS[key].magSize ?? 0,
      };
    }
    return { weapon: this.weapon, owned: this.getOwnedWeapons(), weapons };
  }

  // Round 17: the HUD / probe shape — the five wheel slots in order,
  // each with its live mag/reserve, plus the owned list and the
  // equipped weapon. The HUD wheel, the round13 probe and the
  // save/restore probe read this, never the raw maps. Round 18: the
  // rifle slot is real now — it reads LOCKED only while unowned,
  // exactly like the SMG / shotgun did before their unlocks.
  getWeaponsState() {
    const st = this.getWeaponState();
    return {
      equipped: st.weapon,
      owned: st.owned,
      weapons: st.weapons,
      slots: WEAPON_ORDER.map((key) => {
        const w = st.weapons[key];
        return w
          ? { key, name: w.name, owned: w.owned, mag: w.mag, reserve: w.reserve, magSize: w.magSize }
          : { key, name: 'Rifle', owned: false, mag: 0, reserve: 0, magSize: 0 };
      }),
    };
  }

  // Round 17: unlock a weapon (mission reward). New guns arrive with
  // a FULL magazine + their starting reserve. Returns true only on a
  // real first unlock; re-unlocks and unknown keys return false.
  unlockWeapon(name) {
    const key = typeof name === 'string' ? name.toLowerCase() : '';
    const def = WEAPONS[key];
    if (!def || !def.magSize || this.owned.has(key)) return false;
    this.owned.add(key);
    this.ammoByWeapon[key] = def.reserveStart ?? 0;
    this.magByWeapon[key] = def.magSize;
    return true;
  }

  // Round 17: park the live mag/reserve into the maps (called before
  // any snapshot — getWeaponState / toSaveData — so the equipped
  // weapon's current load is never lost from the record).
  _syncAmmoMaps() {
    this.ammoByWeapon[this.weapon] = this.ammo;
    this.magByWeapon[this.weapon] = this.mag;
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

  // Round 17: ammo goes to the reserve of the named weapon — the
  // equipped firearm by default, the pistol when fists are equipped
  // (fists carry no ammunition). The old single-reserve behaviour
  // (everything into the pistol pile) is gone: a shotgun pickup must
  // not refill the SMG.
  addAmmo(amount, name = null) {
    const n = Math.max(0, Math.round(amount) || 0);
    const key = typeof name === 'string' && WEAPONS[name.toLowerCase()]
      ? name.toLowerCase()
      : (this.weapon !== 'fists' ? this.weapon : 'pistol');
    if (!WEAPONS[key] || !WEAPONS[key].magSize) return this.ammo;
    if (key === this.weapon) this.ammo += n;
    else this.ammoByWeapon[key] = (this.ammoByWeapon[key] ?? 0) + n;
    this.hooks.audio?.playPickup?.();
    return key === this.weapon ? this.ammo : this.ammoByWeapon[key];
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
    // Round 17: fists cannot shoot — the caller (main.js doShoot)
    // equips a firearm first; a bare-fists shoot is refused, not
    // silently fired as a pistol.
    const def = WEAPONS[this.weapon];
    if (!def || !def.magSize) return { fired: false, reason: 'melee' };
    if (this.shotCooldown > 0) return { fired: false, reason: 'cooldown' };
    if (this.mag <= 0) {
      if (this.ammo > 0) {
        this.reload();
        return { fired: false, reason: 'reloading' };
      }
      return { fired: false, reason: 'no-ammo' };
    }
    // Round 17: rate / range / damage all come from the EQUIPPED
    // weapon's definition (was hardcoded pistol: 0.28 s, 60 m, 30-38).
    this.shotCooldown = def.rate;
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
    // at max weapon range along the shot line from the origin.
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
            x: origin.x + Math.sin(h) * def.range,
            y: origin.y,
            z: origin.z + Math.cos(h) * def.range,
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
    let bestAlong = def.range;
    for (const target of targets) {
      if (target && target.alive === false) continue;
      if (!target?.position) continue;
      const to = {
        x: target.position.x - origin.x,
        y: (target.position.y || 0) + 1.0 - origin.y,
        z: target.position.z - origin.z,
      };
      const along = to.x * dir.x + to.y * dir.y + to.z * dir.z;
      if (along < 0 || along > def.range) continue;
      const perpSq =
        (to.x - dir.x * along) ** 2 + (to.y - dir.y * along) ** 2 + (to.z - dir.z * along) ** 2;
      // Seeded spread: wider at long range, so a given seed reproduces hits.
      // Round 17: the shotgun spreads wide (short-range scatter gun),
      // the SMG / pistol stay tight. Round 18: the rifle is the
      // tightest of all (a precision long gun — the spread barely
      // grows with distance).
      const spreadBase = this.weapon === 'shotgun' ? 0.6 : this.weapon === 'rifle' ? 0.22 : 0.35;
      const spreadSlope = this.weapon === 'shotgun' ? 0.03 : this.weapon === 'rifle' ? 0.006 : 0.012;
      const spread = spreadBase + along * spreadSlope;
      if (perpSq > spread * spread) continue;
      if (along < bestAlong) { bestAlong = along; best = target; }
    }
    if (!best) return { fired: true, hit: false };
    // Seeded damage roll: ±15% around the equipped weapon's damage,
    // so results vary per seed but reproduce.
    const damage = Math.round(this.rng.range(def.damage * 0.85, def.damage * 1.15));
    this.shotsHit += 1; // round-9: a shot that finds a target counts
    const hit = this._applyDamage(best, damage, 'shot');
    return { fired: true, hit: true, target: best, damage, killed: hit.killed };
  }

  reload() {
    // Round 17: the magazine size is the EQUIPPED weapon's (was a
    // hardcoded pistol 12 — an SMG reload used to refill to 12).
    const def = WEAPONS[this.weapon];
    if (!def || !def.magSize) return false;
    if (this.mag >= def.magSize || this.ammo <= 0) return false;
    const needed = def.magSize - this.mag;
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
    // Round 17: the arsenal rides along — owned set + every weapon's
    // mag/reserve + the equipped weapon — so a reload restores the
    // SMG / shotgun exactly as they were left, not as a fresh pistol.
    this._syncAmmoMaps();
    return {
      health: this.health, armour: this.armour, ammo: this.ammo, mag: this.mag,
      weapon: this.weapon, owned: [...this.owned],
      ammoByWeapon: { ...this.ammoByWeapon }, magByWeapon: { ...this.magByWeapon },
    };
  }

  fromSaveData(data = {}) {
    if (typeof data.health === 'number') this.health = clamp(data.health, 0, this.maxHealth);
    if (typeof data.armour === 'number') this.armour = clamp(data.armour, 0, this.maxArmour);
    // The legacy ammo/mag fields are the PISTOL load (round-16 saves
    // carry no weapons block); a weapons block overrides them below.
    if (typeof data.ammo === 'number') this.ammoByWeapon.pistol = Math.max(0, data.ammo);
    if (typeof data.mag === 'number') this.magByWeapon.pistol = Math.max(0, data.mag);
    // Round 17: restore the arsenal — owned set first (fists + pistol
    // can never be lost), then every weapon's mag/reserve, then the
    // equipped weapon (only if it is actually owned).
    if (Array.isArray(data.owned)) {
      this.owned = new Set(data.owned.filter((k) => typeof k === 'string' && WEAPONS[k]));
      this.owned.add('fists');
      this.owned.add('pistol');
    }
    if (data.ammoByWeapon && typeof data.ammoByWeapon === 'object') {
      for (const k of Object.keys(WEAPONS)) {
        if (typeof data.ammoByWeapon[k] === 'number') this.ammoByWeapon[k] = Math.max(0, data.ammoByWeapon[k]);
      }
    }
    if (data.magByWeapon && typeof data.magByWeapon === 'object') {
      for (const k of Object.keys(WEAPONS)) {
        if (typeof data.magByWeapon[k] === 'number') this.magByWeapon[k] = Math.max(0, data.magByWeapon[k]);
      }
    }
    if (typeof data.weapon === 'string' && WEAPONS[data.weapon] && this.owned.has(data.weapon)) {
      this.weapon = data.weapon;
    }
    this.ammo = this.ammoByWeapon[this.weapon] ?? 0;
    this.mag = this.magByWeapon[this.weapon] ?? 0;
    this.isDown = this.health <= 0;
  }

  reset() {
    this.health = this.maxHealth;
    this.armour = 0;
    // Round 17: a fresh profile owns fists + pistol only, with the
    // pistol's starting load; the SMG / shotgun / rifle are earned again.
    this.owned = new Set(['fists', 'pistol']);
    this.ammoByWeapon = { fists: 0, pistol: 24, smg: 0, shotgun: 0, rifle: 0 };
    this.magByWeapon = { fists: 0, pistol: WEAPONS.pistol.magSize, smg: 0, shotgun: 0, rifle: 0 };
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

// Round-18: re-touch — the arsenal is fists + pistol + SMG +
// shotgun + RIFLE, all real; the rifle (mission-4 reward, 38 dmg /
// 90 range / 24-round mag) is the fifth wheel slot, LOCKED only
// until mission 4 is finished, and the save round-trips it like
// every other gun.

export default CombatSystem;
