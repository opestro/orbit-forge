# Orbit Forge

A space mission design game for the NASA Space Apps 2026 challenge "Space Mission Design Game".
One to four players choose a science goal, design the spacecraft, ground stations and launch, fly the mission, and read why it worked or failed.

**Play it now: https://opestro.github.io/orbit-forge/**

The online version runs on GitHub Pages, which only serves files. Solo play, team play on one screen, the career and share links all work there. Online team rooms and shared rankings need the small server below.

## Run

    node server.mjs

Then open http://localhost:4788. The server has no dependencies. It serves the game, runs team rooms and keeps the shared rankings.

The game also works from any static host (for example `python3 -m http.server`). Solo play and same-screen team play work there; online rooms and shared rankings need `server.mjs`.

three.js loads from a CDN, so the first load needs internet.

## How a game goes

1. **Title screen**: press Start.
2. **Profile**: enter your name and pick a mission patch colour. It is saved on this device.
3. **Mission control**: your rank, experience (XP), stars and badges, and the mission board.
4. **Brief**: choose the science goal, the ambition level and the team.
5. **Design**: build the spacecraft, choose ground stations, an orbit and a rocket.
6. **Launch pad**: name the spacecraft, watch the readiness review check each requirement, hold the launch poll, then hold the button to launch.
7. **Flight**: mission clock, progress strip, and a surprise to answer.
8. **Report**: stars, score, why it worked or failed, XP earned, promotions and new badges.

Every flight earns XP, even a failed one. There are 6 ranks (Cadet to Chief Engineer) and 13 badges.

## How the game follows the challenge

The flow follows NASA's own steps from "Design and Develop Science Missions": need and goals, concept, requirements, design, build and verify, fly.

| The challenge asks for | In the game |
|---|---|
| Define a mission objective and requirements | The brief: choose who needs the data (1 or 2 science goals) and how ambitious to be. This sets five requirements that are checked live. |
| Design a spacecraft and select instruments | Space segment: instruments, power, battery, pointing (attitude control), onboard computer, antenna. |
| Communications and ground | Ground segment: one station, a network, or round-the-clock coverage, with a yearly running cost. |
| Launch vehicle and orbit, with a compatibility check | Launch segment: 7 orbits, 3 rockets. A rocket that cannot lift the mass to that orbit fails. |
| Resources: mass, power, budget, data, communications, time | Seven live bars: budget, schedule, mass, power, battery, data link, lifetime. |
| Every decision has a consequence; no single right answer | Every part costs money, mass, power, data and build time. A test proves each goal can be won from at least two orbits. |
| Manage and simulate the mission | A 3D flight with staging and deployment, and a surprise that the team must answer. The answer changes the result. |
| Feedback on why it succeeded or failed | A report with cause-and-effect findings in plain words, each with something to try next. |
| Team play for up to four, with roles and negotiation | Four roles (science, spacecraft, communications, mission manager). Each owns some decisions and defends one margin; budget, mass and schedule are shared. Every role must say GO before launch. Same screen, or online with a room code. |
| Scoring that rewards good engineering and teamwork | Score from science, lifetime and budget saved, plus 25 points for each role's margin that was protected. |
| Difficulty levels and scenarios | Four missions (Earth, storms, Moon, Mars), three goals each, three ambition levels. |
| Simple explanations | Every card, bar and caption explains itself. "How it works" explains the process and links NASA's resources. |
| Save, share, compare; rankings; competition | A link that carries the whole design, a comparison with your last try, and rankings (per device, and shared when the server is running). Teams who open the same link solve the same problem. |
| Sandbox | A free-build mission with no budget, deadline or goal. |
| Real missions | The report names the real NASA mission closest to your design. |

## Check it

    node test/sim.test.mjs      # the rules behave as designed
    node test/server.test.mjs   # two players can share a room
    node test/explore.mjs       # samples thousands of designs and prints how many win (use after changing numbers)

## Files

