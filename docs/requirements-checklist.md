# Competition and MVP Checklist

## Official contest requirements

- [ ] Confirm personal eligibility: age/majority, eligible-country residency, presence in an eligible country at entry, and active Handshake account.
- [ ] Submit through Handshake's `Create a Multiplayer Game` mission.
- [ ] Prepare a project title.
- [ ] Prepare a project cover image.
- [ ] Prepare a project description.
- [ ] Verify and submit a working public project URL.
- [ ] Submit by October 30, 2026 at 11:59 PM PT.
- [ ] Do not use mass/script-generated entries or automated submissions.

## Judging alignment

| Criterion | Feature target | Evidence to collect |
| --- | --- | --- |
| Execution (25%) | Lobby, real-time match, role conversion, both victories, rematch | Two-browser demo and automated rules tests |
| Creativity (25%) | Defeat changes the player into an illness rather than removing them | Short demo script emphasizing the reversal |
| Usefulness / Value (25%) | A social, replayable game with understandable counterplay | Onboarding, readable objectives, match summary |
| Polish / Thoughtfulness (25%) | Distinct faction HUDs, connection state, event feed, responsive layout | Manual UX pass and recorded multiplayer run |

## MVP engineering verification

- [x] Server-owned player state and victory checks.
- [x] Lobby capacity and readiness validation.
- [x] Animal-to-illness transition.
- [x] Infection success and immunity rejection.
- [x] Animal and illness mutation purchases.
- [x] Animal and extinction victory paths.
- [x] Invalid action rejection.
- [x] Browser-session synchronization QA: two browser sessions created/joined a room, readied, started, and both received the same live gather event.
- [x] Reconnection QA locally: a refreshed active-match tab recovered the same player, role, room, and live event history without creating a duplicate.
- [ ] Deployment and HTTPS configuration.
- [ ] Final cover image, description, demo script, and submission review.
