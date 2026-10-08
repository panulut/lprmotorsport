const rendererText = text => window.LPRI18n?.t(text) ?? text;
/* Small dependency-free WebGL renderer for the driver view. World X/Y become 3D X/Z. */
window.LPRRenderer3D = class LPRRenderer3D {
  constructor(canvas, cockpitCanvas, track) {
    this.canvas = canvas;
    this.cockpitCanvas = cockpitCanvas;
    this.cockpit = cockpitCanvas.getContext('2d');
    this.gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!this.gl) throw new Error(rendererText("WebGL ei ole k\u00e4ytett\u00e4viss\u00e4 t\u00e4ss\u00e4 selaimessa."));
    this.track = track;
    this.width = 0;
    this.height = 0;
    this.makeProgram();
    this.makeWorld();
    this.wheelBuffer = this.gl.createBuffer();
    this.saunaPropBuffer = this.gl.createBuffer();
    this.saunaGuestBuffer = this.gl.createBuffer();
    this.spectatorBuffer = this.gl.createBuffer();
    this.wheelPhase = 0;
    this.lastWheelFrame = 0;
  }

  makeProgram() {
    const gl = this.gl;
    const vertexSource = `
      attribute vec3 aPosition;
      attribute vec3 aColor;
      attribute vec2 aUV;
      uniform vec3 uCamera;
      uniform vec3 uForward;
      uniform vec3 uRight;
      uniform vec3 uUp;
      uniform float uAspect;
      uniform float uFocal;
      varying vec3 vColor;
      varying float vDepth;
      varying vec2 vUV;
      void main() {
        vec3 relative = aPosition - uCamera;
        float depth = dot(relative, uForward);
        float clipZ = depth * 1.0010005 - 2.0010005;
        gl_Position = vec4(dot(relative, uRight) * uFocal / uAspect,
                           dot(relative, uUp) * uFocal, clipZ, depth);
        vColor = aColor;
        vDepth = depth;
        vUV = aUV;
      }
    `;
    const fragmentSource = `
      precision mediump float;
      varying vec3 vColor;
      varying float vDepth;
      varying vec2 vUV;
      uniform sampler2D uTexture;
      uniform bool uTextured;
      void main() {
        vec3 color = vColor;
        if (uTextured) {
          vec4 artwork = texture2D(uTexture, vUV);
          if (artwork.a < 0.1 || min(min(artwork.r, artwork.g), artwork.b) > 0.96) discard;
          color = artwork.rgb;
        }
        vec3 sky = vec3(0.59, 0.76, 0.74);
        float fog = clamp((vDepth - 320.0) / 1000.0, 0.0, 0.83);
        gl_FragColor = vec4(mix(color, sky, fog), 1.0);
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
      uv: gl.getAttribLocation(program, 'aUV'),
      textured: gl.getUniformLocation(program, 'uTextured'),
      texture: gl.getUniformLocation(program, 'uTexture'),
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
    quad([-2200,-.4,-2200],[6500,-.4,-2200],[6500,-.4,6500],[-2200,-.4,6500],[.095,.235,.155]);
    window.LPRCampus.build({ box, quad });
    if(window.LPRSale) {
      window.LPRSale.buildExterior({box,quad});
      const interiorStart=data.length;
      const productFaces = {};
      window.LPRSale.buildInterior({box,quad,productFace:(id,points)=>{
        const vertices=productFaces[id] ||= [];
        const uv=[[0,1],[1,1],[1,0],[0,0]];
        for(const i of [0,1,2,0,2,3]) vertices.push(...points[i],1,1,1,...uv[i]);
      }});
      const interior=new Float32Array(data.splice(interiorStart));
      this.saleVertexCount=interior.length/6;
      this.saleBuffer=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,this.saleBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,interior,gl.STATIC_DRAW);
      this.makeSaleProducts(productFaces);
    }
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
        if (window.LPRCampus.occupied(x,z) || (x > 2850 && z < 1200)) continue;
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

    // Tervahaudanpuisto: the truck, tub and their crowd share this world frame.
    const site = window.LPRCampus.saunaSite;
    const stop = [site.x,0,site.y];
    this.saunaStop = { x: stop[0], y: stop[2] };
    const travelAngle = Math.PI / 4;
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
    vanPrism(-33.2,-33.05,1,7,8,28,[.3,.19,.11]);    // rear entrance
    vanPrism(-33.35,-33.2,1.7,2.1,17,18,steel);
    for (let step=0;step<4;step++) {
      vanPrism(-43+step*2,-41+step*2,.5,7.5,0,(step+1)*2,[.48,.34,.23]);
    }
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

    // Floor plan reference: rear benches on both sides of a central aisle;
    // a lower central walkway, steps to that level and rails at the front;
    // stove front-left, entrance front-right.
    box(2000,0,0,44,1,28,[.42,.27,.14]);
    box(2000,26,0,44,1,28,[.35,.22,.12]);
    for (let height=1;height<26;height+=2) {
      const timber = height%4===1 ? [.63,.40,.22] : [.56,.34,.18];
      box(1978,height,0,1,1.9,28,timber);
      box(2022,height,0,1,1.9,28,timber);
      box(2000,height,-14,44,1.9,1,timber);
      box(1994.5,height,14,33,1.9,1,timber);
      box(2021,height,14,2,1.9,1,timber);
      if (height >= 21) box(2015.5,height,14,9,1.9,1,timber);
    }
    const benchWood = [.79,.56,.32], railWood = [.66,.44,.24];
    for (const side of [-1,1]) {
      // Two long upper benches flank the lower walking bench.
      for (const x of [1981,2003]) {
        for (const z of [side*5,side*12]) box(x,1,z,1,7,1,railWood);
      }
      for (let z=4.5;z<13;z+=1.5) box(1992,8,side*z,27,1,1.35,benchWood);
      // Guard rails separate the benches from the stove / entrance area.
      for (const z of [side*4.5,side*12]) box(2006,9,z,.8,6,.8,railWood);
      box(2006,15,side*8.25,1,1,8.5,benchWood);
      box(2006,11.5,side*8.25,.7,.7,8.5,railWood);
    }
    // The central lower bench reaches the rear wall. Its top is well below
    // the upper seats (4.5 versus 9), and the stairs end at this lower level.
    const lowerBenchTop = 4.5;
    for (const x of [1981,1992,2003]) {
      for (const z of [-3,3]) box(x,1,z,.8,lowerBenchTop-1.6,.8,railWood);
    }
    for (let z=-3.75;z<=3.75;z+=1.5) {
      box(1992,lowerBenchTop-.6,z,27,.6,1.35,benchWood);
    }
    for (let step=0;step<3;step++) {
      box(2011.25-step*2.3,1,0,2.3,(step+1)*(lowerBenchTop-1)/3,8.85,benchWood);
    }
    // Seated adult sauna guests. Rounded low-poly forms match the world style.
    const oval = (x,y,z,rx,ry,rz,color) => {
      const point = (latitude,longitude) => [x+rx*Math.cos(latitude)*Math.cos(longitude),
        y+ry*Math.sin(latitude),z+rz*Math.cos(latitude)*Math.sin(longitude)];
      for (let ring=0;ring<6;ring++) {
        const a=-Math.PI/2+ring*Math.PI/6, b=a+Math.PI/6;
        for (let segment=0;segment<10;segment++) {
          const c=segment*Math.PI/5, d=c+Math.PI/5;
          quad(point(a,c),point(a,d),point(b,d),point(b,c),color.map(v=>v*(.83+.17*Math.sin(b))));
        }
      }
    };
    const skinTones = [[.94,.73,.59],[.77,.52,.34],[.88,.66,.45],[.53,.33,.22],[.97,.81,.69],[.69,.44,.29]];
    const swimColors = [[.08,.36,.68],[.83,.16,.18],[.06,.50,.40],[.63,.22,.63],[.95,.50,.08]];
    const hairColors = [[.12,.08,.05],[.04,.04,.04],[.52,.34,.12],[.24,.12,.06]];
    // Wood-fired hot tub in front of the cab, clear of the road and rear entrance.
    const tubForward=57, tubSide=0, tubRadius=14, tubInner=12.6;
    const tubPoint=(angle,radius,height)=>vanPoint(tubForward+Math.cos(angle)*radius,
      tubSide+Math.sin(angle)*radius,height);
    for (let segment=0;segment<32;segment++) {
      const a=segment*Math.PI/16,b=(segment+1)*Math.PI/16;
      const stave=segment%2 ? [.57,.36,.19] : [.67,.44,.25];
      quad(tubPoint(a,tubRadius,0),tubPoint(b,tubRadius,0),
        tubPoint(b,tubRadius,10),tubPoint(a,tubRadius,10),stave);
      quad(tubPoint(a,tubInner,1),tubPoint(a,tubInner,10),
        tubPoint(b,tubInner,10),tubPoint(b,tubInner,1),[.43,.28,.16]);
      quad(tubPoint(a,tubInner,10),tubPoint(a,tubRadius,10),
        tubPoint(b,tubRadius,10),tubPoint(b,tubInner,10),[.79,.57,.34]);
      for (const height of [2,7.7]) {
        quad(tubPoint(a,tubRadius+.08,height),tubPoint(b,tubRadius+.08,height),
          tubPoint(b,tubRadius+.08,height+.55),tubPoint(a,tubRadius+.08,height+.55),steel);
      }
      tri(vanPoint(tubForward,tubSide,8.5),tubPoint(a,tubInner,8.5),
        tubPoint(b,tubInner,8.5),segment%3 ? [.12,.47,.54] : [.17,.54,.59]);
    }
    // External heater, connecting pipes, firebox and its own smoking chimney.
    const heaterPrism=(front,back,left,right,bottom,top,color)=>vanPrism(
      tubForward+front,tubForward+back,tubSide+left,tubSide+right,bottom,top,color);
    heaterPrism(17,24,-4,4,0,9,dark);
    heaterPrism(24.02,24.12,-2.8,2.8,1.5,6.5,steel);
    heaterPrism(24.13,24.2,-2,2,2.2,5.5,[.23,.09,.025]);
    heaterPrism(24.21,24.24,-1.5,1.5,2.4,3.8,[1,.38,.035]);
    for (const height of [2.5,6.5]) heaterPrism(13,18,-1,1,height,height+1,steel);
    heaterPrism(18.5,20.5,-1,1,9,27,steel);
    heaterPrism(17.5,21.5,-2,2,27,27.6,dark);
    smokePuff(tubForward+19.5,tubSide,28,1.5,[.32,.34,.33]);
    smokePuff(tubForward+20.5,tubSide+.5,31,2.2,[.4,.42,.4]);
    smokePuff(tubForward+22,tubSide+1.3,35,3,[.48,.5,.47]);
    smokePuff(tubForward+24,tubSide+2.2,40,3.9,[.56,.57,.53]);
    // Five seated students face the centre; the water conceals their lower bodies.
    for (let guest=0;guest<5;guest++) {
      const angle=guest*Math.PI*2/5+.3, skin=skinTones[guest];
      const radial=[Math.cos(angle),Math.sin(angle)], tangent=[-radial[1],radial[0]];
      const guestPoint=(across,inward,height)=>vanPoint(
        tubForward+radial[0]*(9-inward)+tangent[0]*across,
        tubSide+radial[1]*(9-inward)+tangent[1]*across,height);
      oval(...guestPoint(0,0,9.8),2.1,2.6,1.8,skin);
      oval(...guestPoint(0,0,12.2),.65,.7,.65,skin);
      oval(...guestPoint(0,0,14),1.45,1.7,1.4,skin);
      oval(...guestPoint(0,0,15.4),1.5,.45,1.45,hairColors[guest%4]);
      // White student cap, black band, visor, gold cockade and dark tassel.
      oval(...guestPoint(0,0,15.65),1.65,.22,1.58,dark);
      oval(...guestPoint(0,0,16.1),1.75,.55,1.65,[.98,.98,.94]);
      oval(...guestPoint(0,1.35,15.6),1,.12,.6,dark);
      oval(...guestPoint(0,1.48,15.85),.22,.22,.22,[.95,.73,.2]);
      oval(...guestPoint(1.6,-.15,14.8),.12,.85,.12,dark);
      oval(...guestPoint(1.6,-.15,14),.25,.4,.25,dark);
      for (const side of [-1,1]) {
        oval(...guestPoint(side*.48,1.31,14.15),.14,.16,.14,dark);
        oval(...guestPoint(side*2.15,.25,10.4),.65,1.25,.65,skin);
        oval(...guestPoint(side*2.5,1.25,9.5),.55,.5,1.2,skin);
      }
    }
    // Trackside students stay outside the shoulder, leaving the cab and door accessible.
    const overallColors = [[1,.36,.035],[1,.94,.025],[.86,.055,.08],[.055,.63,.22]];
    const patchColors = [[.96,.96,.85],[.08,.19,.47],[.94,.24,.56],[.08,.08,.09],[.12,.74,.87]];
    this.spectatorFrame = { stop, forwardX, forwardZ, rightX, rightZ };
    this.spectatorMeshes = [];
    const crowdPositions = [[-48,-30],[-27,-35],[-16,-29],[4,-35],[18,-30],[39,-23],
      [-46,15],[-23,23],[-7,26],[10,20],[-49,-16],[-42,29]];
    // Reuse the animated student meshes for a second group at Wappunotski.
    const fire = window.LPRCampus.bonfireSite;
    const fireDX=fire.x-stop[0], fireDZ=fire.y-stop[2];
    const fireForward=fireDX*forwardX+fireDZ*forwardZ;
    const fireSide=fireDX*rightX+fireDZ*rightZ;
    for(let i=0;i<10;i++) {
      const angle=i*Math.PI*2/10;
      crowdPositions.push([fireForward+Math.cos(angle)*32,fireSide+Math.sin(angle)*32]);
    }
    this.spectatorCount = crowdPositions.length;
    for (let index = 0; index < this.spectatorCount; index++) {
      const meshStart = data.length;
      const armRanges = [];
      const [forward, side] = crowdPositions[index];
      const towel = [2,6,8,10].includes(index);
      const activity = index === 10 || index === 11 ? 'walk' : index % 3 === 0 ? 'cheer' : index % 3 === 1 ? 'drink' : 'relax';
      const height = .94 + (index % 3) * .045;
      const suit = overallColors[index % overallColors.length];
      const skin = skinTones[index % skinTones.length];
      const personPoint = (x,y,z) => vanPoint(forward+x,side+z,y*height);
      const part = (x,y,z,sx,sy,sz,color) => {
        vanPrism(forward+x-sx/2,forward+x+sx/2,side+z-sz/2,side+z+sz/2,
          y*height,(y+sy)*height,color);
      };
      // Full overalls: separate trouser legs, sleeves, bib, straps and zipper.
      for (const leg of [-1,1]) {
        part(leg*.95,.35,0,1.55,7.4,1.9,towel ? skin : suit);
        part(leg*.95,.1,-.45,1.7,.9,2.8,dark);
        const armStart = data.length-meshStart;
        part(leg*2.45,10.8,0,1.25,2.4,1.8,towel ? skin : suit);
        armRanges.push([armStart,data.length-meshStart,leg,false]);
        const forearmStart = data.length-meshStart;
        part(leg*2.45,8.4,0,1.25,2.4,1.8,towel ? skin : suit);
        const hand = personPoint(leg*2.45,8.1,-.12);
        oval(...hand,.68,.85,.65,skin);
        armRanges.push([forearmStart,data.length-meshStart,leg,true]);
        if (!towel) part(leg*1.15,11.5,-1.2,.5,2.4,.14,suit.map(v=>v*.7));
      }
      part(0,7.6,0,3.8,5.9,2.4,towel ? skin : suit);
      if (towel) {
        part(0,4.5,0,4.05,6,2.65,[.83,.9,.94]);
        part(.9,4.5,-1.36,.24,6,.1,[.32,.57,.69]);
        part(0,9.9,0,4.12,.5,2.72,[.94,.96,.98]);
      } else {
        part(0,8,-1.24,.13,4.8,.12,steel);
        part(0,7.6,-1.25,3.8,.35,.14,suit.map(v=>v*.65));
      }
      if (activity === 'drink') {
        const cupStart = data.length-meshStart;
        part(2.45,8.55,-.65,.9,1.6,.9,[.88,.67,.18]);
        part(2.45,10.15,-.65,.94,.12,.94,steel);
        armRanges.push([cupStart,data.length-meshStart,1,true]);
      }
      part(0,13.5,0,1.2,.7,1.2,skin);
      const head = personPoint(0,15.1,0);
      oval(...head,1.45,1.75*height,1.35,skin);
      for (const eye of [-1,1]) part(eye*.48,15.25,-1.29,.22,.24,.12,dark);
      // White crown, black band and visor, gold cockade and hanging black tassel.
      const crown = personPoint(0,16.85,0);
      oval(...crown,1.75,.65*height,1.55,[.98,.98,.94]);
      part(0,16.35,0,3.05,.42,2.65,dark);
      part(0,16.32,-1.5,2.3,.2,1.25,dark);
      part(0,16.47,-1.36,.38,.34,.12,[.95,.73,.2]);
      part(1.85,14.75,.15,.16,2.05,.16,dark);
      const tassel = personPoint(1.85,14.45,.15);
      oval(...tassel,.37,.68*height,.37,dark);
      // Everyone has badges; seasoned students have many more, on both sides.
      const patchCount = towel ? 0 : [3,7,12,5,15,9][index % 6];
      for (let patch = 0; patch < patchCount; patch++) {
        const leg = patch % 2 ? 1 : -1;
        const row = Math.floor(patch / 2);
        const y = row < 5 ? 1.5 + row*1.12 : 9 + (row-5)*1.25;
        const x = row < 5 ? leg*.95 : leg*.9;
        const color = patchColors[(patch+index) % patchColors.length];
        for (const face of [-1,1]) {
          const z = face*(row < 5 ? .97 : 1.23);
          part(x,y,z,.82,.67,.09,color);
          part(x,y+.27,z+face*.055,.5,.12,.035,patchColors[(patch+index+2)%patchColors.length]);
        }
      }
      const mesh = new Float32Array(data.splice(meshStart));
      // Keep local coordinates so limbs and the whole person can move independently.
      for (let v = 0; v < mesh.length; v += 6) {
        const dx = mesh[v]-stop[0], dz = mesh[v+2]-stop[2];
        mesh[v] = dx*forwardX+dz*forwardZ-forward;
        mesh[v+2] = dx*rightX+dz*rightZ-side;
      }
      this.spectatorMeshes.push({ data: mesh, forward, side, activity, height, armRanges });
    }
    let guestIndex = 0;
    this.saunaGuestMeshes = [];
    for (const side of [-1,1]) {
      for (const x of [1981,1986,1991,1996,2001]) {
        // Reserve facing seats on both benches for the player to switch sides.
        if (x === 1986) continue;
        const index=guestIndex++, skin=skinTones[index%skinTones.length];
        const meshStart=data.length, legRanges=[];
        const swim=swimColors[index%swimColors.length], hair=hairColors[index%hairColors.length];
        const z=side*8, front=z-side*1.3, suit=index%3===1;
        const torsoTop=14.5+(index%3)*.25;
        // Swimsuit or trunks cover the body; bent legs rest on the lower bench.
        oval(x,10,z,1.7,1.1,1.35,swim);
        oval(x,12.3,z,1.6,2.1,1.1,suit?swim:skin);
        if (suit) for(const shoulder of [-1,1]) box(x+shoulder,13.3,front,.4,1.5,.3,swim);
        for (const limb of [-1,1]) {
          const legStart=data.length;
          // Seat top is 9; its inner edge is at |z|=3.825. Thighs rest
          // above it, while knees and shins stay entirely on the aisle side.
          const kneeZ = side*3.1;
          oval(x+limb*.95,9.65,z-side*2.45,.7,.65,2.45,skin);
          oval(x+limb*.95,9.2,kneeZ,.6,.65,.6,skin);
          oval(x+limb*.95,6.9,kneeZ,.55,2,.6,skin);
          oval(x+limb*.95,lowerBenchTop+.4,kneeZ-side*.25,.6,.4,.95,skin);
          legRanges.push([legStart-meshStart,data.length-meshStart]);
        }
        const headStart=data.length-meshStart;
        oval(x,torsoTop+.1,z,.5,.7,.5,skin);
        oval(x,torsoTop+1.7,z,1.15,1.45,1,skin);
        oval(x,torsoTop+2.1,z+side*.35,1.2,1.15,.75,hair);
        if (index%3===1) {
          for (const edge of [-1,1]) oval(x+edge,torsoTop+.6,z+side*.5,.35,1.6,.5,hair);
        }
        for (const eye of [-1,1]) oval(x+eye*.42,torsoTop+1.9,z-side*.94,.13,.13,.1,[.06,.05,.04]);
        oval(x,torsoTop+1.55,z-side*1.02,.18,.23,.2,skin);
        const mouthStart=data.length-meshStart;
        oval(x,torsoTop+.95,z-side*1.02,.34,.065,.045,[.64,.28,.25]);
        const mouthEnd=data.length-meshStart;
        // Finnish technology student cap: white crown, black band/visor,
        // gold badge and a hanging black tassel on a cord.
        const hatRing = (bottom,top,rx,rz,color) => {
          for (let section=0;section<16;section++) {
            const a=section*Math.PI/8,b=a+Math.PI/8;
            const p=(angle,y)=>[x+rx*Math.cos(angle),y,z+rz*Math.sin(angle)];
            quad(p(a,bottom),p(b,bottom),p(b,top),p(a,top),color);
            tri([x,top,z],p(a,top),p(b,top),color);
          }
        };
        hatRing(torsoTop+2.5,torsoTop+3.05,1.2,1,[.045,.045,.045]);
        hatRing(torsoTop+3.05,torsoTop+3.65,1.42,1.22,[.96,.95,.91]);
        // Rounded projecting visor, with a thin highlight on its black surface.
        oval(x,torsoTop+2.52,z-side*1.02,1.05,.09,.78,[.035,.04,.045]);
        oval(x,torsoTop+2.58,z-side*1.36,.78,.035,.35,[.11,.12,.13]);
        oval(x,torsoTop+2.78,z-side*1.015,.18,.22,.09,[.94,.71,.23]);
        // Cord crosses the crown and drops over the side into a long tassel.
        const cord = [[x-.55,torsoTop+3.69,z+side*.4],[x+.25,torsoTop+3.69,z],
          [x+1.15,torsoTop+3.6,z],[x+1.52,torsoTop+2.7,z],
          [x+1.7,torsoTop+1.5,z],[x+1.85,torsoTop+.5,z]];
        for(let segment=1;segment<cord.length;segment++) {
          const a=cord[segment-1],b=cord[segment];
          quad([a[0],a[1],a[2]-.07],[a[0],a[1],a[2]+.07],
            [b[0],b[1],b[2]+.07],[b[0],b[1],b[2]-.07],[.035,.035,.035]);
          quad([a[0]-.07,a[1],a[2]],[a[0]+.07,a[1],a[2]],
            [b[0]+.07,b[1],b[2]],[b[0]-.07,b[1],b[2]],[.045,.045,.045]);
        }
        oval(x+1.85,torsoTop-.35,z,.36,1,.32,[.025,.025,.025]);
        for(let strand=0;strand<5;strand++) {
          oval(x+1.6+strand*.12,torsoTop-.85,z,.06,.65,.23,[.065,.065,.065]);
        }
        this.saunaGuestMeshes.push({ x,z,side,skin,swim,headStart,mouthStart,mouthEnd,legRanges,
          data:new Float32Array(data.splice(meshStart)) });
      }
    }
    this.saunaGuestCount = guestIndex;
    // Stove in the corner opposite the side entrance; fire faces the vestibule.
    box(2016,1,-8,8,9,8,[.13,.14,.14]);
    box(2011.9,3,-8,.3,3,5,[1,.32,.04]);
    box(2017,10,-8,2,16,2,[.16,.17,.17]);
    for(let i=0;i<12;i++) box(2013+(i%4)*1.8,10,-11+Math.floor(i/4)*2,1.6,1.5,1.8,[.36,.35,.32]);
    // Closed side door, threshold steps and warm lamp above the benches.
    const doorStart=data.length;
    box(2015.5,1,14,9,20,.6,[.30,.18,.10]);
    box(2012,10,13.5,1,1,.6,[.85,.68,.35]);
    this.saunaDoorMesh=new Float32Array(data.splice(doorStart));
    box(2015.5,1,12,8,1.5,3,benchWood);
    box(2015.5,-1,16,8,2,3,railWood);
    box(2015.5,-3,19,8,2,3,railWood);
    box(1999,19,-13.3,5,4,.3,[1,.73,.32]);
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
    gl.disableVertexAttribArray(this.locations.uv);
    gl.vertexAttrib2f(this.locations.uv,0,0);
    gl.uniform1i(this.locations.textured,0);
  }

  makeSaleProducts(faces) {
    this.saleProducts=[];
    if(typeof document==='undefined' || typeof Image==='undefined') return;
    const gl=this.gl;
    for(const product of window.LPRSale.products) {
      const vertices=faces[product.id];
      if(!vertices?.length) continue;
      const mesh={buffer:gl.createBuffer(),texture:gl.createTexture(),count:vertices.length/8,ready:false};
      gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
      this.saleProducts.push(mesh);
      const image=product.candyLabel || product.packageLabel ? document.createElement('canvas') : new Image();
      if(product.packageLabel) {
        image.width=256;image.height=320;
        const ctx=image.getContext('2d');
        const base=product.color.map(c=>Math.round(c*255));
        const gradient=ctx.createLinearGradient(0,0,256,0);
        gradient.addColorStop(0,`rgb(${base.map(c=>Math.round(c*.7)).join(',')})`);
        gradient.addColorStop(.4,`rgb(${base.join(',')})`);
        gradient.addColorStop(1,`rgb(${base.map(c=>Math.round(c*.8)).join(',')})`);
        ctx.fillStyle=gradient;ctx.fillRect(0,0,256,320);
        ctx.fillStyle='#f8f1de';ctx.fillRect(12,48,232,76);
        ctx.textAlign='center';ctx.fillStyle='#21352c';
        ctx.font='bold 28px Arial';ctx.fillText(product.packageLabel.toLocaleUpperCase('fi'),128,94,218);
        ctx.strokeStyle='#ffffff70';ctx.lineWidth=2;
        for(let i=0;i<5;i++) {
          ctx.beginPath();ctx.moveTo(28+i*43,155);ctx.lineTo(45+i*43,245);ctx.stroke();
        }
        ctx.fillStyle='#f8f1de';ctx.fillRect(70,259,116,32);
        ctx.fillStyle='#27372a';ctx.font='16px Arial';ctx.fillText(product.id==='maito' ? '1 L' : product.id==='astianpesuaine' ? '500 ml' : product.id==='talouspaperi' ? '2 rullaa' : '500 g',128,281,108);
      }
      if(product.candyLabel) {
        // Original, unbranded wrappers give the peg display varied colours.
        image.width=256;image.height=384;
        const ctx=image.getContext('2d');
        const base=product.color.map(c=>Math.round(c*255));
        const gradient=ctx.createLinearGradient(0,0,256,0);
        gradient.addColorStop(0,`rgb(${base.map(c=>Math.round(c*.55)).join(',')})`);
        gradient.addColorStop(.35,`rgb(${base.join(',')})`);
        gradient.addColorStop(.7,`rgb(${base.map(c=>Math.min(255,c+38)).join(',')})`);
        gradient.addColorStop(1,`rgb(${base.map(c=>Math.round(c*.65)).join(',')})`);
        ctx.fillStyle=gradient;ctx.fillRect(0,0,256,384);
        for(let i=0;i<12;i++) {
          ctx.fillStyle=i%2 ? '#ffffff18' : '#00000015';
          ctx.beginPath();ctx.moveTo(i*24,0);ctx.lineTo(i*24+8,180);
          ctx.lineTo(i*24-5,384);ctx.lineTo(i*24-10,180);ctx.fill();
        }
        ctx.fillStyle='#ffffffdf';ctx.beginPath();ctx.ellipse(128,118,118,55,-.12,0,Math.PI*2);ctx.fill();
        ctx.textAlign='center';ctx.fillStyle='#171925';
        ctx.font=`900 ${product.candyLabel.length>7 ? 30 : 40}px Arial`;
        ctx.fillText(product.candyLabel,128,122,236);
        ctx.font='italic 900 64px Arial';ctx.lineWidth=5;ctx.strokeStyle='#161927';
        ctx.strokeText('Mix',128,193);ctx.fillStyle='#fff';ctx.fillText('Mix',128,193);
        const palette=product.id==='salmiakki-mix' || product.id==='lakritsi-mix' ?
          ['#161317','#34303b','#645163'] : ['#ffca27','#ef4c38','#69b733','#fa85b2','#ffa026'];
        for(let row=0;row<4;row++) for(let column=0;column<5;column++) {
          const x=23+column*51+(row%2)*9,y=222+row*34;
          ctx.fillStyle=palette[(row+column*2)%palette.length];
          ctx.beginPath();ctx.ellipse(x,y,18,12,(column-row)*.4,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='#ffffff55';ctx.beginPath();ctx.ellipse(x-4,y-4,7,3,-.3,0,Math.PI*2);ctx.fill();
        }
        ctx.fillStyle='#ffffffcf';ctx.font='bold 15px Arial';ctx.fillText('MAKEISSEKOITUS · 250 g',128,365);
        for(let x=0;x<256;x+=6) {
          ctx.fillStyle='#ffffff40';ctx.fillRect(x,0,2,12);ctx.fillRect(x,373,2,11);
        }
      }
      image.onload=()=>{
        // Trim the catalogue photo's white margins so the packaging fills its face.
        const canvas=document.createElement('canvas');
        canvas.width=image.width; canvas.height=image.height;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(image,0,0);
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let left=image.width,top=image.height,right=0,bottom=0;
        for(let y=0;y<image.height;y++) for(let x=0;x<image.width;x++) {
          const i=(y*image.width+x)*4;
          if(pixels[i+3]>100 && Math.min(pixels[i],pixels[i+1],pixels[i+2])<230) {
            left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
          }
        }
        if(right<left || bottom<top) return;
        canvas.width=256;canvas.height=256;
        ctx.drawImage(image,left,top,right-left+1,bottom-top+1,0,0,256,256);
        gl.bindTexture(gl.TEXTURE_2D,mesh.texture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
        mesh.ready=true;
      };
      image.onerror=()=>console.warn(`Product artwork could not be loaded: ${product.name}`);
      if(product.candyLabel || product.packageLabel) image.onload();
      else image.src=product.image || `assets/${product.id}.jpg`;
    }
  }

  drawSaleProducts() {
    const gl=this.gl;
    gl.uniform1i(this.locations.textured,1);
    gl.uniform1i(this.locations.texture,0);
    gl.activeTexture(gl.TEXTURE0);
    gl.enableVertexAttribArray(this.locations.uv);
    for(const mesh of this.saleProducts || []) {
      if(!mesh.ready) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
      gl.vertexAttribPointer(this.locations.position,3,gl.FLOAT,false,32,0);
      gl.vertexAttribPointer(this.locations.color,3,gl.FLOAT,false,32,12);
      gl.vertexAttribPointer(this.locations.uv,2,gl.FLOAT,false,32,24);
      gl.bindTexture(gl.TEXTURE_2D,mesh.texture);
      gl.drawArrays(gl.TRIANGLES,0,mesh.count);
    }
    this.bindMesh(this.saleBuffer);
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
    const damage=car.damage || 0;
    const bodyPoint=(forward,side,height)=> {
      // Crumple the nose and bend the suspension toward the struck side.
      const crush=Math.max(0,forward-2)*damage;
      const damagedForward=forward-crush*.55;
      const damagedSide=side+(car.impactSide || .3)*crush*.25;
      return [
        car.x+bodyForward[0]*damagedForward+bodyRight[0]*damagedSide,
        Math.max(.25,height-crush*.12),
        car.y+bodyForward[1]*damagedForward+bodyRight[1]*damagedSide
      ];
    };

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
      const bentAngle=steeredAngle+side*damage*.65;
      wheelForward[0]=Math.cos(bentAngle); wheelForward[1]=Math.sin(bentAngle);
      axleDirection[0]=-wheelForward[1]; axleDirection[1]=wheelForward[0];
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

    if(car.crashed) {
      // Broken aluminium and suspension pieces remain beside the wreck.
      for(let i=0;i<7;i++) {
        const side=(i%2?1:-1)*(4+i*.7);
        const a=bodyPoint(5+i*.8,side,.3);
        const b=bodyPoint(6+i*.9,side+1.5,.45);
        rod(a,b,.25,i%2?blue:aluminium);
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
    if (car.sale) { this.renderSale(car); return; }
    if (car.sauna) { this.renderSauna(car, now); return; }
    const gl = this.gl;
    const angle = car.angle;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const moving = Math.min(1, (car.speed || 0) / 5);
    const roughness = Math.max(car.offroad ? .017 : 0, (car.kerbFraction || 0) * .028);
    const bump = Math.sin(now * .06) * roughness * moving;
    const crashTime=car.crashed ? Math.max(0,(now-car.crashedAt)/1000) : 10;
    const crashShake=Math.exp(-crashTime*5)*Math.sin(crashTime*55)*.08;
    const pitch = .055 - (car.longitudinalG || 0) * .014 + bump + crashShake;
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
    this.drawSpectators(car,now);
    this.drawWheels(car,now);
    this.drawCockpit(car);
  }

  drawSpectators(car, now) {
    const frame = this.spectatorFrame;
    const vertices = [];
    const time = now / 1000;
    for (const [index, mesh] of this.spectatorMeshes.entries()) {
      let forward = mesh.forward, side = mesh.side, yaw = side > 0 ? Math.PI : 0;
      let walking = false, elevation = 0;
      const phase = (time + index*3.1) % 36;
      if (mesh.activity === 'walk') {
        // Walk around the rear corner, pause by the sauna, then return to friends.
        const path = [[mesh.forward,mesh.side],[-49,mesh.side],[-49,4],[-37,4]];
        const progress = phase < 12 ? phase/12 : phase < 20 ? 1 : phase < 32 ? 1-(phase-20)/12 : 0;
        walking = phase < 12 || (phase >= 20 && phase < 32);
        const lengths = path.slice(1).map((p,i)=>Math.hypot(p[0]-path[i][0],p[1]-path[i][1]));
        let distance = progress*lengths.reduce((a,b)=>a+b,0);
        for (let segment=0;segment<lengths.length;segment++) {
          if (distance <= lengths[segment] || segment === lengths.length-1) {
            const a=path[segment],b=path[segment+1],mix=Math.min(1,distance/Math.max(.001,lengths[segment]));
            forward=a[0]+(b[0]-a[0])*mix; side=a[1]+(b[1]-a[1])*mix;
            if (segment===2) elevation=Math.max(0,Math.min(8,(forward+43)/2*2));
            yaw=Math.atan2(b[0]-a[0],-(b[1]-a[1]))+(phase>=20 ? Math.PI : 0);
            break;
          }
          distance-=lengths[segment];
        }
      }
      const near = Math.hypot(car.x-frame.stop[0],car.y-frame.stop[2]) < 180 && Math.abs(car.speed || 0) > 3;
      const cheer = mesh.activity === 'cheer' && (near || phase < 7);
      const sip = mesh.activity === 'drink' ? Math.max(0,Math.sin((time+index*2.7)%11/11*Math.PI*2)) : 0;
      const cy=Math.cos(yaw),sy=Math.sin(yaw);
      for (let v=0;v<mesh.data.length;v+=6) {
        let x=mesh.data[v],y=mesh.data[v+1],z=mesh.data[v+2];
        const arm=mesh.armRanges.find(([start,end])=>v>=start && v<end);
        if (arm) {
          if (cheer) {
            // Bend the elbows and wave sideways with hands beside the head.
            const elbowY=10.8*mesh.height, shoulderY=12.8*mesh.height;
            const pivotX=arm[2]*2.45;
            if (y<elbowY) {
              const bend=arm[2]*(2.65+Math.sin(time*5+index+arm[2])*.22);
              const dx=x-pivotX,dy=y-elbowY;
              x=pivotX+dx*Math.cos(bend)-dy*Math.sin(bend);
              y=elbowY+dx*Math.sin(bend)+dy*Math.cos(bend);
            }
            const spread=arm[2]*.45,dx=x-pivotX,dy=y-shoulderY;
            x=pivotX+dx*Math.cos(spread)-dy*Math.sin(spread);
            y=shoulderY+dx*Math.sin(spread)+dy*Math.cos(spread);
          } else if (arm[2]===1 && sip>0) {
            // Keep the upper arm down; lift only the forearm and its cup.
            const elbowY=10.8*mesh.height;
            if (arm[3]) {
              const bend=sip*2.65,dy=y-elbowY;
              x-=sip*1.6*Math.max(0,(elbowY-y)/(2.7*mesh.height));
              y=elbowY+dy*Math.cos(bend)-z*Math.sin(bend);
              z=dy*Math.sin(bend)+z*Math.cos(bend);
            }
            const angle=sip*.25;
            const dy=y-12.8*mesh.height;
            y=12.8*mesh.height+dy*Math.cos(angle)-z*Math.sin(angle);
            z=dy*Math.sin(angle)+z*Math.cos(angle);
          }
          if (walking) z+=Math.sin(time*7+arm[2])*1.1;
        }
        if (walking && y<7.5*mesh.height) z+=Math.sin(time*7+(x<0 ? Math.PI : 0))*(1-y/(7.5*mesh.height))*1.7;
        y+=elevation+(cheer ? Math.max(0,Math.sin(time*5+index))*.65 : Math.sin(time*1.8+index)*.06);
        const f=forward+x*cy-z*sy,s=side+x*sy+z*cy;
        vertices.push(frame.stop[0]+frame.forwardX*f+frame.rightX*s,y,
          frame.stop[2]+frame.forwardZ*f+frame.rightZ*s,mesh.data[v+3],mesh.data[v+4],mesh.data[v+5]);
      }
    }
    const gl=this.gl;
    this.bindMesh(this.spectatorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES,0,vertices.length/6);
  }

  drawSaunaGuests(car, now) {
    const life=car.saunaLife;
    if (!life) return;
    const vertices=[];
    const tri=(a,b,c,color)=>{for(const p of [a,b,c]) vertices.push(...p,...color);};
    const quad=(a,b,c,d,color)=>{tri(a,b,c,color);tri(a,c,d,color);};
    const rod=(a,b,r,color)=>{
      const delta=b.map((v,i)=>v-a[i]),length=Math.hypot(...delta);
      if(length<.001) return;
      const axis=delta.map(v=>v/length), across=Math.hypot(axis[0],axis[2])>.001 ? [-axis[2],0,axis[0]] : [1,0,0];
      const n=Math.hypot(...across),u=across.map(v=>v/n),v=[axis[1]*u[2]-axis[2]*u[1],axis[2]*u[0]-axis[0]*u[2],axis[0]*u[1]-axis[1]*u[0]];
      const p=(center,angle)=>center.map((c,i)=>c+r*(u[i]*Math.cos(angle)+v[i]*Math.sin(angle)));
      for(let i=0;i<8;i++) {
        const c=i*Math.PI/4,d=c+Math.PI/4;
        quad(p(a,c),p(a,d),p(b,d),p(b,c),color);
        tri(a,p(a,d),p(a,c),color);tri(b,p(b,c),p(b,d),color);
      }
    };
    const skins=[[.94,.73,.59],[.77,.52,.34],[.88,.66,.45],[.53,.33,.22],[.97,.81,.69],[.69,.44,.29]];
    const swims=[[.08,.36,.68],[.83,.16,.18],[.06,.50,.40],[.63,.22,.63],[.95,.50,.08]];
    for(let index=0;index<this.saunaGuestMeshes.length;index++) {
      const mesh=this.saunaGuestMeshes[index],pose=life.pose(index);
      if(!pose.visible) continue;
      const cy=Math.cos(pose.yaw),sy=Math.sin(pose.yaw),rise=pose.standing*4;
      const skin=skins[(index+pose.generation*3)%skins.length],swim=swims[(index+pose.generation*2)%swims.length];
      const world=p=>[pose.position[0]+p[0]*cy-p[2]*sy,
        p[1]+rise+pose.position[1],pose.position[2]+p[0]*sy+p[2]*cy];
      const data=mesh.data;
      for(let i=0;i<data.length;i+=6) {
        if(pose.standing>0 && mesh.legRanges.some(([a,b])=>i>=a && i<b)) continue;
        let x=data[i]-mesh.x,y=data[i+1],z=(data[i+2]-mesh.z)*mesh.side;
        if(i>=mesh.mouthStart && i<mesh.mouthEnd) {
          const opening=pose.speaking || pose.singing ? Math.abs(Math.sin(life.time*9+index)) : 0;
          const headY=14.5+(index%3)*.25+1.7;
          y+=(data[i+1]-(headY-.75))*opening*2.5-opening*.16;
          // Fit the lips to the actual six-ring, ten-sided head surface.
          // Recalculate depth after opening, before rotating the whole head.
          const height=(y-headY)/1.45;
          let radius=0;
          for(let ring=0;ring<6;ring++) {
            const a=-Math.PI/2+ring*Math.PI/6,b=a+Math.PI/6;
            if(height>=Math.sin(a) && height<=Math.sin(b)) {
              const t=(height-Math.sin(a))/(Math.sin(b)-Math.sin(a));
              radius=Math.cos(a)*(1-t)+Math.cos(b)*t;
              break;
            }
          }
          for(let segment=5;segment<10;segment++) {
            const a=segment*Math.PI/5,b=a+Math.PI/5;
            const left=1.15*radius*Math.cos(a),right=1.15*radius*Math.cos(b);
            if(x>=left && x<=right) {
              const t=(x-left)/(right-left);
              z=radius*(Math.sin(a)*(1-t)+Math.sin(b)*t)-.012;
              break;
            }
          }
        }
        if(i>=mesh.headStart) {
          const turn=pose.headTurn+pose.gesture*.08,c=Math.cos(turn),s=Math.sin(turn);
          const originalX=x;x=x*c-z*s;z=originalX*s+z*c;
          y+=pose.gesture*.08;
        }
        if(y>10) {y+=pose.breath;x+=Math.sin(life.time*.8+index)*.045*(y-10)/10;}
        const p=world([x,y,z]);
        const color=[data[i+3],data[i+4],data[i+5]];
        // Incoming guests have fresh swimwear and varied skin tones.
        if(pose.generation) {
          for(const [oldColor,newColor] of [[mesh.skin,skin],[mesh.swim,swim]]) {
            const factor=color[0]/oldColor[0];
            if(Math.abs(color[1]-oldColor[1]*factor)<.003 && Math.abs(color[2]-oldColor[2]*factor)<.003) {
              for(let channel=0;channel<3;channel++) color[channel]=Math.min(1,newColor[channel]*factor);
              break;
            }
          }
        }
        vertices.push(...p,...color);
      }
      if(pose.standing>0) {
        for(const leg of [-1,1]) {
          const swing=pose.walking ? Math.sin(life.time*8+index)*1.2*leg : 0;
          const stand=pose.standing,hip=[leg*.95,9.65,0];
          const knee=[leg*.95,9.2-4*stand,-4.9+(4.9+swing)*stand];
          const ankle=[leg*.95,4.9-4*stand,-5.15+(5.15-swing)*stand];
          if(pose.walking) ankle[1]+=Math.max(0,swing)*.3;
          const foot=world(ankle),toe=world([ankle[0],ankle[1],ankle[2]-.8]);
          if(pose.walking) {
            const support=Math.max(life.floorAt(foot[0],foot[2]),life.floorAt(toe[0],toe[2]))+.4;
            foot[1]=Math.max(foot[1],support);toe[1]=Math.max(toe[1],support);
          }
          rod(world(hip),world(knee),.6,skin);rod(world(knee),foot,.48,skin);
          rod(foot,toe,.35,skin);
        }
      }
      for(const arm of [-1,1]) {
        const sip=arm===1 ? pose.sip : 0, gesture=arm===-1 ? pose.gesture : 0;
        const swing=pose.walking ? Math.sin(life.time*8+index)*.7*arm : 0;
        const shoulder=world([arm*1.65,13.5,0]);
        const elbow=world([arm*(1.9+gesture*.25),11.7+sip*1.4+gesture*.7,-.2+swing]);
        let hand=world([arm*1.6-sip*1.2,10.3+sip*5.6+gesture*2,-1.3-gesture*.6]);
        const elapsed=now-(car.steamAt ?? -10000);
        const throwing=car.steamActor===index && elapsed>=0 && elapsed<900 && !pose.standing;
        if(throwing && arm===-1) {
          const reach=Math.sin(elapsed/900*Math.PI);
          hand=[1989+2*reach-2.7,7.35+4.8*reach+.7,mesh.side*(2.7-reach)];
        }
        rod(shoulder,elbow,.4,skin);rod(elbow,hand,.32,skin);
        rod([hand[0],hand[1]-.23,hand[2]],[hand[0],hand[1]+.23,hand[2]],.38,skin);
        if(arm===1 && !pose.standing) {
          const cupBottom=[hand[0],hand[1]+.1,hand[2]-.15],cupTop=[hand[0],hand[1]+.95,hand[2]-.15-sip*.3];
          rod(cupBottom,cupTop,.34,[.16+.06*(index%3),.46,.64]);
          rod(cupTop,[cupTop[0],cupTop[1]+.035,cupTop[2]],.28,[.30,.67,.76]);
        }
      }
    }
    // Swing the real entrance door open while guests pass through it.
    this.saunaDoorAngle=(this.saunaDoorAngle || 0)+((life.doorOpen()?1.25:0)-(this.saunaDoorAngle || 0))*.12;
    const dc=Math.cos(this.saunaDoorAngle),ds=Math.sin(this.saunaDoorAngle);
    for(let i=0;i<this.saunaDoorMesh.length;i+=6) {
      const d=this.saunaDoorMesh,x=d[i]-2011,z=d[i+2]-14;
      vertices.push(2011+x*dc-z*ds,d[i+1],14+x*ds+z*dc,d[i+3],d[i+4],d[i+5]);
    }
    const gl=this.gl;
    this.bindMesh(this.saunaGuestBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES,0,vertices.length/6);
  }

  saunaSteamTarget(car, clientX, clientY, now) {
    if (!car.sauna) return false;
    const rect=this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const px=(clientX-rect.left)/rect.width, py=(clientY-rect.top)/rect.height;
    if(px<0 || px>1 || py<0 || py>1) return false;
    const yaw=car.saunaYaw || 0, pitch=car.saunaPitch ?? -.12;
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const focal=1/Math.tan(76*Math.PI/360);
    const horizontal=(px*2-1)*(rect.width/rect.height)/focal, vertical=(1-py*2)/focal;
    const direction=[cy*cp-sy*horizontal-cy*sp*vertical,sp+cp*vertical,sy*cp+cy*horizontal-sy*sp*vertical];
    const side=car.saunaSide || -1, origin=[car.saunaX ?? 1986,18,car.saunaZ ?? side*6];
    const hitBox=(min,max)=>{
      let near=1,far=Infinity;
      for(let axis=0;axis<3;axis++) {
        if(Math.abs(direction[axis])<1e-8) { if(origin[axis]<min[axis] || origin[axis]>max[axis]) return false; continue; }
        const a=(min[axis]-origin[axis])/direction[axis],b=(max[axis]-origin[axis])/direction[axis];
        near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
        if(far<near) return false;
      }
      return true;
    };
    const elapsed=now-(car.steamAt ?? -10000), reach=elapsed>=0 && elapsed<900 ? Math.sin(elapsed/900*Math.PI) : 0;
    const bowl=[1989+2*reach,7.35+4.8*reach,side*(2.7-reach)];
    return hitBox([1987.6,4.5,side*2.7-1.4],[1990.4,8.7,side*2.7+1.4]) ||
      hitBox([bowl[0]-.7,bowl[1]-.5,bowl[2]-.7],[bowl[0]+.7,bowl[1]+.1,bowl[2]+.7]) ||
      hitBox([bowl[0]-4.2,bowl[1]-.2,bowl[2]-.22],[bowl[0]-.4,bowl[1]+1.3,bowl[2]+.22]);
  }

  drawSaunaLadle(car, now) {
    const vertices=[];
    const tri=(a,b,c,color)=>{for(const p of [a,b,c]) vertices.push(...p,...color);};
    const quad=(a,b,c,d,color)=>{tri(a,b,c,color);tri(a,c,d,color);};
    // Keep the bucket within arm's reach of the player's current bench.
    const side=car.saunaSide || -1, bucketX=1989, bucketZ=side*2.7;
    const bucketPoint=(angle,radius,height)=>[bucketX+Math.cos(angle)*radius,height,bucketZ+Math.sin(angle)*radius];
    for(let segment=0;segment<16;segment++) {
      const a=segment*Math.PI/8,b=a+Math.PI/8;
      const wood=segment%2 ? [.53,.34,.18] : [.67,.45,.25];
      quad(bucketPoint(a,1.05,4.5),bucketPoint(b,1.05,4.5),bucketPoint(b,1.35,7.2),bucketPoint(a,1.35,7.2),wood);
      quad(bucketPoint(a,1.17,7.2),bucketPoint(b,1.17,7.2),bucketPoint(b,.95,4.7),bucketPoint(a,.95,4.7),[.38,.25,.14]);
      quad(bucketPoint(a,1.35,7.2),bucketPoint(b,1.35,7.2),bucketPoint(b,1.17,7.2),bucketPoint(a,1.17,7.2),[.79,.56,.32]);
      tri([bucketX,6.65,bucketZ],bucketPoint(a,1.1,6.65),bucketPoint(b,1.1,6.65),[.22,.52,.62]);
      for(const h of [4.9,6.7]) {
        const r=1.05+(h-4.5)/2.7*.3+.02;
        quad(bucketPoint(a,r,h),bucketPoint(b,r,h),bucketPoint(b,r+.025,h+.17),bucketPoint(a,r+.025,h+.17),[.30,.32,.32]);
      }
    }
    const elapsed=now-(car.steamAt ?? -10000);
    const reach=elapsed>=0 && elapsed<900 ? Math.sin(elapsed/900*Math.PI) : 0;
    const bowl=[bucketX+2*reach,7.35+4.8*reach,bucketZ-side*reach];
    const rod=(a,b,r,color)=>{
      const delta=b.map((v,i)=>v-a[i]),length=Math.hypot(...delta);
      if(length<.001) return;
      const axis=delta.map(v=>v/length);
      const across=Math.hypot(axis[0],axis[2])>.001 ? [-axis[2],0,axis[0]] : [1,0,0];
      const n=Math.hypot(...across),u=across.map(v=>v/n);
      const v=[axis[1]*u[2]-axis[2]*u[1],axis[2]*u[0]-axis[0]*u[2],axis[0]*u[1]-axis[1]*u[0]];
      const point=(p,angle)=>p.map((value,i)=>value+r*(u[i]*Math.cos(angle)+v[i]*Math.sin(angle)));
      for(let i=0;i<8;i++) {
        const c=i*Math.PI/4,d=c+Math.PI/4;
        quad(point(a,c),point(a,d),point(b,d),point(b,c),color);
        tri(b,point(b,c),point(b,d),color);
      }
    };
    const tilt=reach*.9;
    const point=(angle,radius,height)=>[bowl[0]+radius*Math.cos(angle),
      bowl[1]+height*Math.cos(tilt)-radius*Math.sin(angle)*Math.sin(tilt),
      bowl[2]+height*Math.sin(tilt)+radius*Math.sin(angle)*Math.cos(tilt)];
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6,b=a+Math.PI/6;
      quad(point(a,.32,-.45),point(b,.32,-.45),point(b,.65,0),point(a,.65,0),[.65,.68,.65]);
      quad(point(a,.65,0),point(b,.65,0),point(b,.53,0),point(a,.53,0),[.82,.84,.79]);
      tri(point(0,0,-.3),point(a,.53,0),point(b,.53,0),[.32,.37,.36]);
    }
    rod([bowl[0]-.5,bowl[1],bowl[2]],[bowl[0]-4,bowl[1]+1.1,bowl[2]],.14,[.68,.45,.23]);
    rod([bucketX,7.2,bucketZ-1.25],[bucketX,8.5,bucketZ-1.25],.09,[.30,.32,.32]);
    rod([bucketX,7.2,bucketZ+1.25],[bucketX,8.5,bucketZ+1.25],.09,[.30,.32,.32]);
    rod([bucketX,8.5,bucketZ-1.25],[bucketX,8.5,bucketZ+1.25],.12,[.79,.56,.32]);
    if(elapsed>=0 && elapsed<900 && (car.steamActor === 'player' || car.steamActor === undefined)) {
      const grip=[bowl[0]-2.7,bowl[1]+.7,bowl[2]], elbow=[1986.5,11.7,side*4.6];
      const skin=[.86,.64,.46];
      rod([1985.6,13.8,side*5.5],elbow,.38,skin);
      rod(elbow,grip,.3,skin);
      rod([grip[0],grip[1]-.25,grip[2]],[grip[0],grip[1]+.25,grip[2]],.38,skin);
    }
    if(elapsed>300 && elapsed<600) {
      for(let i=0;i<4;i++) {
        const offset=i*.13;
        const start=[bowl[0]+offset,bowl[1]-.2,bowl[2]-.4],end=[2013+offset,11.5,-8+offset];
        const arc=t=>start.map((v,j)=>v+(end[j]-v)*t+(j===1?Math.sin(t*Math.PI)*3:0));
        for(let segment=0;segment<12;segment++) rod(arc(segment/12),arc((segment+1)/12),.045,[.49,.76,.86]);
      }
    }
    const gl=this.gl;
    this.bindMesh(this.saunaPropBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES,0,vertices.length/6);
  }

  renderSale(car) {
    const gl=this.gl, yaw=car.saunaYaw||0,pitch=car.saunaPitch||0;
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    this.bindMesh(this.saleBuffer);
    gl.uniform3f(this.locations.camera,-6000+car.saleX,17,car.saleZ);
    gl.uniform3f(this.locations.forward,cy*cp,sp,sy*cp);
    gl.uniform3f(this.locations.right,-sy,0,cy);
    gl.uniform3f(this.locations.up,-cy*sp,cp,-sy*sp);
    gl.uniform1f(this.locations.aspect,this.width/this.height);
    gl.uniform1f(this.locations.focal,1/Math.tan(76*Math.PI/360));
    gl.drawArrays(gl.TRIANGLES,0,this.saleVertexCount);
    this.drawSaleProducts();
    this.cockpit.clearRect(0,0,this.width,this.height);
  }

  renderSauna(car, now) {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    this.bindMesh(this.buffer);
    gl.uniform3f(this.locations.camera,car.saunaX ?? 1986,18,car.saunaZ ?? (car.saunaSide || -1)*6);
    const yaw = car.saunaYaw || 0, pitch = car.saunaPitch ?? -.12;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    gl.uniform3f(this.locations.forward,cy*cp,sp,sy*cp);
    gl.uniform3f(this.locations.right,-sy,0,cy);
    gl.uniform3f(this.locations.up,-cy*sp,cp,-sy*sp);
    gl.uniform1f(this.locations.aspect,this.width/this.height);
    gl.uniform1f(this.locations.focal,1/Math.tan(76*Math.PI/360));
    gl.drawArrays(gl.TRIANGLES,0,this.vertexCount);
    this.drawSaunaGuests(car,now);
    this.drawSaunaLadle(car,now);
    const ctx=this.cockpit, w=this.width, h=this.height;
    ctx.clearRect(0,0,w,h);
    const steam=Math.max(0,1-(now-(car.steamAt ?? -10000))/6000);
    if(steam>0) {
      const haze=ctx.createLinearGradient(0,0,0,h);
      haze.addColorStop(0,`rgba(235,237,225,${steam*.55})`);
      haze.addColorStop(1,`rgba(235,237,225,${steam*.12})`);
      ctx.fillStyle=haze; ctx.fillRect(0,0,w,h);
      for(let i=0;i<7;i++) {
        ctx.beginPath();
        ctx.ellipse(w*(.15+i*.12)+Math.sin(now*.001+i)*w*.05,h*(.65-((now*.00012+i*.13)% .6)),w*.15,h*.10,0,0,Math.PI*2);
        ctx.fillStyle=`rgba(245,245,235,${steam*.09})`; ctx.fill();
      }
    }
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
