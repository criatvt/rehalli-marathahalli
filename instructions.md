# Blueprint: Re-halli (3D Holographic Command Center)

You are an elite game developer and creative technologist. I want you to autonomously build a fully functional, browser-based 3D civic policy simulator called "Re-halli: Marathahalli Chapter." 

The player acts as the Chief Urban Planner for Bengaluru's most notorious traffic and real estate chokepoint. The game must feel like a AAA indie strategy game, where serious policy decisions have visceral, 3D visual consequences.

## 1. Technical Stack & Visual Ambition
- **Frontend Only:** HTML, CSS (Tailwind via CDN), and Vanilla JavaScript.
- **3D Engine (Go Crazy):** Use `Three.js` and/or `MapLibre GL JS` to render a 3D, isometric, or tiltable map of Marathahalli (Lat: 12.9569, Lng: 77.7011). 
- **Visual Aesthetic:** "Cyber-Civic Hologram." The UI should feel like a futuristic mayoral command center. Use dark themes, glowing neon data points, bloom effects, and dynamic lighting. 
- **Audio:** Integrate Web Audio API for deep, ambient synth drones, UI clicks, and dramatic stingers when a catastrophic policy fails.

## 2. 3D Visual Feedback & Particles (Crucial)
The map MUST be alive. Use particle systems and shaders to show the consequences of decisions:
- **Traffic:** Render hundreds of glowing particle trails moving along the Outer Ring Road. Turn them angry red and slow them down when congestion spikes.
- **The Water Crisis:** Render fleets of tiny, 3D water tankers (blue dots) swarming the residential zones. 
- **Ecological Disaster:** Use custom shaders or particle effects on Bellandur/Varthur Lake to visually show it frothing with toxic white foam or catching on fire if the environment stat tanks.
- **Real Estate:** When approving a new Tech Park, animate 3D glowing blocks extruding upward from the map. When cutting trees, show green zones turning to concrete gray.

## 3. UI Layout (The War Room)
- **Holographic HUD:** Do not use basic web buttons. The UI should float over the 3D canvas.
- **Dynamic Gauges:** Use radial or circular meters for 4 core stats: Congestion, Ecological Health, Economic Output, and Public Approval.
- **Faction Feed:** A live, scrolling feed of reactions from local factions (The Auto Union, The Tech Bros, The Builder Mafia, The Tanker Syndicate, Local Residents).

## 4. Core Gameplay Loop (The Cascade Engine)
- Present "Policy Decision Cards" that slide into the center of the screen with a 3D blur/glassmorphism effect behind them.
- Build a JavaScript state engine with deep cascade logic. Every choice unlocks future, more extreme choices.
- **Example 1 - The Rajakaluve Crisis:** "A builder has encroached on a major storm water drain near Ecospace. Do you send the bulldozers?" 
  - *Demolish:* Huge budget cost, Builder Mafia approval drops to 0%, but prevents the "ORR Flooding" event during the monsoon turn.
  - *Take Bribe/Ignore:* Huge budget boost, but triggers a massive 3D flooding animation on the map three turns later, paralyzing the tech parks.
- **Example 2 - The Water Mafia:** "Apartments in Panathur have run dry. Piped water is 5 years away."
  - *Cap Tanker Prices:* Approval skyrockets, but Tanker Syndicate goes on strike, turning water availability to 0%.
  - *Let the Market Decide:* Middle-class approval plummets, localized protests spawn on the map blocking traffic.

Take total creative freedom. Write the complex 3D logic, the shaders, and the cascade state engine. Deliver a complete, playable, zero-dependency `index.html`, `style.css`, and `app.js` package that drops my jaw when I open it.