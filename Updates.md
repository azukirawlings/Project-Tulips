# Changelog

## 1.0.7 beta

1. Panning and zooming no longer rebuild the sandbox on every step. The view is written back after the gesture settles.
2. A range ring that fills the screen, or lies completely outside it, is not drawn. At high zoom only the visible arc is stroked.
3. Icons outside the view are taken off the map until they return. Icons still in view follow the zoom.
4. Command links are resolved directly. A graphic that has not changed is not measured again on refresh.
5. In the select tool, drag with the right button to move the map. The left button still draws a selection box.
6. The graphics list is grouped. Each group can be opened or closed.
7. Details for the selected graphic open in a card on the map. The card can be closed. Edit mode changes the graphic there. View mode shows the stored description and strength.
8. The overview is a tree of factions and the units under them. Open a unit to see strength on hand, authorized strength, and losses. Click a faction to include it in the total, and click it again to remove it. Units can be combined only when they belong to the same faction. A unit from another faction replaces the previous choice.
9. Unit icons are rectangular and slightly larger than fortification icons.
10. Editing a line no longer leaves the pointer in the grab state. Units can be selected again afterward.
11. Unit symbols sit inside the rectangular plate, and the plate has a black border.
12. A route name sits beside the line, not at the geometric center. A range is labeled with the owner's name and “range”. An area of effect is labeled with the work's name.
13. A defense line can be turned to face the other side.
14. The overview opens in its own window over the map. The left side chooses factions or units. The right side states whose losses and status are shown. Editing factions and echelons stays in the side panel.

## 1.0.5 beta

1. Two people can work on the same sandbox. Both enter the same room code. No address is required. Closing the collaboration panel does not disconnect.
2. On the same network, one side can still open a room and the other can join it with that computer's address.
3. Only the map content is shared: units, graphics, factions, and the saved times. Each side keeps its own view. Changing the open time, the times being compared, the basemap, or edit/view mode does not change the other side.
4. The first person in the room can allow or remove editing for each other person. A person without edit rights can look, but cannot change the map.
5. With the select tool, drag a box around several graphics. Delete removes all of them.
6. The window title is Project Tulip.
7. The notes for view mode and for comparing times were rewritten so they describe what those controls do. The extra note in the collaboration panel was removed.
8. Menus and the side panel open with a short animation. Buttons press in slightly.

## 1.0.4 beta

1. Authorized personnel and equipment cannot be set below the figures on hand. That case was breaking the loss totals.
2. If every personnel and equipment pair on a unit is 0/0, the caption under the marker is left blank. Navy markers no longer read “Ships 0/0”.
3. Removed the “authorized − on hand” line under casualties.
4. Higher echelons use a slightly larger marker than lower ones.
5. Fixed controls that were styled as body text: “Save current as a new time”, “Background image”, and “Default”.
6. Replacing the .exe keeps basic settings such as interface color and basemap. Older saves are read where the format allows. A save in which on-hand strength was higher than authorized strength is corrected to full strength: the two figures are set equal.
7. Arrows no longer take a line style.
8. In a time comparison, units that appear or drop out are marked.
9. In view mode, the split between the graphics list and the unit panel can be dragged.

## 1.0.3 beta

1. Fixed the unit inspector. Navy and air force settings had no scrollbar, so the lower fields were off screen.
2. On the map, navy and air force markers show ship or aircraft counts, not personnel.
3. Removed Download Windows build from Sandbox.
4. Renamed the top-right Map entry to Settings.
5. Optional link lines between units, for command relationships. A field army group can be tied to the armies under it.
6. Overview order is by service, then by formation. Army, navy, and air force are grouped. Inside a service, units follow their parent from the top of that tree down. Units at the same level sit together, and formations are separated.

   Army: Army 1 — Div 1 and Div 2 (same level) — Regt 1 — Squad 1. Break. Army 2 — Div 3 and Div 4. Break. Navy follows the same pattern under its own heading.

7. Added line styles: a crossed line, and a defensive trace like the one in figure 2. The mark along the stroke stays small, so a short segment is still readable.
8. Settings has a view mode and an edit mode. In view mode, selecting a graphic opens the side panel with a picture if one is set, a short description, and the stored personnel and equipment. Edit mode is unchanged.
9. One sandbox can hold several times. With two or more times selected, each unit’s track is drawn as arrows in steps of the same hue, light to dark (a blue unit runs from pale blue to deep blue). A unit that did not move but changed strength or equipment gets an arrow marked with the figures. Defensive traces and boundaries keep their base color and use the same shade steps, with the time labeled on the line. Plans drawn under a given time are included in the comparison. They are not hidden.
10. A save is the full state at the last write. Opening it matches what was on screen, including view mode if that was active.

## 1.0.2 beta

1. Fixed the echelon editor in the overview. The text field was too short to read, and the up and down controls were too large and the same color as the panel, so they did not look like buttons.
2. Faction color can be set from a swatch.
3. Fixed text fields that would not accept an empty value, so the last character could not be deleted.
4. Navy and air force units no longer show personnel categories. Those fields do not apply.
5. The interface can use a solid color or an uploaded background image.
6. Opening the roster on the right still closes Map or Sandbox if one of those is open. If the roster is already open, opening Map or Sandbox again draws that panel above the side roster.
7. The overview lists losses by equipment type.

## 1.0.1 beta

1. Each unit has two strength blocks: personnel on hand and authorized, and equipment on hand and authorized.

   Army: utility vehicles, trucks, APCs, IFVs, amphibious fighting vehicles, light tanks, MBTs, transport helicopters, attack helicopters.

   Navy: small craft, armed patrol boats, gunboats, coastal defense vessels, frigates, destroyers, cruisers, carriers.

   Air force: fighters, ground-attack and support aircraft, bombers, transports.

   The left rail has an overview for both sides: personnel and equipment still on hand, and losses (authorized minus on hand, summed).

2. Units can be placed in a command hierarchy. Level names are editable (for example field army, battlegroup or division, squad), and so is how deep the tree goes. The overview can be limited to one side and to any echelon, including a single battlegroup, and shows losses and strength on hand for that cut. Faction names and the number of factions are editable. The default pair is still Friendly and Enemy.
