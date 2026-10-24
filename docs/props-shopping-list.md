# Props shopping list — CC0 only, download now

Keep downloads in `prep/assets/props/`. Pick low-poly; the store is a box model and realistic props look wrong next to it. Every pack below is CC0 (no attribution required), but check the license on the download page of anything from an aggregator, because Poly Pizza mixes licenses per model.

## Packs

| Source | What to get | Why |
| --- | --- | --- |
| [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | shelves, cabinets, a counter-like desk, chairs | 140 assets, GLB included, consistent style for the store dressing |
| [Kenney assets index](https://kenney.nl/assets) | search "food", "shop", "city commercial" for bottles, cans, boxes, a cash register if one exists | one style across the scene |
| [Quaternius](https://quaternius.com/) | Ultimate Furniture pack; a weapons pack for the knife; any "props" or "food" megakit | CC0, FBX and GLB, same low-poly look |
| [Poly Pizza](https://poly.pizza/) | search knife, cash register, backpack, bottle, phone, baseball bat, shelf, cooler, door | aggregator; download by hand and check each model's license badge |

## The 12 GLBs we need (file name → what to look for)

| `type` in props.json | File | Look for | Dimensions to scale to (m) |
| --- | --- | --- | --- |
| `knife_chef` | `knife_chef.glb` | a chef's knife, blade distinct from handle, origin at the grip | 0.33 long (0.203 blade) |
| `knife_paring` | `knife_paring.glb` | small knife | 0.19 long |
| `handgun` | `handgun.glb` | a generic pistol, no brand marks | 0.187 x 0.128 x 0.032 |
| `bat` | `bat.glb` | baseball bat | 0.85 long, 0.066 diameter |
| `phone` | `phone.glb` | smartphone slab | 0.15 x 0.072 x 0.008 |
| `bottle_beer` | `bottle_beer.glb` | longneck bottle | 0.231 x 0.061 |
| `bottle_wine` | `bottle_wine.glb` | wine bottle | 0.30 x 0.075 |
| `backpack` | `backpack.glb` | backpack | 0.42 x 0.33 x 0.22 |
| `register` | `register.glb` | cash register or POS box | 0.40 x 0.40 x 0.30 |
| `chair` | `chair.glb` | dining chair | 0.84 x 0.52 x 0.51 |
| `shelf_unit` | `shelf_unit.glb` | gondola shelf, double sided | 1.8 x 1.2 x 1.0 |
| `cooler_door` | `cooler_door.glb` | glass-door fridge unit | 2.0 x 0.7 x 0.7 |

Plus dressing for the store (visual only, `collision: false`): a few chip bags, cans, boxes, a trash can, a doormat.

## Rules

- Scale every model to meters at load from `dimensionsM` (the library does this); do not resize in Blender.
- Origin matters: for graspable props put the origin at the grip; for furniture at the base center. If a downloaded model's origin is wrong, fix it in Blender (set origin to selected vertex) and export GLB; that is the only Blender work worth doing on props.
- No faces, no brand logos, no real product art. A generic bottle, not a Coke bottle; a generic pistol, not a Glock model from Sketchfab.
- Mixamo files and anything with a non-CC0 license stay out of the public repo (`assets/` is git-ignored; teammates get a zip).

## props.json entry shape (Hazel fills it; you only need to know the shape)

```json
{
  "type": "knife_chef",
  "label": "chef's knife",
  "aliases": ["knife", "kitchen knife", "blade", "a big knife"],
  "modelUrl": "/props/knife_chef.glb",
  "dimensionsM": { "l": 0.33, "w": 0.051, "h": 0.02 },
  "massKg": 0.25,
  "graspable": true,
  "collider": "cuboid",
  "gripOffset": [0, 0, 0.08],
  "defaultNotes": "Blade 203 mm (8 in). Dimensions are for a typical chef's knife; the witness's estimate is in the instance notes.",
  "source": "https://www.katom.com/037-47020.html"
}
```
