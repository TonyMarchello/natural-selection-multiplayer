# Multiplayer QA run

## Automated checks

- `npm test`: 8 passing game-rule tests.
- Public health endpoint: `https://natural-selection.onrender.com/healthz`.

## Browser-session smoke test

- Host and guest can join the same lobby.
- Lobby readiness gates match start.
- Separate browser sessions reach the live match.
- Live run completed: keyboard movement, combat, animal-to-disease transition, pathogen mutation, infection, synchronized extinction result, and host-led rematch all passed.
- The run also confirmed the rematch restores the original Wolf and Rabbit identities.
- The current deployment should be retested after every Render deploy because free instances can sleep and the service keeps lobbies in memory.

## Required physical-device pass

Run this final pass on two physical devices or networks:

1. Device A creates a lobby over cellular or home Wi-Fi.
2. Device B joins from a different network.
3. Verify both clients see the same readiness state and match start.
4. Test movement, gathering, combat, disease infection, mutation, neutralization, endgame, and Rematch.
5. Refresh one device during a live match; confirm the same identity, role, and progression return without a duplicate player.
6. Save a screenshot or short recording of the synchronized end summary.