- `src/data.js`: all content (parts, orbits, rockets, missions and goals, levels, roles, surprises, real missions).
- `src/sim.js`: the rules. Pure arithmetic, no browser needed.
- `src/main.js`: screens and game state.
- `src/net.js`, `server.mjs`: team rooms and rankings.
- `src/scene.js`: the 3D view in space (three.js): planets, spacecraft, orbit and flight.
- `src/earthfx.js`: realistic Earth shading (layered clouds, shadows, haze, ocean glint).
- `src/launchsite.js`: the low-poly launch site and the lift-off shot.
- `src/rockets.js`, `src/craft.js`, `src/lowpoly.js`: the low-poly rockets, the spacecraft parts, and shared helpers.

## How the rules work

The numbers are simplified to make the trade-offs clear. They are not real engineering values.

- **Requirements**: science per day, lifetime, budget, mass that fits the rocket, and a build schedule that meets the launch window.
- **Budget**: parts, rocket, ground stations and their running cost for the mission's life, plus the cost of any delay.
- **Schedule**: 10 months for the body, plus 55% of the months of every part, plus rocket integration. Being late costs money. Mars only lines up every 26 months, so a late Mars mission waits for the next window.
- **Mass**: 45 kg body + 1.2 x the mass of all parts. Must fit what the rocket can carry to that orbit.
- **Power**: panel watts x share of the orbit in sunlight x sunlight strength (Mars is 43%). If this is less than the load, instruments only run part of the time.
- **Battery**: must hold load x longest shadow. Draining it deeply every lap shortens its life; running flat causes blackouts.
- **Pointing**: instruments that need a steady view lose quality on a wobbly craft. A dish needs reaction wheels; a laser link needs star-tracker precision.
- **Data link**: antenna speed x signal strength at that distance x hours of contact a day. More ground stations give more contact, up to the whole day.
- **Memory**: data waits on board between contacts. What does not fit in the computer's memory is lost.
- **Lifetime**: the shorter of the orbit's life (low orbits decay) and the battery's life.
- **Science**: each instrument's value x how well it fits the goal x how well the orbit fits, scaled by power, pointing, data and lifetime.
- **Surprises**: a micrometeorite, a ground station outage or a solar storm. The team chooses how to respond. Designs with spare margin lose nothing.
- **Score**: up to 720 for science and lifetime, up to 180 for budget saved, and 25 for each of the four role margins. Ranking points multiply the score by the level (x0.8, x1, x1.4).

## Art and data

Planets, sky, clouds and stars are realistic (real data). Rockets, spacecraft and the launch site are low-poly.

- **Earth close-up during the climb**: ground from Sentinel-2 cloudless 2016 by EOX (s2maps.eu, CC BY 4.0, contains modified Copernicus Sentinel data). Clouds come from a real photo of 18 April 2023 by NASA's Suomi NPP satellite (NASA GIBS), drawn on shells above the ground with shadows, haze and ocean glint.
- **Whole Earth**: 8K NASA Blue Marble with cloud shells from that day's global photo. City lights, relief and ocean maps and the Moon map come from the three.js example textures (made from NASA imagery). The Mars map is from github.com/nasa/NASA-3D-Resources.
- **Stars**: NASA's Tycho star map behind the Yale Bright Star map.
- **Launch site, rockets and spacecraft**: low-poly models built in code, with no model files. The sky above the launch site is shaded realistically, with three layers of drifting cloud.
- `node assets/fetch.mjs` downloads the images again (the cloud-free map is fetched in four pieces and joined with ffmpeg).

## NASA resources used

The process, the four mission segments and "begin with the end in mind" come from NASA's "Design and Develop Science Missions". The schedule mechanic and the readiness review come from "CubeSat 101". The idea of matching the player's design to a real mission comes from NASA's "Build It Yourself: Satellite!" game. The resources are linked inside the game under "How it works".

## Not checked yet

Online rooms were tested with one browser plus a simulated second player, not with two real devices. The phone layout was only checked in a phone-sized browser window, not on a real phone. Sound and music are made in code and were not checked by ear.
