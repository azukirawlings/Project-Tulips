# Project Tulips

Solving your "Tactical Issues" with the greatest convenience.
ONLY CHINESE VERSION AVAILABLE

## Functions

- Arbitrarily paint illustration with tactical signs
- Detail modification of single military unit
- Dual mode for viewing/editing
- Robust capabilities for recording and visualizing the temporal evolution of the battle
- 100% customized situation and stakeholder information
- Free Import/Export system with .json file

## Developments

Require Node.js 20+

```bash
npm install
npm run dev
```

Public service of the map applied without necessary api-keys

## Windows Single Execution

After the installation of Go:

```bash
npm run build
cd desktop
go build -ldflags="-s -w" -o Project Tulips.exe .
```

# Changelog

## 1.0.7 beta

1. Panning and zooming stay smooth. A range ring outside the view, or one that fills the screen, is not drawn in full. Icons outside the view are taken off the map until they return.
2. In the select tool, drag with the right button to move the map. The left button still draws a selection box.
3. The graphics list is grouped. Each group can be opened or closed.
4. Details for the selected graphic open in a card on the map. Edit mode changes the graphic there. View mode shows the stored description and strength.
5. The overview opens in its own window. Each faction is a separate block. Services are divided inside it, and each unit is marked with its echelon. The right side states whose losses and status are shown. Editing factions and echelons stays in the side panel.
6. Unit icons are rectangular and slightly larger than fortification icons. The symbol sits inside the plate, and the plate has a black border.
7. A route name sits beside the line. A range is labeled with the owner's name and range. An area of effect is labeled with the work's name. A defense line can be turned to face the other side.
8. Settings adds a compact mode. For each service, only the highest echelon present on the map keeps its name. Strongpoints and special works keep theirs. The selected unit still shows its name.

## 1.0.6 beta
1. The army list adds self-propelled artillery and self-propelled rocket artillery. Fortifications add a special work, which can be given a range or an area of effect. A range is drawn as an open circle. An area of effect is drawn freehand around the icon as an unfilled outline. The air force list adds missiles, which can also be given a range. These shapes sit beneath the icon and cannot be selected.
2. Unit icons gain a backing plate so they remain readable on imagery. The plate and the outline can be set for each faction. If they are left unset, they follow the basemap.
3. After a box selection, Ctrl+C copies the selected graphics.
4. An open line can be extended from either end.
5. When there are many factions, the faction control is a dropdown list.
6. Settings includes a large, medium, and small icon size. Medium is the previous size.

## 1.0.5 beta

1. A sandbox may be edited from two clients. Both join with the same room code, and no address is required. Closing the collaboration panel does not end the session.
2. On a shared network, one client may open a room and the other may join it by that machine's address.
3. Only map content is synchronized: units, graphics, factions, and stored times. Each client retains its own view. The open time, the times under comparison, the basemap, and edit or view mode are not propagated.
4. The first client to enter a room may grant or revoke edit rights for each other participant. A client without edit rights may inspect the map, but cannot modify it.
5. The select tool accepts a drag box. Delete removes every graphic in the selection.
6. The window title is Project Tulip.
7. The notes for view mode and for time comparison now describe what those controls do. The additional note in the collaboration panel has been removed.
8. Menus and the side panel open with a short animation. Buttons give a slight press response.

## 1.0.4 beta

1. Authorized personnel and equipment can no longer be set below the figures on hand. That case was corrupting the loss totals.
2. When every personnel and equipment pair on a unit is 0/0, the caption under the marker is left blank. Navy markers no longer read "Ships 0/0".
3. The "authorized − on hand" line under casualties has been removed.
4. Higher echelons use a slightly larger marker than lower echelons.
5. Controls that were styled as body text have been corrected: "Save current as a new time", "Background image", and "Default".
6. Replacing the executable preserves basic settings, including interface color and basemap. Older saves are read where the format allows. A save in which on-hand strength exceeded authorized strength is corrected to full strength: the two figures are set equal.
7. Arrows no longer take a line style.
8. In a time comparison, units that appear or drop out are marked.
9. In view mode, the divider between the graphics list and the unit panel can be dragged.

## 1.0.3 beta

1. The unit inspector now scrolls. Navy and air force settings previously extended past the bottom of the screen.
2. On the map, navy and air force markers show ship or aircraft counts rather than personnel.
3. "Download Windows build" has been removed from Sandbox.
4. The top-right Map entry has been renamed Settings.
5. Units may be linked to show a command relationship. A field army group can be tied to the armies under it.
6. Overview order is by service, then by formation. Army, navy, and air force are grouped. Within a service, units follow their parent from the top of that tree downward. Units at the same level are kept together, and formations are separated.

   Army: Army 1 — Div 1 and Div 2 (same level) — Regt 1 — Squad 1. Break. Army 2 — Div 3 and Div 4. Break. Navy follows the same pattern under its own heading.

7. Two line styles have been added: a crossed line, and a defensive trace. The mark along the stroke stays small, so a short segment remains readable.
8. Settings provides a view mode and an edit mode. In view mode, selecting a graphic opens the side panel with its picture, if one is set, a short description, and the stored personnel and equipment. Edit mode is unchanged.
9. One sandbox may hold several times. With two or more times selected, each unit's track is drawn as arrows in steps of the same hue, from light to dark. A blue unit, for example, runs from pale blue to deep blue. A unit that did not move, but whose strength or equipment changed, receives an arrow marked with those figures. Defensive traces and boundaries keep their base color and use the same shade steps, with the time labeled on the line. Plans drawn under a given time are included in the comparison and are not hidden.
10. A save stores the full state at the last write. Opening it restores what was on screen, including view mode when that mode was active.

## 1.0.2 beta

1. The echelon editor in the overview has been corrected. The text field was too short to read, and the up and down controls were too large and the same color as the panel, so they did not read as buttons.
2. Faction color can be set from a swatch.
3. Text fields now accept an empty value, so the last character can be deleted.
4. Navy and air force units no longer show personnel categories. Those fields do not apply.
5. The interface accepts a solid color or an uploaded background image.
6. Opening the roster on the right still closes Map or Sandbox when one of those panels is open. If the roster is already open, opening Map or Sandbox again draws that panel above the side roster.
7. The overview lists losses by equipment type.

## 1.0.1 beta

1. Each unit has two strength blocks: personnel on hand and authorized, and equipment on hand and authorized.

   Army: utility vehicles, trucks, APCs, IFVs, amphibious fighting vehicles, light tanks, MBTs, transport helicopters, attack helicopters.

   Navy: small craft, armed patrol boats, gunboats, coastal defense vessels, frigates, destroyers, cruisers, carriers.

   Air force: fighters, ground-attack and support aircraft, bombers, transports.

   The left rail shows an overview for both sides: personnel and equipment still on hand, and losses, calculated as authorized minus on hand and then summed.

2. Units may be placed in a command hierarchy. Level names are editable, for example field army, battlegroup, division, or squad, as is the depth of the tree. The overview can be limited to one side and to any echelon, including a single battlegroup, and shows losses and strength on hand for that cut. Faction names and the number of factions are editable. The default pair remains Friendly and Enemy.
