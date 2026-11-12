# Monaco geometry references and accuracy

This is a source-informed approximation for a Formula Student practice game, not
survey data or an officially licensed circuit replica. Units in the renderer are
10 world units per metre. Elevation is relative to the lowest authored road point;
it is not geodetic altitude above sea level.

## Published facts used

- Formula 1, [Highs and lows: track elevation changes](https://www.formula1.com/en/latest/article/highs-and-lows-which-f1-track-has-the-most-elevation-changes-.7I9JEcBw3R2AqXbnJ6hyvc.7I9JEcBw3R2AqXbnJ6hyvc):
  Monaco has approximately 42 m of elevation change; the route rises from Sainte
  Devote to Casino Square and reaches its low point before La Rascasse.
- FIA, [Monaco circuit and pit-lane map, 24 May 2023, PDF pages 2–3](https://www.fia.com/sites/default/files/decision-document/2023%20Monaco%20Grand%20Prix%20-%20Event%20Notes%20-%20Circuit%20Map%2C%20Pit%20Lane%2C%20Red%20Zone%20and%20Pirelli%20Preview.pdf):
  route topology, Rascasse pit entry, lane alongside the main straight, separate
  exit after Sainte Devote, pit wall and garage arrangement. This is the source
  edition inspected; the model does not claim millimetre accuracy or certification
  against a later homologation plan.
- Formula 1, [Monaco corner guide](https://www.formula1.com/en/latest/article/explained-how-every-monaco-corner-got-its-name.5ClYqWmfpeUpsRJA6mDNaX):
  named sections and their sequence.
- Main centreline: Tomislav Bacinger's MIT-licensed coordinate dataset, retained
  as `monaco-source.geojson`. See `MONACO-LICENSE.md` for the required notice.

## Authored estimates

`monaco-reference.js` holds reviewable control points. Each profile row is a
source-polyline vertex index, relative elevation in metres and road width in
metres. Local heights between the documented high and low points are estimated.
Widths vary from approximately 7.3 to 12 m; **these local widths are not measured
or independently verified**. Smooth interpolation avoids width/elevation steps.
No banking, surveyed road bumps or camber data is claimed.

The pit route's geographic control points, 7 m lane width, garage dimensions and
pit elevation control points and entry/exit tapers are approximations informed by the FIA drawing. It is driveable
with the same grip, elevation sampling and collision rules as the main track.
There is no simulated pit crew, service action or automatic speed limiter.
Entering the pit route invalidates the current practice timing attempt; the next
forward main finish crossing starts a fresh attempt. Old flat-track personal
bests remain in the v1 storage keys and cannot become v2 personal bests.

Casino, Hotel de Paris, Fairmont, La Rascasse, the swimming pool, harbour, yachts,
fences and grandstands use authored geometry. Landmark centres and footprints
are approximate and may be reduced to preserve the existing centreline. Facades
are recognizable design cues, not surveyed meshes. Terrain outside the road is a
locally blended nearest-route height field; harbour water is horizontal and below the road. The
model does not represent underground structures or multiple overlapping road
levels at the same horizontal position.

## Runtime contract

One height field feeds the road, textured paint/kerbs, wheel heights, suspension,
camera pitch and gravitational grade. The same per-point road width feeds asphalt,
kerbs, edge paint, walls and wheel contact classification. Pit asphalt and physical
wall openings share the same path. Main and pit centreline car sweeps are checked.
The indexed segment query avoids scanning every segment for every terrain vertex.
Skinnarila's shared/authoritative physics files are not modified by this feature.
