# Adaptive Prison Break: Action-Stealth Combat Design

## Product Direction

Add combat as a first-class option while keeping stealth valuable. The game should become a balanced action-stealth prison break: gunplay is viable and fun, but stealth remains a strong choice because it saves health, ammo, noise, and alert pressure.

The player no longer loses because a guard maintains detection long enough. Detection creates danger, pursuit, and combat pressure. The player loses when health reaches zero.

## Combat Loop

The player starts each run with fists and a makeshift knife. Stronger melee weapons and military guns can be found during the run through armories, guard areas, security rooms, or other authored placements.

Combat has four main tool groups:

- Fists: quietest option, non-lethal, short range, low damage.
- Makeshift knife: very quiet, fast, short range, lethal or high-damage depending on context.
- Found melee weapons: stronger than fists or knife, but noisier. Batons, bats, pipes, and similar weapons can improve stun, reach, knockdown, or damage.
- Guns: loud, ranged, high impact, ammo-limited. Pistols, SMGs, shotguns, rifles, and rare suppressed weapons create different tactical choices.

Every weapon has its own noise value instead of relying only on broad categories. Punches and knives create minimal noise. Batons, bats, and pipes create moderate impact noise. Firearms create higher noise depending on weapon type and whether the weapon is suppressed.

Gunplay should be responsive and fair, not oppressive. It creates more pressure than stealth through ammo use, reload vulnerability, sound, and alert escalation, but choosing gunplay should remain a valid route through the game.

## Weapons And Inventory

The inventory stays small and readable. The player can carry:

- One melee weapon
- One primary gun
- One sidearm
- Limited healing items

Fists are always available. The makeshift knife is the starting melee weapon unless replaced.

Initial weapon set:

- Fists: quiet, non-lethal, short range.
- Makeshift knife: very quiet, fast, short range.
- Baton: moderate noise, good stun, non-lethal.
- Baseball bat or pipe: moderate noise, stronger knockdown, slower swing.
- Pistol: moderate firearm noise, reliable sidearm.
- SMG: louder, fast fire, weaker at distance.
- Shotgun: very loud, strong close range, slow reload.
- Assault rifle: loud, strong mid-range, limited ammo.
- Suppressed pistol: rare, lower gunshot noise, limited or weaker ammo.

Weapon stats include damage, stun, range, attack speed, noise, lethality, ammo type, reload time, recoil, and accuracy penalty while moving. These stats should live in data definitions so new weapons can be added without rewriting combat logic.

## Guards, Bodies, Alert, And Health

Guards keep the original stealth states: patrol, investigate, search, chase, and return. Combat adds damage, grapples, wakeups, body discovery, and armed response.

Guard reactions:

- Guards who hear melee impact or gunfire investigate the source.
- Guards who see the player with a weapon become suspicious faster.
- Guards who find a knocked-out guard wake them up, then raise alert.
- Guards who find a dead guard raise alert more strongly.
- Regular guards can chase, grapple, call for help, and use melee.
- Armed response guards can shoot the player and use cover.

Knocked-out guards stay down indefinitely unless another guard finds and wakes them. Dead guards stay down for the run and create stronger alert consequences when discovered.

The player has a visible health bar. Damage comes from armed guards, melee attacks, grapples, and future hazards. Healing items are limited and take time to use, so combat has a cost while still allowing recovery from mistakes.

Run failure occurs only when player HP reaches zero. Guards no longer end the run through detection alone. The player can survive detection by breaking line of sight, hiding, changing zones, closing distance, using cover, healing, or defeating and stunning guards.

## Alert Model

The alert system is staged and recoverable:

- Calm: normal patrols.
- Suspicious: local investigation after noise, suspicious sightings, missing patrols, or unusual bodies.
- Alert: guards search nearby zones more actively.
- Armed Response: limited armed guards enter relevant zones after repeated gunfire, discovered bodies, or sustained combat.
- Lockdown Pressure: only after sustained high chaos, not after a single fight.

Alert can cool down if the player hides, changes zones, or avoids further trouble. This lets combat create consequences without ruining the run. Stealth remains useful because it avoids avoidable damage, resource loss, body discovery, and escalation.

## Adaptive Learning Changes

The adaptive system expands from pure stealth habits into action-stealth habits. Each completed run records combat telemetry in addition to movement, hiding, noise, detection, objectives, and outcome.

