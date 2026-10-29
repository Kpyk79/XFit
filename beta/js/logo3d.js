/* ============ XFIT 3D LOGO ============
   Extruded 3D model of the XFit logo (green X + white Fit), built from
   vector outlines of the original artwork (1440×663 px space, y down).
   Usage (browser): const logo = XFitLogo3D.create(THREE); scene.add(logo);
   Usage (node):    require('./logo3d.js').create(THREE)
*/
(function (root) {
  // Outlines of the original XFit logo in source-image pixels (1440×663, y down),
  // redrawn as straight strokes with small rounded corners.
  // 'Q' = quadratic bezier (cx, cy, x, y).
  const X_MARK = [[['M',845.0,69.0],['Q',845,66,842.0,66.0],['L',727.0,66.0],['Q',721,66,716.8,70.2],['L',574.1,212.9],['Q',570,217,564.5,215.0],['L',564.5,215.0],['Q',559,213,556.4,207.8],['L',535.7,166.4],['Q',533,161,527.0,161.0],['L',436.0,161.0],['Q',430,161,432.8,166.3],['L',495.2,284.7],['Q',498,290,496.7,295.9],['L',496.3,298.1],['Q',495,304,490.8,308.2],['L',321.8,477.2],['Q',320,479,320.0,481.5],['L',320.0,481.5],['Q',320,484,322.5,484.0],['L',420.0,484.0],['Q',426,484,430.2,479.7],['L',532.8,374.3],['Q',537,370,539.9,375.2],['L',599.1,480.8],['Q',602,486,608.0,486.0],['L',656.0,486.0],['Q',662,486,663.4,480.2],['L',676.6,425.8],['Q',678,420,675.1,414.8],['L',616.9,310.2],['Q',614,305,618.2,300.7],['L',842.9,74.1],['Q',845,72,845.0,69.0]]];
  const FIT_LETTERS = [[['M',735.7,242.9],['Q',737,237,743.0,237.0],['L',884.0,237.0],['Q',890,237,888.8,242.9],['L',882.2,276.1],['Q',881,282,875.0,282.0],['L',786.0,282.0],['Q',780,282,778.7,287.9],['L',767.3,338.1],['Q',766,344,772.0,344.0],['L',845.0,344.0],['Q',851,344,849.8,349.9],['L',843.2,384.1],['Q',842,390,836.0,390.0],['L',762.0,390.0],['Q',756,390,754.7,395.9],['L',735.3,483.1],['Q',734,489,728.0,489.0],['L',687.0,489.0],['Q',681,489,682.3,483.1]],[['M',899.7,311.9],['Q',901,306,907.0,306.0],['L',946.0,306.0],['Q',952,306,950.7,311.9],['L',912.3,483.1],['Q',911,489,905.0,489.0],['L',866.0,489.0],['Q',860,489,861.3,483.1]],[['M',910.8,242.9],['Q',912,237,918.0,237.0],['L',960.0,237.0],['Q',966,237,964.8,242.9],['L',958.2,277.1],['Q',957,283,951.0,283.0],['L',909.0,283.0],['Q',903,283,904.2,277.1]],[['M',1010.5,266.8],['Q',1012,261,1018.0,261.0],['L',1056.0,261.0],['Q',1062,261,1060.7,266.9],['L',1053.3,299.1],['Q',1052,305,1058.0,305.0],['L',1093.0,305.0],['Q',1099,305,1097.6,310.8],['L',1090.4,342.2],['Q',1089,348,1083.0,348.0],['L',1049.0,348.0],['Q',1043,348,1041.8,353.9],['L',1027.5,422.7],['Q',1027,425,1026.6,427.3],['L',1026.6,427.5],['Q',1026.3,429.6,1026.2,431.6],['L',1026.2,431.8],['Q',1026.1,433.6,1026.3,435.4],['L',1026.3,435.6],['Q',1026.4,437.2,1026.9,438.8],['L',1026.9,438.9],['Q',1027.3,440.4,1028.0,441.7],['L',1028.1,441.7],['Q',1028.8,443.0,1029.7,444.1],['L',1029.7,444.1],['Q',1030.7,445.2,1031.9,446.0],['L',1032.0,446.0],['Q',1033.2,446.8,1034.6,447.4],['L',1034.8,447.4],['Q',1036.3,448.0,1037.9,448.4],['L',1038.1,448.4],['Q',1039.9,448.8,1041.7,448.9],['L',1041.9,448.9],['Q',1044.0,449.0,1046.1,449.0],['L',1065.0,449.0],['Q',1071,449,1069.7,454.9],['L',1063.3,483.1],['Q',1062,489,1056.0,489.0],['L',1016.3,489.0],['Q',1012,489,1007.7,488.8],['L',1007.2,488.7],['Q',1003.3,488.5,999.5,487.8],['L',999.1,487.7],['Q',995.7,487.0,992.4,485.8],['L',992.1,485.7],['Q',989.1,484.6,986.3,482.9],['L',986.2,482.8],['Q',983.5,481.2,981.3,479.0],['L',981.3,479.0],['Q',979.0,476.8,977.3,474.1],['L',977.3,474.1],['Q',975.5,471.4,974.4,468.4],['L',974.3,468.2],['Q',973.1,465.0,972.4,461.6],['L',972.4,461.3],['Q',971.7,457.6,971.5,453.9],['L',971.5,453.5],['Q',971.3,449.3,971.6,445.2],['L',971.7,444.7],['Q',972.0,440.0,972.9,435.4],['L',988.8,353.9],['Q',990,348,984.0,348.0],['L',972.0,348.0],['Q',966,348,967.2,342.1],['L',973.8,310.9],['Q',975,305,981.0,305.0],['L',995.0,305.0],['Q',1001,305,1002.5,299.2]]];

  const CENTER_X = 710;
  const CENTER_Y = 277;
  const UNIT = 108; // source pixels per world unit → logo is ~7.2 units wide

  function shapeFromPath(THREE, cmds) {
    const s = new THREE.Shape();
    const px = (x) => (x - CENTER_X) / UNIT;
    const py = (y) => -(y - CENTER_Y) / UNIT;
    cmds.forEach((c) => {
      if (c[0] === 'M') s.moveTo(px(c[1]), py(c[2]));
      else if (c[0] === 'L') s.lineTo(px(c[1]), py(c[2]));
      else if (c[0] === 'Q') s.quadraticCurveTo(px(c[1]), py(c[2]), px(c[3]), py(c[4]));
      else s.bezierCurveTo(px(c[1]), py(c[2]), px(c[3]), py(c[4]), px(c[5]), py(c[6]));
    });
    s.closePath();
    return s;
  }

  function create(THREE, opts) {
    const o = Object.assign({
      depth: 0.55,
      bevel: 0.05,
      green: 0x39ff6a,
      white: 0xf4f6f4,
      edges: true,
      curveSegments: 6, // rounded corners are small, a few segments each is enough
      wireframe: false // true → transparent mesh drawn as thin polygon lines (green X, white Fit)
    }, opts || {});
    if (o.wireframe) Object.assign(o, { bevel: 0, edges: false, curveSegments: 1, depth: Math.min(o.depth, 0.4) }); // кути — одна фаска, щоб сітка лишалась читабельною

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
      ? new THREE.MeshBasicMaterial({ color: o.white, wireframe: true, transparent: true, opacity: 0.4 })
      : new THREE.MeshStandardMaterial({ color: o.white, emissive: 0x2a2e2a, metalness: 0.2, roughness: 0.35 });
    whiteMat.name = 'XFit_White';

    const group = new THREE.Group();
    group.name = 'XFitLogo';

    const x = new THREE.Mesh(build(X_MARK.map((p) => shapeFromPath(THREE, p)), 'X'), greenMat);
    x.name = 'X';
    const fit = new THREE.Mesh(build(FIT_LETTERS.map((p) => shapeFromPath(THREE, p)), 'FIT'), whiteMat);
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
