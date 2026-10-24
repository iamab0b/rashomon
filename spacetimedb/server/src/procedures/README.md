# procedures

Owner: Eric.

Empty on purpose. `extractSegment(segmentId)` and `regate(sceneId)` from the design doc's module table go here: the HTTPS call to Claude, the patch validation, and the second transaction that applies the patches and writes the gate's verdict through `applyPatches` and `setStatuses`.

Add each procedure in its own file in this folder and re-export it from `../index.ts`. Nothing outside this folder needs to change to add one.