New combat events include:

- Weapon pickups and swaps
- Punch, melee, and gun attacks
- Hits, misses, damage dealt, and damage taken
- Knockouts, kills, body discoveries, and wakeups
- Ammo use and reloads
- Healing item use
- Alert level changes
- Armed response triggers
- Stealth takedowns and loud engagements
- Player death when HP reaches zero
- Escape outcome

Codex still chooses exactly one validated adaptation after each run. The allowlist grows to support combat while preserving fairness caps and decay.

Example combat-aware adaptations:

- Increase patrols near the player's favorite combat route.
- Add body checks near frequent takedown spots.
- Place an armed response guard near repeated gunfight zones.
- Improve guard cover behavior after frequent gun use.
- Increase guard health or armor after repeated lethal success.
- Reduce ammo availability after heavy gun reliance.
- Add more hiding inspection after repeated stealth escapes.
- Increase melee caution after repeated close-range takedowns.

Adaptations should make repeated habits less free without punishing a preferred play style. If the player changes strategy, older combat or stealth adaptations lose importance across later runs.

## Architecture

Combat remains simulation-first. Phaser renders weapons, effects, projectiles, hits, bodies, and UI, but deterministic gameplay systems own combat rules and event generation. This keeps combat testable and makes adaptive analytics reliable.

New client systems:

- `CombatSystem`: resolves punches, melee swings, firearm shots, reloads, hits, damage, stun, knockouts, and kills.
- `WeaponSystem`: owns equipped slots, weapon stats, ammo, reload state, and pickups.
- `HealthSystem`: tracks player HP, guard HP, damage, healing, and run failure at zero HP.
- `BodySystem`: tracks knocked-out and dead guards, discovery, wakeups, and alert effects.
- `AlertSystem`: manages calm, suspicious, alert, armed response, and lockdown pressure.
- `ProjectileSystem`: handles firearm aim, range, recoil, spread, line-of-fire, and impact events.

Existing stealth systems should integrate with these systems rather than being replaced. Detection now feeds alert, pursuit, and combat instead of direct capture.

## Interface And Feedback

The HUD should stay focused on immediate survival and decision-making:

- Player health bar
- Equipped melee weapon and gun
- Ammo and reload state
- Healing item count
- Current alert state
- Context prompts for pickup, heal, hide, and relevant body interactions
- Hit, damage, and noise feedback

Noise feedback should support weapon choice. Quiet attacks should feel discreet. Heavy melee impacts and gunfire should create clear audio or visual feedback so the player understands why guards react.

## Testing

Automated tests should cover combat rules, stealth integration, service telemetry, and adaptation fairness:

- Punches and knives create lower noise than bats, batons, and guns.
- Knocked-out guards stay down until another guard finds them.
- Dead guards create stronger alert changes than knocked-out guards.
- Gunfire raises alert in stages but does not instantly cause lockdown.
- The player loses only when HP reaches zero.
- Healing restores HP but has timing and resource limits.
- Armed response appears only after enough escalation.
- Detection triggers pursuit or combat pressure instead of direct capture.
- Combat events are persisted and included in adaptive summaries.
- Combat adaptations obey caps, prerequisites, and historical decay.

Manual playtesting should verify that gunplay is viable without making stealth irrelevant, and that stealth remains a strong way to avoid damage, conserve resources, and keep the prison calmer.

## Updated Non-Goals

Combat is no longer a non-goal. The revised non-goals are:

- Multiplayer
- Procedural generation
- Arbitrary Codex-generated combat rules
- Full military squad tactics
- Complex armor or character build systems in the first combat pass
- Large weapon crafting systems
- Multiple prison maps in the first combat pass

## Acceptance Criteria

- The player can complete a run using mostly stealth, mostly combat, or a hybrid approach.
- The player starts with fists and a makeshift knife.
- Found melee weapons and guns provide distinct tactical tradeoffs.
- Weapon noise affects guard investigation and alert escalation.
- Knocked-out guards can be woken by other guards.
- Dead guards remain down and create stronger alert consequences.
- Player HP reaching zero ends the run.
- Detection alone does not end the run.
- Combat events are recorded for adaptive analysis.
- Codex-selected adaptations can respond to repeated combat habits while remaining capped and fair.
