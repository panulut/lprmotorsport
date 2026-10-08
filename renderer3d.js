/* Small dependency-free WebGL renderer for the driver view. World X/Y become 3D X/Z. */
window.LPRRenderer3D = class LPRRenderer3D {
  constructor(canvas, cockpitCanvas, track) {
    this.canvas = canvas;
    this.cockpitCanvas = cockpitCanvas;
    this.cockpit = cockpitCanvas.getContext('2d');
    this.gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!this.gl) throw new Error('WebGL ei ole käytettävissä tässä selaimessa.');
    this.track = track;
    this.width = 0;
    this.height = 0;
    this.makeProgram();
    this.makeWorld();
    this.wheelBuffer = this.gl.createBuffer();
    this.wheelPhase = 0;
    this.lastWheelFrame = 0;
  }

  makeProgram() {
    const gl = this.gl;
    const vertexSource = `
      attribute vec3 aPosition;
      attribute vec3 aColor;
      uniform vec3 uCamera;
      uniform vec3 uForward;
      uniform vec3 uRight;
      uniform vec3 uUp;
      uniform float uAspect;
      uniform float uFocal;
      varying vec3 vColor;
      varying float vDepth;
      void main() {
        vec3 relative = aPosition - uCamera;
        float depth = dot(relative, uForward);
        float clipZ = depth * 1.0010005 - 2.0010005;
        gl_Position = vec4(dot(relative, uRight) * uFocal / uAspect,
                           dot(relative, uUp) * uFocal, clipZ, depth);
        vColor = aColor;
        vDepth = depth;
      }
    `;
    const fragmentSource = `
      precision mediump float;
      varying vec3 vColor;
      varying float vDepth;
      void main() {
        vec3 sky = vec3(0.59, 0.76, 0.74);
        float fog = clamp((vDepth - 320.0) / 1000.0, 0.0, 0.83);
        gl_FragColor = vec4(mix(vColor, sky, fog), 1.0);
      }
    `;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    this.program = program;
    this.locations = {
      position: gl.getAttribLocation(program, 'aPosition'),
      color: gl.getAttribLocation(program, 'aColor'),
      camera: gl.getUniformLocation(program, 'uCamera'),
      forward: gl.getUniformLocation(program, 'uForward'),
      right: gl.getUniformLocation(program, 'uRight'),
      up: gl.getUniformLocation(program, 'uUp'),
      aspect: gl.getUniformLocation(program, 'uAspect'),
      focal: gl.getUniformLocation(program, 'uFocal')
    };
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(.59, .76, .74, 1);
  }

  makeWorld() {
    const gl = this.gl;
    const data = [];
    const add = (point, color) => data.push(point[0], point[1], point[2], color[0], color[1], color[2]);
    const tri = (a, b, c, color) => { add(a, color); add(b, color); add(c, color); };
    const quad = (a, b, c, d, color) => { tri(a, b, c, color); tri(a, c, d, color); };
    const box = (x, y, z, sx, sy, sz, color) => {
      const x0 = x - sx / 2, x1 = x + sx / 2, y0 = y, y1 = y + sy, z0 = z - sz / 2, z1 = z + sz / 2;
      const shade = factor => color.map(value => value * factor);
      quad([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],shade(.8));
      quad([x1,y0,z1],[x0,y0,z1],[x0,y1,z1],[x1,y1,z1],shade(.8));
      quad([x0,y0,z1],[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],shade(.65));
      quad([x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0],shade(.65));
      quad([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],color);
    };
    const cone = (x, z, height, radius, color, baseHeight = 0) => {
      const apex = [x, height, z];
      const ring = [[x-radius,baseHeight,z-radius],[x+radius,baseHeight,z-radius],[x+radius,baseHeight,z+radius],[x-radius,baseHeight,z+radius]];
      for (let i = 0; i < 4; i++) tri(ring[i],ring[(i+1)%4],apex,color.map(v => v * (i % 2 ? .84 : 1)));
    };
    const smokePuff = (forward, side, height, size, color) => {
      const sides = 8;
      const bottom = [], top = [];
      for (let i = 0; i < sides; i++) {
        const angle = i * Math.PI * 2 / sides;
        bottom.push([forward + Math.cos(angle) * size, side + Math.sin(angle) * size, height]);
        top.push([forward + Math.cos(angle) * size * .82, side + Math.sin(angle) * size * .82, height + size * 1.15]);
      }
      for (let i = 0; i < sides; i++) {
        const next = (i + 1) % sides;
        quad(vanPoint(bottom[i][0],bottom[i][1],bottom[i][2]),
             vanPoint(bottom[next][0],bottom[next][1],bottom[next][2]),
             vanPoint(top[next][0],top[next][1],top[next][2]),
             vanPoint(top[i][0],top[i][1],top[i][2]),color.map(value => value * (i % 2 ? .88 : 1)));
      }
      for (let i = 1; i < sides - 1; i++) {
        tri(vanPoint(top[0][0],top[0][1],top[0][2]),
            vanPoint(top[i][0],top[i][1],top[i][2]),
            vanPoint(top[i+1][0],top[i+1][1],top[i+1][2]),color);
      }
    };
    const points = this.track;
    const count = points.length;
    const normals = points.map((_, i) => {
      const before = points[(i - 1 + count) % count];
      const after = points[(i + 1) % count];
      const dx = after.x - before.x, dz = after.y - before.y;
      const length = Math.hypot(dx, dz);
      return { x: -dz / length, z: dx / length };
    });
    const at = (i, offset, height) => [points[i].x + normals[i].x * offset, height, points[i].y + normals[i].z * offset];
    const strip = (left, right, height, colorForSegment) => {
      for (let i = 0; i < count; i++) {
        const next = (i + 1) % count;
        quad(at(i,left,height), at(next,left,height), at(next,right,height), at(i,right,height), colorForSegment(i));
      }
    };

    // Wide flat terrain and distinct bands make the approaching road readable at speed.
    quad([-2200,-.4,-2200],[2200,-.4,-2200],[2200,-.4,2200],[-2200,-.4,2200],[.095,.235,.155]);
    // The shoulder is a continuous strip beneath the asphalt.
    strip(-35,35,.01,() => [.16,.18,.17]);
    strip(-27,27,.05,() => [.19,.22,.225]);
    strip(-33,-27,.09,i => Math.floor(i / 3) % 2 ? [.92,.9,.82] : [.67,.13,.12]);
    strip(27,33,.09,i => Math.floor(i / 3) % 2 ? [.67,.13,.12] : [.92,.9,.82]);
    strip(-25,-24.4,.12,() => [.84,.86,.75]);
    strip(24.4,25,.12,() => [.84,.86,.75]);
    for (let i = 0; i < count; i += 10) {
      const next = (i + 4) % count;
      quad(at(i,-.7,.12),at(next,-.7,.12),at(next,.7,.12),at(i,.7,.12),[.52,.58,.52]);
    }

    const first = points[0];
    const tangent = { x: points[1].x - first.x, z: points[1].y - first.y };
    const tangentLength = Math.hypot(tangent.x,tangent.z);
    tangent.x /= tangentLength; tangent.z /= tangentLength;
    const square = (side, along) => [first.x + normals[0].x * side + tangent.x * along,.18,first.y + normals[0].z * side + tangent.z * along];
    for (let row = 0; row < 2; row++) for (let col = 0; col < 10; col++) {
      const a = -25 + col * 5, b = a + 5, f = -2 + row * 2, g = f + 2;
      quad(square(a,f),square(b,f),square(b,g),square(a,g),(row+col)%2 ? [.94,.94,.86] : [.08,.09,.09]);
    }

    // Simple 3D trees and cones add distance cues without external 3D assets.
    let seed = 17;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < count; i += 6) {
      for (const side of [-1,1]) {
        // Keep the approach to the sauna truck open so it is visible from the road.
        if (i >= 18 && i <= 42 && side === -1) continue;
        const distance = 75 + random() * 100;
        const x = points[i].x + normals[i].x * distance * side;
        const z = points[i].y + normals[i].z * distance * side;
        const height = 28 + random() * 20;
        box(x,0,z,3,height*.35,3,[.24,.17,.11]);
        cone(x,z,height,9+random()*6,random()>.5 ? [.08,.29,.19] : [.055,.23,.16],4);
      }
    }
    for (let i = 15; i < count; i += 20) {
      for (const side of [-1,1]) {
        const x = points[i].x + normals[i].x * 39 * side;
        const z = points[i].y + normals[i].z * 39 * side;
        cone(x,z,8,3,[.94,.39,.08]);
      }
    }
    for (const side of [-1,1]) {
      const x = first.x + normals[0].x * 40 * side;
      const z = first.y + normals[0].z * 40 * side;
      box(x,0,z,3,30,3,[.035,.17,.12]);
    }
    const beamCenter = [first.x, first.y];
    for (let i = -40; i < 40; i += 4) {
      const x = beamCenter[0] + normals[0].x * (i + 2);
      const z = beamCenter[1] + normals[0].z * (i + 2);
      box(x,26,z,4,5,4,i % 8 === 0 ? [.03,.68,.43] : [.03,.16,.13]);
    }

    // Park the sauna truck outside the first bend. Dimensions are in world units
    // (10 units ≈ 1 metre); its nearest bodywork stays clear of the shoulder.
    const stopIndex = Math.min(30, count - 1);
    const stop = at(stopIndex, -74, 0);
    const beforeStop = points[(stopIndex - 1 + count) % count];
    const afterStop = points[(stopIndex + 1) % count];
    const travelAngle = Math.atan2(afterStop.y - beforeStop.y, afterStop.x - beforeStop.x);
    const forwardX = -Math.cos(travelAngle), forwardZ = -Math.sin(travelAngle);
    const rightX = -forwardZ, rightZ = forwardX;
    const vanPoint = (forward, side, height) => [
      stop[0] + forwardX * forward + rightX * side,
      height,
      stop[2] + forwardZ * forward + rightZ * side
    ];
    const vanPrism = (front, back, left, right, bottom, top, color) => {
      const p = vanPoint;
      const shade = factor => color.map(value => value * factor);
      quad(p(front,left,bottom),p(back,left,bottom),p(back,left,top),p(front,left,top),shade(.82));
      quad(p(back,right,bottom),p(front,right,bottom),p(front,right,top),p(back,right,top),shade(.74));
      quad(p(front,right,bottom),p(front,left,bottom),p(front,left,top),p(front,right,top),shade(.9));
      quad(p(back,left,bottom),p(back,right,bottom),p(back,right,top),p(back,left,top),shade(.68));
      quad(p(front,left,top),p(back,left,top),p(back,right,top),p(front,right,top),color);
    };
    const wood = [.69,.51,.33], white = [.82,.85,.81], dark = [.095,.11,.11];
    const glass = [.13,.22,.24], steel = [.38,.41,.39];
    vanPrism(-34,34,-10,10,3,7,dark);                 // chassis
    vanPrism(-33,11,-12,12,8,34,wood);               // timber sauna body
    vanPrism(11,32,-10,10,7,24,white);               // white cab
    vanPrism(31,34,-10.5,10.5,5,7,steel);           // bumper
    vanPrism(10,32,-10.5,10.5,23,25,white);         // cab roof
    vanPrism(15,30,-7.5,7.5,25,28,white);           // roof pod
    vanPrism(-16,-10,-3,3,34,46,dark);               // sauna chimney
    vanPrism(-19,-7,-5,5,46,48,dark);                // rain cap
        // Low-poly smoke drifts upward and slightly toward the rear of the van.
        smokePuff(-16,0,48,2.2,[.25,.27,.25]);
        smokePuff(-14,.8,51,3.1,[.31,.33,.31]);
        smokePuff(-11,1.5,55,4.1,[.38,.4,.37]);
        smokePuff(-7,2.4,60,4.8,[.45,.46,.42]);
        // A loose, irregular heap of split firewood sits beside the sauna body.
        const logColors = [[.42,.24,.11],[.54,.32,.16],[.63,.4,.2],[.34,.19,.09]];
        const logEnds = [[.22,.12,.055],[.3,.17,.08],[.38,.22,.1]];
        const firewoodPiece = (forward, side, height, length, width, thickness, color, endColor) => {
          vanPrism(forward-length/2,forward+length/2,side-width/2,side+width/2,height,height+thickness,color);
          quad(vanPoint(forward-length/2,side-width/2+.08,height),vanPoint(forward-length/2,side+width/2-.08,height),
               vanPoint(forward-length/2,side+width/2-.08,height+thickness),vanPoint(forward-length/2,side-width/2+.08,height+thickness),endColor);
          quad(vanPoint(forward+length/2,side+width/2-.08,height),vanPoint(forward+length/2,side-width/2+.08,height),
               vanPoint(forward+length/2,side-width/2+.08,height+thickness),vanPoint(forward+length/2,side+width/2-.08,height+thickness),endColor);
        };
        for (let layer = 0; layer < 5; layer++) {
          const pieces = 10 - layer;
          for (let piece = 0; piece < pieces; piece++) {
            const length = 3.5 + random() * 6.5;
            const width = 1.4 + random() * 1.1;
            const thickness = 1.4 + random() * 1.2;
            const forward = -7 + random() * 12 + (layer - 2) * .7;
            const side = -17 - random() * 7;
            const height = layer * 2.25 + random() * 1.1;
            firewoodPiece(forward,side,height,length,width,thickness,
              logColors[Math.floor(random() * logColors.length)],
              logEnds[Math.floor(random() * logEnds.length)]);
          }
        }
    // Cab windows, grille and lamps face the approaching driver.
    quad(vanPoint(32.08,-8,15),vanPoint(32.08,8,15),vanPoint(32.08,8,22),vanPoint(32.08,-8,22),glass);
    quad(vanPoint(34.08,-7,8),vanPoint(34.08,7,8),vanPoint(34.08,7,12),vanPoint(34.08,-7,12),dark);
    for (const side of [-1,1]) {
      const face = side * 10.12;
      quad(vanPoint(16,face,15),vanPoint(28,face,15),vanPoint(28,face,22),vanPoint(16,face,22),glass);
      quad(vanPoint(31.6,side*6.8,9),vanPoint(31.6,side*9,9),vanPoint(31.6,side*9,11.2),vanPoint(31.6,side*6.8,11.2),[.94,.9,.64]);
      // Narrow horizontal timber seams and the circular sauna emblem.
      const surface = side * 12.12;
      for (let height = 12; height < 34; height += 4.3) {
        quad(vanPoint(-32,surface,height),vanPoint(10,surface,height),vanPoint(10,surface,height+.45),vanPoint(-32,surface,height+.45),[.47,.33,.22]);
      }
      // Wavy painted grain gives the sauna wall the hand-painted look from the photo.
      for (let height = 13.4; height < 33; height += 4.3) {
        for (let forward = -31; forward < 10; forward += 4) {
          const wave = Math.sin((forward + height) * .34) * .75;
          const nextWave = Math.sin((forward + 4 + height) * .34) * .75;
          quad(vanPoint(forward,surface+.035,height+wave),vanPoint(forward+4,surface+.035,height+nextWave),
               vanPoint(forward+4,surface+.035,height+nextWave+.3),vanPoint(forward,surface+.035,height+wave+.3),[.34,.23,.16]);
        }
      }
           // Main mural field: the real van has a tall black banner framed by timber.
           const muralSide = surface + side * .07;
           quad(vanPoint(-23,muralSide,13),vanPoint(-4,muralSide,13),
             vanPoint(-5.5,muralSide,34),vanPoint(-21.5,muralSide,34),[.035,.045,.05]);
           quad(vanPoint(-23.4,muralSide+side*.02,13),vanPoint(-22.8,muralSide+side*.02,13),
             vanPoint(-21.2,muralSide+side*.02,34),vanPoint(-21.8,muralSide+side*.02,34),[.88,.84,.7]);
           quad(vanPoint(-4.6,muralSide+side*.02,13),vanPoint(-4,muralSide+side*.02,13),
             vanPoint(-5.6,muralSide+side*.02,34),vanPoint(-6.2,muralSide+side*.02,34),[.88,.84,.7]);
      const emblemSide = side * 12.24;
      const emblemCenter = vanPoint(-12,emblemSide,23);
      for (let segment = 0; segment < 16; segment++) {
        const a = segment * Math.PI / 8, b = (segment + 1) * Math.PI / 8;
        tri(emblemCenter,vanPoint(-12 + 8*Math.cos(a),emblemSide,23 + 8*Math.sin(a)),vanPoint(-12 + 8*Math.cos(b),emblemSide,23 + 8*Math.sin(b)),dark);
      }
        // A clearer seal silhouette keeps the mural readable at driving distance.
        for (let segment = 0; segment < 16; segment++) {
        const a = segment * Math.PI * 2 / 16, b = (segment + 1) * Math.PI * 2 / 16;
        tri(vanPoint(-10.5,emblemSide+side*.11,23),
          vanPoint(-10.5 + 3.6*Math.cos(a),emblemSide+side*.11,23 + 5.8*Math.sin(a)),
          vanPoint(-10.5 + 3.6*Math.cos(b),emblemSide+side*.11,23 + 5.8*Math.sin(b)),[.76,.78,.72]);
        }
        tri(vanPoint(-13.8,emblemSide+side*.12,27),vanPoint(-7.2,emblemSide+side*.12,27),
          vanPoint(-10.5,emblemSide+side*.12,31),[.12,.14,.14]);
        quad(vanPoint(-12.25,emblemSide+side*.13,24.2),vanPoint(-11.35,emblemSide+side*.13,24.2),
           vanPoint(-11.35,emblemSide+side*.13,25.2),vanPoint(-12.25,emblemSide+side*.13,25.2),[.015,.02,.018]);
        quad(vanPoint(-9.65,emblemSide+side*.13,24.2),vanPoint(-8.75,emblemSide+side*.13,24.2),
           vanPoint(-8.75,emblemSide+side*.13,25.2),vanPoint(-9.65,emblemSide+side*.13,25.2),[.015,.02,.018]);
        tri(vanPoint(-10.5,emblemSide+side*.14,22.8),vanPoint(-11.3,emblemSide+side*.14,22.1),
          vanPoint(-9.7,emblemSide+side*.14,22.1),[.12,.07,.05]);
       // K-ryhma sponsor tile: orange field with a simple white K mark.
       const sponsorSide = surface + side * .08;
       quad(vanPoint(-1,sponsorSide,14),vanPoint(8.5,sponsorSide,14),
         vanPoint(8.5,sponsorSide,23),vanPoint(-1,sponsorSide,23),[.9,.24,.06]);
       quad(vanPoint(.2,sponsorSide+side*.03,15.2),vanPoint(1.4,sponsorSide+side*.03,15.2),
         vanPoint(1.4,sponsorSide+side*.03,21.8),vanPoint(.2,sponsorSide+side*.03,21.8),[1, .92, .72]);
       quad(vanPoint(1.2,sponsorSide+side*.03,18.2),vanPoint(2.3,sponsorSide+side*.03,18.2),
         vanPoint(7.2,sponsorSide+side*.03,22),vanPoint(5.5,sponsorSide+side*.03,22),[1, .92, .72]);
       quad(vanPoint(1.2,sponsorSide+side*.03,18),vanPoint(2.3,sponsorSide+side*.03,18),
         vanPoint(7.2,sponsorSide+side*.03,15),vanPoint(5.5,sponsorSide+side*.03,15),[1, .92, .72]);
       // Narrow cream marks suggest the vertical lettering around the mural.
       for (let mark = 0; mark < 5; mark++) {
         const markForward = -20.2 + mark * 3.1;
         quad(vanPoint(markForward,muralSide+side*.08,29.8),vanPoint(markForward+1.15,muralSide+side*.08,29.8),
           vanPoint(markForward+1.15,muralSide+side*.08,30.35),vanPoint(markForward,muralSide+side*.08,30.35),[.92,.88,.75]);
         quad(vanPoint(markForward,muralSide+side*.08,16),vanPoint(markForward+1.15,muralSide+side*.08,16),
           vanPoint(markForward+1.15,muralSide+side*.08,16.55),vanPoint(markForward,muralSide+side*.08,16.55),[.92,.88,.75]);
       }
       // Sponsor stickers run along the lower edge of the mural.
       const sponsorColors = [[.94,.91,.78],[.82,.86,.82],[.94,.94,.88],[.7,.82,.77]];
       for (let sticker = 0; sticker < 4; sticker++) {
         const stickerForward = -22 + sticker * 4.1;
         quad(vanPoint(stickerForward,surface+side*.1,9.2),vanPoint(stickerForward+3.5,surface+side*.1,9.2),
           vanPoint(stickerForward+3.5,surface+side*.1,12.1),vanPoint(stickerForward,surface+side*.1,12.1),sponsorColors[sticker]);
         quad(vanPoint(stickerForward+.45,surface+side*.12,10),vanPoint(stickerForward+2.9,surface+side*.12,10),
           vanPoint(stickerForward+2.9,surface+side*.12,10.35),vanPoint(stickerForward+.45,surface+side*.12,10.35),[.16,.22,.21]);
         quad(vanPoint(stickerForward+.7,surface+side*.12,10.7),vanPoint(stickerForward+2.3,surface+side*.12,10.7),
           vanPoint(stickerForward+2.3,surface+side*.12,11),vanPoint(stickerForward+.7,surface+side*.12,11),[.5,.18,.08]);
       }
      // Small colored marks echo the blue drops and bright painted accents.
      tri(vanPoint(-28,surface+.06,30),vanPoint(-29.5,surface+.06,25),vanPoint(-26.5,surface+.06,25),[.08,.43,.58]);
      tri(vanPoint(2,surface+.06,31),vanPoint(.5,surface+.06,26),vanPoint(3.5,surface+.06,26),[.08,.43,.58]);
      tri(vanPoint(-24,surface+.06,17),vanPoint(-19,surface+.06,17),vanPoint(-21.5,surface+.06,24),[.1,.48,.2]);
      // Blue drops and orange patches recall the photo's painted sauna box.
      for (const f of [-29,4]) {
        tri(vanPoint(f,surface+.02,28),vanPoint(f-1.5,surface+.02,24),vanPoint(f+1.5,surface+.02,24),[.09,.49,.66]);
      }
      vanPrism(-31,-27,side*12.16,side*12.3,14,19,[.88,.36,.1]);
    }
    // Four wheels touch the grass; sidewall circles and hubs keep them readable.
    for (const axle of [-22,22]) for (const side of [-1,1]) {
      const outer = side * 13.2, inner = side * 10.3;
      const wheelCenter = vanPoint(axle,outer,4.7);
      for (let segment = 0; segment < 16; segment++) {
        const a = segment * Math.PI / 8, b = (segment + 1) * Math.PI / 8;
        const rimA = vanPoint(axle + 4.6*Math.cos(a),outer,4.7 + 4.6*Math.sin(a));
        const rimB = vanPoint(axle + 4.6*Math.cos(b),outer,4.7 + 4.6*Math.sin(b));
        tri(wheelCenter,rimA,rimB,dark);
        quad(vanPoint(axle+4.6*Math.cos(a),inner,4.7+4.6*Math.sin(a)),
             vanPoint(axle+4.6*Math.cos(b),inner,4.7+4.6*Math.sin(b)),rimB,rimA,[.07,.075,.075]);
        tri(vanPoint(axle,side*13.28,4.7),
            vanPoint(axle+2*Math.cos(a),side*13.28,4.7+2*Math.sin(a)),
            vanPoint(axle+2*Math.cos(b),side*13.28,4.7+2*Math.sin(b)),steel);
      }
    }

    this.vertexCount = data.length / 6;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    this.bindMesh(this.buffer);
  }

  bindMesh(buffer) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(this.locations.position);
    gl.enableVertexAttribArray(this.locations.color);
    gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(this.locations.color, 3, gl.FLOAT, false, 24, 12);
  }

  drawWheels(car, now) {
    const gl = this.gl;
    const vertices = [];
    const vertex = (p, color) => vertices.push(p[0],p[1],p[2],color[0],color[1],color[2]);
    const triangle = (a,b,c,color) => { vertex(a,color);vertex(b,color);vertex(c,color); };
    const quad = (a,b,c,d,color) => { triangle(a,b,c,color);triangle(a,c,d,color); };
    const bodyForward = [Math.cos(car.angle),Math.sin(car.angle)];
    const bodyRight = [-bodyForward[1],bodyForward[0]];
    const steeredAngle = car.angle + (car.steerAngle || 0);
    const wheelForward = [Math.cos(steeredAngle),Math.sin(steeredAngle)];
    const axleDirection = [-wheelForward[1],wheelForward[0]];
    const radius = 2.3;
    const segments = 28;
    const tyreBlack = [.075,.085,.09];
    const sidewall = [.11,.12,.125];
    const rim = [.38,.42,.43];
    const blue = [.06,.42,.62];
    if (this.lastWheelFrame) this.wheelPhase += Math.min((now-this.lastWheelFrame)/1000,.05) * (car.vx || 0) / .23;
    this.lastWheelFrame = now;

    const rod = (a,b,width,color) => {
      const dx=b[0]-a[0], dz=b[2]-a[2];
      const len=Math.max(.001,Math.hypot(dx,dz));
      const nx=-dz/len*width, nz=dx/len*width;
      const leftA=[a[0]+nx,a[1],a[2]+nz],rightA=[a[0]-nx,a[1],a[2]-nz];
      const leftB=[b[0]+nx,b[1],b[2]+nz],rightB=[b[0]-nx,b[1],b[2]-nz];
      quad(leftA,leftB,rightB,rightA,color);
      quad([leftA[0],leftA[1]+width,leftA[2]],[leftB[0],leftB[1]+width,leftB[2]],leftB,leftA,color.map(v=>v*.8));
    };
    const bodyPoint=(forward,side,height)=>[
      car.x+bodyForward[0]*forward+bodyRight[0]*side,
      height,
      car.y+bodyForward[1]*forward+bodyRight[1]*side
    ];

    // Make the suspension pickup points visibly part of the open chassis.
    const chassisColor = [.055,.20,.25];
    rod(bodyPoint(1.0,-2.4,1.5),bodyPoint(1.0,2.4,1.5),.22,chassisColor);
    rod(bodyPoint(3.4,-2.4,1.5),bodyPoint(3.4,2.4,1.5),.22,chassisColor);
    rod(bodyPoint(1.8,-2.4,3.5),bodyPoint(1.8,2.4,3.5),.18,chassisColor);
    rod(bodyPoint(4.0,-2.4,3.5),bodyPoint(4.0,2.4,3.5),.18,chassisColor);

        // Open Formula Student bodywork: a silver nose, exposed cockpit and blue roll hoop.
        const aluminium = [.56,.6,.58];
        const aluminiumShade = [.38,.42,.41];
        const cockpitBlack = [.025,.045,.05];
        quad(bodyPoint(10.2,-2.1,2.35),bodyPoint(10.2,2.1,2.35),
          bodyPoint(3.0,2.75,1.55),bodyPoint(3.0,-2.75,1.55),aluminium);
        quad(bodyPoint(10.2,2.1,2.35),bodyPoint(10.2,4.35,1.45),
          bodyPoint(3.0,3.0,1.15),bodyPoint(3.0,2.75,1.55),aluminiumShade);
        quad(bodyPoint(10.2,-4.35,1.45),bodyPoint(10.2,-2.1,2.35),
          bodyPoint(3.0,-2.75,1.55),bodyPoint(3.0,-3.0,1.15),aluminiumShade);
        quad(bodyPoint(3.0,-2.75,1.55),bodyPoint(3.0,2.75,1.55),
          bodyPoint(-1.2,2.7,2.45),bodyPoint(-1.2,-2.7,2.45),cockpitBlack);
        quad(bodyPoint(3.0,-3.0,1.15),bodyPoint(3.0,3.0,1.15),
          bodyPoint(-1.2,3.25,1.2),bodyPoint(-1.2,-3.25,1.2),aluminiumShade);

        const upright = (a,b,width,color) => {
       quad([a[0]-width,a[1],a[2]],[a[0]+width,a[1],a[2]],
         [b[0]+width,b[1],b[2]],[b[0]-width,b[1],b[2]],color);
       quad([a[0],a[1],a[2]-width],[a[0],a[1],a[2]+width],
         [b[0],b[1],b[2]+width],[b[0],b[1],b[2]-width],color.map(value => value * .78));
        };
        const rollHoop = [.04,.3,.48];
        upright(bodyPoint(-9.4,-2.7,2.3),bodyPoint(-8.6,-3.25,10.5),.24,rollHoop);
        upright(bodyPoint(-9.4,2.7,2.3),bodyPoint(-8.6,3.25,10.5),.24,rollHoop);
        rod(bodyPoint(-8.6,-3.25,10.5),bodyPoint(-8.6,3.25,10.5),.24,rollHoop);

    for (const side of [-1,1]) {
      const center=bodyPoint(8.1,side*7.2,radius+.07);
      const point=(axial,rad,theta)=>[
        center[0]+axleDirection[0]*axial+wheelForward[0]*rad*Math.cos(theta),
        center[1]+rad*Math.sin(theta),
        center[2]+axleDirection[1]*axial+wheelForward[1]*rad*Math.cos(theta)
      ];
      const shadowCenter=bodyPoint(8.1,side*7.2,.16);
      for (let i=0;i<segments;i++) {
        const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
        const shadowPoint=angle=>[
          shadowCenter[0]+wheelForward[0]*2.5*Math.cos(angle)+axleDirection[0]*1.55*Math.sin(angle),
          shadowCenter[1],
          shadowCenter[2]+wheelForward[1]*2.5*Math.cos(angle)+axleDirection[1]*1.55*Math.sin(angle)
        ];
        triangle(shadowCenter,shadowPoint(a),shadowPoint(b),[.065,.075,.075]);
      }
      // Double wishbone and steering link, anchored at the narrow chassis.
      rod(bodyPoint(1.0,side*2.4,1.5),bodyPoint(8.1,side*6.0,1.7),.17,blue);
      rod(bodyPoint(3.4,side*2.4,1.5),bodyPoint(8.1,side*6.0,1.7),.17,blue);
      rod(bodyPoint(1.8,side*2.4,3.5),bodyPoint(8.1,side*6.0,3.1),.15,[.13,.16,.18]);
      rod(bodyPoint(4.0,side*2.4,3.5),bodyPoint(8.1,side*6.0,3.1),.15,[.13,.16,.18]);
      rod(bodyPoint(5.2,side*2.2,2.2),bodyPoint(8.1,side*6.0,2.2),.11,[.36,.38,.37]);

      for (let i=0;i<segments;i++) {
        const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
        const treadShade=i%7===0?[.10,.11,.115]:tyreBlack;
        quad(point(-.78,radius,a),point(.78,radius,a),point(.78,radius,b),point(-.78,radius,b),treadShade);
        quad(point(-1.1,2.08,a),point(-.78,radius,a),point(-.78,radius,b),point(-1.1,2.08,b),[.065,.075,.08]);
        quad(point(.78,radius,a),point(1.1,2.08,a),point(1.1,2.08,b),point(.78,radius,b),[.065,.075,.08]);
        for (const face of [-1.12,1.12]) {
          quad(point(face,2.08,a),point(face,2.08,b),point(face,1.12,b),point(face,1.12,a),sidewall);
          quad(point(face+Math.sign(face)*.025,1.70,a),point(face+Math.sign(face)*.025,1.70,b),point(face+Math.sign(face)*.025,1.64,b),point(face+Math.sign(face)*.025,1.64,a),[.27,.29,.29]);
          triangle(point(face,0,a),point(face,1.08,a),point(face,1.08,b),rim);
        }
      }
      for (const face of [-1.16,1.16]) {
        for (let spoke=0;spoke<6;spoke++) {
          const angle=this.wheelPhase+spoke*Math.PI/3;
          quad(point(face,.25,angle-.15),point(face,1.0,angle-.10),point(face,1.0,angle+.10),point(face,.25,angle+.15),[.68,.72,.70]);
        }
        for (let i=0;i<segments;i++) {
          const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
          triangle(point(face+Math.sign(face)*.03,0,a),point(face+Math.sign(face)*.03,.28,a),point(face+Math.sign(face)*.03,.28,b),[.10,.13,.14]);
        }
      }
    }

    this.bindMesh(this.wheelBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES,0,vertices.length/6);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const ratio = Math.min(window.devicePixelRatio || 1, this.width < 650 ? 1.5 : 2);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.cockpitCanvas.width = this.canvas.width;
    this.cockpitCanvas.height = this.canvas.height;
    this.cockpit.setTransform(ratio,0,0,ratio,0,0);
    this.gl.viewport(0,0,this.canvas.width,this.canvas.height);
  }

  render(car, now = 0) {
    const gl = this.gl;
    const angle = car.angle;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const bump = car.offroad ? Math.sin(now * .06) * .017 : 0;
    const pitch = .055 - (car.longitudinalG || 0) * .014 + bump;
    const roll = Math.max(-.04, Math.min(.04, (car.lateralG || 0) * .015));
    const sideShift = Math.max(-.8, Math.min(.8, (car.lateralG || 0) * .5));
    const cameraX = car.x - cos * 8 - sin * sideShift;
    const cameraZ = car.y - sin * 8 + cos * sideShift;
    const right = [-sin,0,cos];
    const up = [cos*Math.sin(pitch),Math.cos(pitch),sin*Math.sin(pitch)];
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    this.bindMesh(this.buffer);
    gl.uniform3f(this.locations.camera,cameraX,8 + Math.abs(bump) * 20,cameraZ);
    gl.uniform3f(this.locations.forward,cos*Math.cos(pitch),-Math.sin(pitch),sin*Math.cos(pitch));
    gl.uniform3f(this.locations.right,right[0]*Math.cos(roll)+up[0]*Math.sin(roll),right[1]*Math.cos(roll)+up[1]*Math.sin(roll),right[2]*Math.cos(roll)+up[2]*Math.sin(roll));
    gl.uniform3f(this.locations.up,up[0]*Math.cos(roll)-right[0]*Math.sin(roll),up[1]*Math.cos(roll)-right[1]*Math.sin(roll),up[2]*Math.cos(roll)-right[2]*Math.sin(roll));
    gl.uniform1f(this.locations.aspect,this.width / this.height);
    const verticalFov = this.width < 650 ? 84 : 72;
    gl.uniform1f(this.locations.focal,1 / Math.tan(verticalFov * Math.PI / 360));
    gl.drawArrays(gl.TRIANGLES,0,this.vertexCount);
    this.drawWheels(car,now);
    this.drawCockpit(car);
  }

  drawCockpit(car) {
    const ctx = this.cockpit;
    const w = this.width, h = this.height;
    ctx.clearRect(0,0,w,h);
    const gradient = ctx.createLinearGradient(0,h*.68,0,h);
    gradient.addColorStop(0,'#07120b00');
    gradient.addColorStop(1,'#050b0afb');
    ctx.fillStyle = gradient;
    ctx.fillRect(0,h*.68,w,h*.32);
    // The photo shows an open chassis with blue tubing and dark body panels.
    ctx.beginPath();
    ctx.moveTo(w*.25,h);ctx.lineTo(w*.36,h*.83);ctx.lineTo(w*.45,h*.80);
    ctx.lineTo(w*.55,h*.80);ctx.lineTo(w*.64,h*.83);ctx.lineTo(w*.75,h);
    ctx.closePath();ctx.fillStyle='#151d1d';ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w*.42,h*.83);ctx.lineTo(w*.48,h*.80);ctx.lineTo(w*.52,h*.80);ctx.lineTo(w*.58,h*.83);
    ctx.lineTo(w*.56,h);ctx.lineTo(w*.44,h);ctx.closePath();
    ctx.fillStyle='#242d2c';ctx.fill();
    const tube = (x1,y1,x2,y2,width) => {
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);
      ctx.lineCap='round';ctx.strokeStyle='#064569';ctx.lineWidth=width+3;ctx.stroke();
      ctx.strokeStyle='#167db2';ctx.lineWidth=width;ctx.stroke();
      ctx.strokeStyle='#73b9d2';ctx.lineWidth=Math.max(1,width*.18);ctx.stroke();
    };
    tube(w*.18,h*.98,w*.34,h*.78,Math.max(5,w*.008));
    tube(w*.82,h*.98,w*.66,h*.78,Math.max(5,w*.008));
    tube(w*.34,h*.78,w*.46,h*.86,Math.max(4,w*.006));
    tube(w*.66,h*.78,w*.54,h*.86,Math.max(4,w*.006));
    tube(w*.19,h*.98,w*.37,h*.92,Math.max(4,w*.006));
    tube(w*.81,h*.98,w*.63,h*.92,Math.max(4,w*.006));
    // Steering wheel turns visibly with the active input.
    ctx.save();
    ctx.translate(w*.5,h*1.015);
    ctx.rotate((car.steer || 0) * .52);
    const radius = Math.min(w*.155,h*.20);
    ctx.strokeStyle = '#08100f';ctx.lineWidth = Math.max(20,radius*.19);
    ctx.beginPath();ctx.ellipse(0,0,radius,radius*.8,0,Math.PI,Math.PI*2);ctx.stroke();
    ctx.strokeStyle = '#374c42';ctx.lineWidth = Math.max(4,radius*.035);
    ctx.beginPath();ctx.ellipse(0,0,radius,radius*.8,0,Math.PI,Math.PI*2);ctx.stroke();
    ctx.fillStyle = '#111b18';ctx.fillRect(-radius*.7,-radius*.08,radius*1.4,radius*.2);
    ctx.beginPath();ctx.arc(0,0,radius*.32,0,Math.PI*2);ctx.fillStyle='#0bc78a';ctx.fill();
    ctx.fillStyle='#ffffff';ctx.font=`900 ${Math.max(12,radius*.2)}px Arial`;ctx.textAlign='center';ctx.fillText('LPR',0,radius*.07);
    ctx.restore();
  }
};
