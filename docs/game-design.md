# Natural Selection - MVP Game Design

## North star

Every victory can create a new enemy. Players begin as animals of one species. When an animal is defeated, its player immediately returns as an illness in the same match. Animals compete for survival while building immunity; illnesses mutate and attempt to drive the species to extinction.

## Match rules

| Area | MVP rule |
| --- | --- |
| Players | 2-6 guests; the host needs at least two ready players to start |
| Animal species | Players choose Deer (balanced grazer) or Wolf (stronger hunter) before joining |
| Arena | One 100 x 100 top-down arena with food, water, and energy nodes |
| Animal objective | Stay alive, gather resources, challenge rivals, evolve immunity, and neutralize illnesses |
| Disease objective | Move through the same arena, infect animals, and mutate pathogen strength |
| Role transition | Animal health reaching zero changes that player to an active named disease at the same location |
| Evolution | Animals spend food and water to choose Shield or Scavenger; each choice has a clear stat effect |
| Pathogen mutation | Illnesses spend virulence to choose Spore or Adaptive; each increases infection pressure |
| Animal victory | At least one illness has existed and every illness is neutralized |
| Extinction victory | No active animals remain |
| Reconnection | The browser can reconnect to the active in-memory match while the server remains alive |
| Rematch | The host can reset the lobby after a terminal result |

## State model

```text
Lobby
  -> Playing
       AnimalAlive
         -> AnimalEliminated
              -> IllnessActive
                   -> IllnessNeutralized
       -> Terminal
  -> Lobby (rematch)
```

The server evaluates terminal state after every mutation, combat, infection, neutralization, and tick. This prevents duplicate endgame events and makes simultaneous outcomes deterministic.

## Action rules

- Movement is one validated step per request and is bounded by the arena.
- Movement accepts the on-screen pad, arrow keys, and WASD; the server remains authoritative.
- Gathering requires proximity to a resource node and rewards one resource type.
- Challenging requires an active animal, energy, and a nearby animal target.
- Infection requires an active illness, virulence, and a nearby animal target. Immunity can reject it.
- Evolving and mutating require resources and accept only known mutation IDs.
- Neutralization requires a nearby illness and animal immunity at least as high as the illness virulence.
- Clients never submit damage, role changes, resource rewards, or victory outcomes.
- Disease labels use recognizable names for game readability; they do not model real-world medical transmission.

## Design decisions deferred

The next design pass should tune match duration, add more mutation trade-offs, decide whether the illness should have hidden information, and replace the in-memory server with a deployment-safe recovery strategy.
