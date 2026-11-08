// Every source band has a fixed world origin. A floor-reaching pier has no moving foot:
// only its repeated shaft continues as far as the viewport needs.
export function bridgeBands(p, g, worldHeight, viewportBottom) {
  const k = g.scale ?? p.w / g.width, top = p.y - g.walk * k;
  const [l0, l1] = g.legs, course = (l1 - l0) * k;
  const shaftY = top + (l0 - g.y) * k, extendsBelow = p.y + p.h >= worldHeight - 1;
  const courses = extendsBelow
    ? Math.max(1, Math.ceil((Math.max(p.y + p.h, viewportBottom + course) - shaftY) / course))
    : 1 + Math.max(0, Math.ceil((p.y + p.h - (top + (g.base - g.y) * k)) / course));
  const bands = [{ sy: g.y, sh: l0 - g.y, y: top }];
  for (let i = 0; i < courses; i++) bands.push({ sy: l0, sh: l1 - l0, y: shaftY + i * course });
  if (!extendsBelow) bands.push({ sy: l1, sh: g.y + g.height - l1, y: shaftY + courses * course });
  return bands;
}
