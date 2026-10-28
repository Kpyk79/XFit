/* ============ XFIT 3D LOGO ============
   Extruded 3D model of the XFIT logo, built from vector outlines traced
   from the original artwork (755×429 px space, y pointing down).
   Usage (browser): const logo = XFitLogo3D.create(THREE); scene.add(logo);
   Usage (node):    require('./logo3d.js').create(THREE)
*/
(function (root) {
  // Outlines in source-image pixels. 'C' = cubic bezier (c1x, c1y, c2x, c2y, x, y).
  const X_SWOOSH = [
    ['M', 345, 88],
    ['C', 280, 85, 235, 100, 160, 183],
    ['L', 153, 183],
    ['L', 126, 137],
    ['L', 68, 137],
    ['L', 112, 221],
    ['L', 113, 230],
    ['C', 80, 265, 40, 305, 0, 327],
    ['L', 0, 333],
    ['C', 50, 333, 95, 315, 135, 280],
    ['L', 180, 236],
    ['C', 240, 175, 300, 108, 345, 90]
  ];
  const X_LEG = [
    ['M', 189, 254],
    ['C', 168, 278, 160, 310, 174, 333],
    ['L', 232, 333]
  ];
  // F, I, T share the same italic slant (~20°).
  const LETTER_F = [[320, 161], [460, 161], [444.4, 204], [356.8, 204], [344, 239], [418, 239], [403, 280], [329.2, 280], [310, 333], [258, 333]];
  const LETTER_I = [[486, 161], [538, 161], [476, 333], [424, 333]];
  const LETTER_T = [[563, 161], [716, 161], [700.4, 204], [653.8, 204], [607, 333], [554, 333], [600.8, 204], [547.4, 204]];

  const CENTER_X = 358;
  const CENTER_Y = 210;
  const UNIT = 100; // source pixels per world unit → logo is ~7.2 units wide

  function shapeFromPath(THREE, cmds) {
    const s = new THREE.Shape();
    const px = (x) => (x - CENTER_X) / UNIT;
    const py = (y) => -(y - CENTER_Y) / UNIT;
    cmds.forEach((c) => {
      if (c[0] === 'M') s.moveTo(px(c[1]), py(c[2]));
      else if (c[0] === 'L') s.lineTo(px(c[1]), py(c[2]));
      else s.bezierCurveTo(px(c[1]), py(c[2]), px(c[3]), py(c[4]), px(c[5]), py(c[6]));
    });
    s.closePath();
    return s;
  }

  function shapeFromPoints(THREE, pts) {
    return shapeFromPath(THREE, pts.map((p, i) => [i === 0 ? 'M' : 'L', p[0], p[1]]));
  }

  function create(THREE, opts) {
    const o = Object.assign({
      depth: 0.55,
      bevel: 0.05,
      green: 0x39ff6a,
      white: 0xf4f6f4,
      edges: true,
      curveSegments: 24,
      wireframe: false // true → transparent mesh drawn as thin green polygon lines
    }, opts || {});
    if (o.wireframe) Object.assign(o, { bevel: 0, edges: false, curveSegments: Math.min(o.curveSegments, 10) });

    const extrude = {
      depth: o.depth,
      bevelEnabled: o.bevel > 0,
      bevelThickness: o.bevel,
      bevelSize: o.bevel * 0.8,
      bevelSegments: 3,
      curveSegments: o.curveSegments
    };

    function build(shapes, name) {
      const geo = new THREE.ExtrudeGeometry(shapes, extrude);
      geo.translate(0, 0, -o.depth / 2);
      geo.computeVertexNormals();
      geo.name = name;
      return geo;
    }

    const greenMat = o.wireframe
      ? new THREE.MeshBasicMaterial({ color: o.green, wireframe: true, transparent: true, opacity: 0.7 })
      : new THREE.MeshStandardMaterial({ color: o.green, emissive: o.green, emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.3 });
    greenMat.name = 'XFit_Green';
    const whiteMat = o.wireframe
      ? new THREE.MeshBasicMaterial({ color: o.green, wireframe: true, transparent: true, opacity: 0.45 })
      : new THREE.MeshStandardMaterial({ color: o.white, emissive: 0x2a2e2a, metalness: 0.2, roughness: 0.35 });
    whiteMat.name = 'XFit_White';

    const group = new THREE.Group();
    group.name = 'XFitLogo';

    const x = new THREE.Mesh(build([shapeFromPath(THREE, X_SWOOSH), shapeFromPath(THREE, X_LEG)], 'X'), greenMat);
    x.name = 'X';
    const fit = new THREE.Mesh(build([LETTER_F, LETTER_I, LETTER_T].map((p) => shapeFromPoints(THREE, p)), 'FIT'), whiteMat);
    fit.name = 'FIT';
    group.add(x, fit);

    if (o.edges) {
      // Neon outline on the silhouette edges.
      [[x, o.green, 0.9], [fit, o.green, 0.35]].forEach(([mesh, color, opacity]) => {
        const lines = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry, 30),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity })
        );
        lines.name = mesh.name + '_Edges';
        mesh.add(lines);
      });
    }

    return group;
  }

  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.XFitLogo3D = api;
})(typeof window !== 'undefined' ? window : this);
