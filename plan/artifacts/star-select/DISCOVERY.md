# Discovery: Star Selection Visual Enhancement

## Problem Statement

The galaxy map's current star selection indicator is a static yellow sphere (60-unit radius, fixed size) placed at the selected star's position. It doesn't change the star's own appearance, doesn't scale with zoom, and the map doesn't respond to selection by centering on the star. The info panel also omits XYZ coordinates, making troubleshooting star positions difficult.

## User Story

As a map user, I want selecting a star to visually highlight it in-scene, center the map on it, and show its coordinates in the info panel, so that the selection feels spatially grounded and useful for debugging.

## Acceptance Criteria

- [ ] Selecting a star changes the star's point color to gold
- [ ] A static cyan ring (torus) is rendered around the selected star
- [ ] The ring scales proportionally to camera distance so it stays visually consistent as the user zooms
- [ ] Selecting a star triggers a smooth animated fly-to that centers the camera on the star while preserving the current zoom level
- [ ] The SystemInfoPanel displays the star's XYZ coordinates in light-years (e.g. `540.2 LY`)
- [ ] The yellow sphere is removed

## Out of Scope

- Changes to unselected star rendering (color, size, shape)
- Multi-selection
- Search-by-coordinate
- Backend / indexer changes

## Package Scope

- [x] web

## Open Questions

None — all clarified.
