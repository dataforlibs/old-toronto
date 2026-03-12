<<<<<<< HEAD
# Old Toronto · Historical Itinerary Planner (https://dataforlibs.github.io/old-toronto/)

> *Walking Through History, Guided by the Archive*

A tool for explorers, travellers, and anyone curious about the city that once was — connecting Toronto's living streets to thousands of photographs from the City of Toronto Archives.

---

## What Is This?

Old Toronto is a historical walking itinerary planner built on top of [OldTO](https://oldto.sidewalklabs.com/) — a remarkable labour of love that placed thousands of digitized archival photographs onto an interactive map of Toronto.

OldTO excels at answering *"what was photographed here?"* — but it's harder to use when you want to plan a walk through the city's history. This tool bridges that gap. It takes the OldTO dataset and generates optimized walking itineraries organized around the city's most photographed and historically significant landmarks, so you can show up somewhere knowing exactly what to look for.

**The core idea:** cities are best experienced on foot, at the scale of a block, a corner, a building facade. Archival images become most meaningful when you encounter them in the same place where the original photograph was taken. History, encountered in motion, sticks.

---

## How It Works

The Planner is built around the way people actually move through cities. You choose a starting point — a hotel, a transit hub, a familiar landmark — and the tool builds an outward route from there.

- **15 starting points** across the city, from Union Station and the Distillery District to Casa Loma and High Park
- **Routes organized around landmarks** — the places people seek out and remember — minimized for walking distance using a nearest-neighbour algorithm with 2-opt optimization
- **Archival photographs surfaced two ways**: as a thumbnail strip beneath each stop, and as photo markers directly on the route map
- **Filter by historical era** — Victorian, Edwardian, interwar, postwar, and into the late twentieth century — to tailor your walk to a specific chapter of the city's development

You can browse images before you leave, or consult them while you walk. The archive stops being a database you search from a desk and becomes a companion for a real walk through a real city.

---

## Key Features

| Feature | Description |
|---|---|
| **Start from Where You Are** | 15 curated starting points: hotels, transit hubs, and landmarks |
| **Landmark-Anchored Routes** | Routes thread through the city's most-documented sites |
| **Preview Before You Walk** | Browse archival images for every stop before you set out |
| **Photos Along the Route** | Archive photos appear as map markers as you walk |
| **Filter by Historical Era** | Narrow to Victorian, Edwardian, interwar, postwar, or late 20th century |
| **Flexible Trip Lengths** | Half-day strolls or five-day deep dives — the itinerary scales to suit |

---

## Data & Acknowledgements

- **Photographic data** sourced from [OldTO](https://oldto.sidewalklabs.com/), originally created by Sidewalk Labs and later revived by Back Lane Studios. OldTO draws on the digitized holdings of the **City of Toronto Archives** and the **Toronto Public Library**.
- **Landmark data** from Wikipedia's open knowledge graph
- **Route optimization** uses a nearest-neighbour heuristic refined with 2-opt improvement
- Maps rendered with [Leaflet](https://leafletjs.com/) and OpenStreetMap contributors
- The OldTO source code was generously made open-source by Sidewalk Labs under a permissive licence — this project builds on that foundation with gratitude

---

## Tech Stack

- **React** (via Vite)
- **Leaflet** for mapping
- **JSON data files** sourced from the OldTO dataset

---

=======
# Old Toronto · Historical Itinerary Planner (React)
>>>>>>> 1837c7ff4123b006d3bc466c5531fbe8068fcf26
