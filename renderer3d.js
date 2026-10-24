const rendererText = text => window.LPRI18n?.t(text) ?? text;
/* Small dependency-free WebGL renderer for the driver view. World X/Y become 3D X/Z. */
window.LPRRenderer3D = class LPRRenderer3D {
  constructor(canvas, cockpitCanvas, track) {
    this.canvas = canvas;
    this.cockpitCanvas = cockpitCanvas;
    this.cockpit = cockpitCanvas.getContext('2d');
    this.driverArm = new Image();
    this.driverArm.src = 'assets/driver-arm.png';
    this.gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!this.gl) throw new Error(rendererText("WebGL ei ole k\u00e4ytett\u00e4viss\u00e4 t\u00e4ss\u00e4 selaimessa."));
    this.track = track;
    this.width = 0;
    this.height = 0;
    this.makeProgram();
    this.makeWorld();
    this.wheelBuffer = this.gl.createBuffer();
    this.vehicleNormalBuffer = this.gl.createBuffer();
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
      attribute vec3 aNormal;
      uniform bool uMeshTransform;
      uniform vec3 uMeshOrigin;
      uniform vec3 uMeshForward;
      uniform vec3 uMeshUp;
      uniform vec3 uMeshRight;
      uniform float uMeshFloor;
      uniform vec3 uCamera;
      uniform vec3 uForward;
      uniform vec3 uRight;
      uniform vec3 uUp;
      uniform float uAspect;
      uniform float uFocal;
      uniform bool uSky;
      varying vec3 vColor;
      varying float vDepth;
      varying vec2 vUV;
      varying vec3 vWorld;
      varying vec3 vRay;
      varying vec3 vView;
      varying vec3 vNormal;
      void main() {
        vec3 position = aPosition;
        vec3 normal = aNormal;
        if (uMeshTransform) {
          position = uMeshOrigin + uMeshForward*aPosition.x + uMeshUp*aPosition.y + uMeshRight*aPosition.z;
          position.y = max(position.y, uMeshFloor);
          normal = uMeshForward*aNormal.x + uMeshUp*aNormal.y + uMeshRight*aNormal.z;
        }
        vWorld = position;
        vView = uCamera-position;
        vNormal = normal;
        vRay = uForward + uRight * aPosition.x * uAspect / uFocal + uUp * aPosition.y / uFocal;
        if (uSky) {
          gl_Position = vec4(aPosition.xy, 0.9999, 1.0);
          vColor = aColor; vDepth = 0.0; vUV = aUV;
          return;
        }
        vec3 relative = position - uCamera;
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
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      varying vec3 vColor;
      varying float vDepth;
      varying vec2 vUV;
      varying vec3 vWorld;
      varying vec3 vRay;
      varying vec3 vView;
      varying vec3 vNormal;
      uniform sampler2D uTexture;
      uniform bool uTextured;
      uniform bool uSky;
      uniform float uOpacity;
      uniform bool uOutdoor;
      uniform int uMaterial;
      uniform bool uVehicle;
      uniform vec3 uCarOrigin;
      uniform vec3 uCarForward;
      uniform vec3 uCarRight;
      void main() {
        if (uSky) {
          vec3 ray = normalize(vRay);
          float elevation = max(ray.y, 0.0);
          vec3 skyColor = mix(vec3(0.76, 0.84, 0.87), vec3(0.23, 0.48, 0.73), smoothstep(0.0, 0.8, elevation));
          float sun = pow(max(dot(ray, normalize(vec3(-0.45, 0.8, -0.35))), 0.0), 180.0);
          gl_FragColor = vec4(skyColor + vec3(0.26, 0.22, 0.14) * sun, 1.0);
          return;
        }
        vec3 color = vColor;
        float surfaceAlpha = 1.0;
        if (uVehicle) {
          vec3 view=normalize(vView);
          vec3 normal=normalize(vNormal);
          if(dot(normal,view)<0.0) normal=-normal;
          vec3 sun=normalize(vec3(-0.45,0.8,-0.35));
          float diffuse=max(dot(normal,sun),0.0);
          float fresnel=pow(1.0-max(dot(normal,view),0.0),3.0);
          bool rubber=color.r>=0.065 && color.r<0.14 && abs(color.g-color.r)<0.022;
          bool metal=color.r>0.25 && abs(color.g-color.r)<0.10;
          bool carbon=color.g<0.08 && !rubber;
          vec3 relative=vWorld-uCarOrigin;
          vec2 surface=vec2(dot(relative,uCarForward),dot(relative,uCarRight));
          // Texture is attached to the chassis, so it cannot slide as the car turns.
          if(carbon) {
            vec2 weave=surface*12.0;
            float thread=sin((weave.x+weave.y)*3.14159)*sin((weave.x-weave.y)*3.14159);
            float weaveFade=1.0-smoothstep(12.0,55.0,vDepth);
            color*=1.0+thread*0.14*weaveFade;
          }
          float grain=fract(sin(dot(floor(surface*95.0),vec2(7.13,3.71)))*41.31);
          if(rubber) color*=0.94+grain*0.12;
          float gloss=metal?64.0:rubber?10.0:38.0;
          float specular=pow(max(dot(normal,normalize(sun+view)),0.0),gloss);
          vec3 reflected=reflect(-view,normal);
          vec3 reflection=mix(vec3(0.055,0.065,0.05),vec3(0.48,0.62,0.68),
            smoothstep(-0.15,0.6,reflected.y));
          // Broad sky highlights reveal curved resin and painted surfaces.
          float skyHighlight=pow(max(dot(reflected,normalize(vec3(.3,.85,.2))),0.0),8.0);
          color*=0.60+diffuse*0.70+max(normal.y,0.0)*0.16;
          color+=reflection*(rubber?0.022:metal?0.14:0.055+fresnel*0.20);
          color+=vec3(1.0,0.96,0.86)*specular*(rubber?0.025:metal?0.38:0.16);
          color+=vec3(.54,.65,.72)*skyHighlight*(rubber?.008:metal?.18:.12);
        }
        // World-scaled procedural textures need no downloads or large image assets.
        float detail = 1.0 - smoothstep(180.0, 650.0, vDepth);
        if (uMaterial == 1) {
          vec2 brickUV = vUV / vec2(0.28, 0.085);
          brickUV.x += mod(floor(brickUV.y), 2.0) * 0.5;
          vec2 cell = fract(brickUV);
          float mortar = max(1.0-smoothstep(0.03,0.10,cell.x),1.0-smoothstep(0.03,0.14,cell.y));
          float variation = fract(sin(dot(floor(brickUV),vec2(7.13,3.71))) * 41.31);
          color *= 0.91 + variation * 0.18 * detail;
          color = mix(color, vec3(0.48,0.44,0.38),mortar * 0.6 * detail);
        } else if (uMaterial == 2) {
          vec2 panels = fract(vUV / vec2(3.0,1.7));
          float seam = (1.0-smoothstep(0.002,0.012,min(panels.x,panels.y))) * detail;
          float grain = fract(sin(dot(floor(vUV*35.0),vec2(7.13,3.71))) * 41.31);
          color *= 1.0 + (grain-0.5)*0.10*detail - seam*0.22;
        } else if (uMaterial == 3) {
          float grain = sin(vUV.x*170.0 + sin(vUV.y*3.0)*2.0);
          float joint = 1.0-smoothstep(0.01,0.06,fract(vUV.x/0.14));
          color *= 1.0 + grain*0.06*detail - joint*0.22*detail;
        } else if (uMaterial == 5) {
          color *= texture2D(uTexture, vUV).rgb;
        } else if (uMaterial == 6) {
          vec4 paint = texture2D(uTexture, vUV);
          color *= paint.rgb;
          if (paint.a < 0.1) discard;
          surfaceAlpha = paint.a;
        } else if (uMaterial == 4) {
          vec3 view = normalize(vView);
          float reflection = 0.5 + 0.5*sin(view.x*2.0+view.z*2.4+vUV.y*1.8);
          color = mix(color,vec3(0.49,0.66,0.75),0.22+reflection*0.24);
          float edge = min(min(vUV.x,1.0-vUV.x),min(vUV.y,1.0-vUV.y));
          color *= mix(0.65,1.0,smoothstep(0.0,0.09,edge));
        }
        // Limit grain to the road surface and fade it before it can shimmer in the distance.
        if (uOutdoor && !uTextured && vWorld.y > 0.04 && vWorld.y < 0.06) {
          float grain = fract(sin(dot(floor(vWorld.xz * 3.0), vec2(12.9898, 78.233))) * 437.5453);
          color *= 1.0 + 0.12 * (grain - 0.5) * (1.0 - smoothstep(50.0, 260.0, vDepth));
        }
        if (uTextured) {
          vec4 artwork = texture2D(uTexture, vUV);
          if (artwork.a < 0.1 || (uMaterial != 7 && min(min(artwork.r, artwork.g), artwork.b) > 0.96)) discard;
          color = artwork.rgb;
        }
        // Sale occupies its own world region. These small surface effects cost
        // no textures, extra draw calls or moving lights and leave outdoors alone.
        if (!uOutdoor && vWorld.x > -6100.0 && vWorld.x < -5900.0) {
          vec2 shop = vec2(vWorld.x + 6000.0, vWorld.z);
          if (!uTextured && vWorld.y < 0.03) {
            float grain = fract(sin(dot(floor(shop * 38.0),vec2(7.13,3.71))) * 41.31);
            color *= 0.985 + grain * 0.03 * (1.0-smoothstep(20.0,100.0,vDepth));
            vec2 bank = max(abs(shop-vec2(-3.0,-30.0))-vec2(35.0,90.0),0.0);
            float contact = 1.0-smoothstep(0.0,7.0,length(bank));
            float wall = 1.0-smoothstep(0.0,7.0,90.0-abs(shop.x));
            vec2 till = max(abs(shop-vec2(-50.0,115.0))-vec2(9.5,23.0),0.0);
            contact = max(contact,1.0-smoothstep(0.0,6.0,length(till)));
            color *= 1.0 - max(contact,wall)*0.22;
            // Broad, subdued reflections below the two overhead light runs.
            float light = exp(-pow((shop.x-35.0)/8.0,2.0)) + exp(-pow((shop.x+55.0)/8.0,2.0));
            color += vec3(0.028,0.029,0.026)*light;
          } else if (!uTextured && vWorld.y > 44.0) {
            float grain = fract(sin(dot(floor(shop*24.0),vec2(7.13,3.71))) * 41.31);
            color *= 0.98+grain*.04*(1.0-smoothstep(30.0,120.0,vDepth));
          }
          // Slight falloff under fixtures makes the shop feel enclosed.
          color *= 0.92+0.08*smoothstep(0.0,30.0,vWorld.y);
        }
        vec3 sky = vec3(0.76, 0.84, 0.87);
        float fog = clamp((vDepth - 320.0) / 1000.0, 0.0, 0.83);
        gl_FragColor = vec4(mix(color, sky, fog), uOpacity * surfaceAlpha);
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
      meshTransform: gl.getUniformLocation(program, 'uMeshTransform'),
      meshOrigin: gl.getUniformLocation(program, 'uMeshOrigin'),
      meshForward: gl.getUniformLocation(program, 'uMeshForward'),
      meshUp: gl.getUniformLocation(program, 'uMeshUp'),
      meshRight: gl.getUniformLocation(program, 'uMeshRight'),
      meshFloor: gl.getUniformLocation(program, 'uMeshFloor'),
      position: gl.getAttribLocation(program, 'aPosition'),
      color: gl.getAttribLocation(program, 'aColor'),
      uv: gl.getAttribLocation(program, 'aUV'),
      normal: gl.getAttribLocation(program, 'aNormal'),
      vehicle: gl.getUniformLocation(program, 'uVehicle'),
      carOrigin: gl.getUniformLocation(program, 'uCarOrigin'),
      carForward: gl.getUniformLocation(program, 'uCarForward'),
      carRight: gl.getUniformLocation(program, 'uCarRight'),
      textured: gl.getUniformLocation(program, 'uTextured'),
      texture: gl.getUniformLocation(program, 'uTexture'),
      sky: gl.getUniformLocation(program, 'uSky'),
      opacity: gl.getUniformLocation(program, 'uOpacity'),
      outdoor: gl.getUniformLocation(program, 'uOutdoor'),
      material: gl.getUniformLocation(program, 'uMaterial'),
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
    gl.uniform1f(this.locations.opacity, 1);
    this.skyBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,0,1,1,1, 1,-1,0,1,1,1, 1,1,0,1,1,1, -1,-1,0,1,1,1, 1,1,0,1,1,1, -1,1,0,1,1,1]), gl.STATIC_DRAW);
  }

  makeWorld() {
    const gl = this.gl;
    const data = [];
    const shadows = [];
    const materialData = {brick:[],concrete:[],wood:[],glass:[]};
    let outdoorLighting = true;
    let terrainEnabled=true;
    const terrain=window.LPRTrackObjects?.terrain;
    // Bake sunlight once, keeping the per-frame cost unchanged on mobile.
    const add = (point, color) => data.push(point[0], point[1], point[2], color[0], color[1], color[2]);
    const litTri = (a, b, c, color) => {
      if (outdoorLighting) {
        const u=b.map((v,i)=>v-a[i]), v=c.map((value,i)=>value-a[i]);
        let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
        const length=Math.hypot(...n) || 1;
        if(n[1]<0) n=n.map(value=>-value);
        const light=Math.max(0,(-.45*n[0]+.8*n[1]-.35*n[2])/length/Math.hypot(.45,.8,.35));
        color=color.map((value,i)=>Math.min(1,value*(.76+light*.30)*[1.03,1.01,.98][i]));
      }
      add(a, color); add(b, color); add(c, color);
    };
    const tri=(a,b,c,color)=>{
      const lake=color[0]===.12&&color[1]===.36&&color[2]===.45;
      if(terrainEnabled&&terrain?.active&&!lake){
        const surface=Math.max(a[1],b[1],c[1])<=.7&&Math.min(a[1],b[1],c[1])>=-1;
        terrain.triangle(a,b,c,(A,B,C)=>litTri(A,B,C,color),surface);
      }else litTri(a,b,c,color);
    };
    const groundShadow = (x,z,sx,sz,height) => {
      // Convex hull of the footprint and its sunlight projection.
      const points=[];
      for(const dx of [-sx/2,sx/2]) for(const dz of [-sz/2,sz/2]) {
        points.push([x+dx,z+dz],[x+dx+height*.5625,z+dz+height*.4375]);
      }
      points.sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
      const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      const half=list=>{const hull=[];for(const p of list){while(hull.length>1 && cross(hull.at(-2),hull.at(-1),p)<=0) hull.pop();hull.push(p);}return hull;};
      const lower=half(points),upper=half([...points].reverse());
      const hull=[...lower.slice(0,-1),...upper.slice(0,-1)];
      for(let i=1;i<hull.length-1;i++) for(const p of [hull[0],hull[i],hull[i+1]]) shadows.push(p[0],.14,p[1],.025,.045,.065);
    };
    const quad = (a, b, c, d, color) => { tri(a, b, c, color); tri(a, c, d, color); };
    const box = (x, y, z, sx, sy, sz, color) => {
      if(outdoorLighting && y<=0 && sy>15 && sx>20 && sz>20) groundShadow(x,z,sx,sz,sy);
      const x0 = x - sx / 2, x1 = x + sx / 2, y0 = y, y1 = y + sy, z0 = z - sz / 2, z1 = z + sz / 2;
      const shade = factor => color.map(value => value * factor);
      quad([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],shade(.8));
      quad([x1,y0,z1],[x0,y0,z1],[x0,y1,z1],[x1,y1,z1],shade(.8));
      quad([x0,y0,z1],[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],shade(.65));
      quad([x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0],shade(.65));
      quad([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],color);
    };
    const materialBox = (x,y,z,sx,sy,sz,color,material) => {
      if (!materialData[material]) { box(x,y,z,sx,sy,sz,color); return; }
      const start=data.length;
      box(x,y,z,sx,sy,sz,color);
      const vertices=data.splice(start), target=materialData[material];
      for(let i=0;i<vertices.length;i+=18) {
        const a=vertices.slice(i,i+3),b=vertices.slice(i+6,i+9),c=vertices.slice(i+12,i+15);
        const u=b.map((v,j)=>v-a[j]),v=c.map((value,j)=>value-a[j]);
        const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]].map(Math.abs);
        const horizontal=n[1]>n[0] && n[1]>n[2];
        const axis=n[0]>n[2] ? 2 : 0;
        for(let j=0;j<18;j+=6) {
          const p=vertices.slice(i+j,i+j+3);
          // Local coordinates preserve sub-brick detail on mediump mobile GPUs.
          let uv=horizontal ? [(p[0]-x)/10,(p[2]-z)/10] : [(p[axis]-(axis===0?x:z))/10,(p[1]-y)/10];
          if(material==='glass') uv=horizontal ? [(p[0]-x)/sx+.5,(p[2]-z)/sz+.5] : [(p[axis]-(axis===0?x:z))/(axis===0?sx:sz)+.5,(p[1]-y)/sy];
          target.push(...vertices.slice(i+j,i+j+6),...uv);
        }
      }
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
    terrainEnabled=false;
    quad([-2200,-.4,-2200],[6500,-.4,-2200],[6500,-.4,6500],[-2200,-.4,6500],[.095,.235,.155]);
    terrainEnabled=true;
    terrain?.groundTiles((x,z,size)=>quad([x,-.39,z],[x+size,-.39,z],
      [x+size,-.39,z+size],[x,-.39,z+size],[.095,.235,.155]));
    this.obstacleMeshes=[];
    const objectGeometry=(body,draw)=>{
      const start=data.length;draw();
      this.obstacleMeshes.push({body,start,end:data.length});
    };
    window.LPRCampus.build({ box, quad, materialBox, objectGeometry });
    let objectStart;
    window.LPRTrackObjects?.build({box,quad,groundShadow,beginObject:()=>{objectStart=data.length;},
      endObject:body=>{if(body)this.obstacleMeshes.push({body,start:objectStart,end:data.length});}});
    if(window.LPRSale) {
      const facadeFaces={};
      window.LPRSale.buildExterior({box,quad,materialBox,artwork:(id,points)=>{facadeFaces[id]=points;}});
      this.makeSaleFacade(facadeFaces);
      const interiorStart=data.length;
      outdoorLighting=false;
      terrainEnabled=false;
      const productFaces = {},detailFaces={},cashierVertices=[];
      window.LPRSale.buildInterior({box,quad,cashierGeometry:build=>{
        const start=data.length;
        build();
        const vertices=new Float32Array(data.splice(start));
        this.saleCashierBody={buffer:gl.createBuffer(),count:vertices.length/6,
          vertices,posedVertices:new Float32Array(vertices)};
        this.saleCashierYaw=undefined;
        gl.bindBuffer(gl.ARRAY_BUFFER,this.saleCashierBody.buffer);
        gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);
      },cashierFace:(points,uv)=>{
        for(const i of [0,1,2,0,2,3]) cashierVertices.push(...points[i],1,1,1,...uv[i]);
      },artwork:(id,points)=>{(detailFaces[id] ||= []).push(points);},productFace:(id,points)=>{
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
      this.makeSaleInteriorDetails(detailFaces);
      this.makeSaleCashier(cashierVertices);
      outdoorLighting=true;
      terrainEnabled=true;
    }
    this.materialMeshes=Object.entries(materialData).map(([name,vertices],index)=>{
      const buffer=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
      return {name,buffer,count:vertices.length/8,material:index+1,source:new Float32Array(vertices),
        spatial:this.makeSpatialMesh(vertices,8)};
    });
    // The shoulder is a continuous strip beneath the asphalt.
    const { halfWidth, kerbOuter, shoulderOuter } = window.LPRCampus.road;
    const edgeLine = halfWidth - 2;
    strip(-shoulderOuter,shoulderOuter,.01,() => [.16,.18,.17]);
    strip(-halfWidth,halfWidth,.05,() => [.19,.22,.225]);
    this.makeKerbs(points, at, halfWidth, kerbOuter);
    this.makeRoadPaint(points, at, edgeLine);

    const first = points[0];
    const tangent = { x: points[1].x - first.x, z: points[1].y - first.y };
    const tangentLength = Math.hypot(tangent.x,tangent.z);
    tangent.x /= tangentLength; tangent.z /= tangentLength;
    const square = (side, along) => [first.x + normals[0].x * side + tangent.x * along,.18,first.y + normals[0].z * side + tangent.z * along];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 12; col++) {
      const cellWidth = halfWidth * 2 / 12;
      const a = -halfWidth + col * cellWidth, b = a + cellWidth;
      const f = (row - 1.5) * cellWidth, g = f + cellWidth;
      quad(square(a,f),square(b,f),square(b,g),square(a,g),(row+col)%2 ? [1,1,1] : [.025,.025,.025]);
    }

    // Campus woods and editor trees share the same species-specific geometry.
    let seed=window.LPRCampus.treeSeed;
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    let treeStart;
    window.LPRTreeGeometry.build(window.LPRCampus.trees,{quad,tri,groundShadow,
      beginTree:()=>{treeStart=data.length;},endTree:tree=>{
        this.obstacleMeshes.push({body:tree.body,start:treeStart,end:data.length});
      }},window.LPRCampus.treeSeed);
    for (const side of [-1,1]) {
      const x = first.x + normals[0].x * (shoulderOuter + 5) * side;
      const z = first.y + normals[0].z * (shoulderOuter + 5) * side;
      box(x,0,z,3,30,3,[.035,.17,.12]);
    }
    const beamCenter = [first.x, first.y];
    const gantryHalf = shoulderOuter + 5;
    for (let i = -gantryHalf; i < gantryHalf; i += 4) {
      const x = beamCenter[0] + normals[0].x * (i + 2);
      const z = beamCenter[1] + normals[0].z * (i + 2);
      box(x,26,z,4,5,4,i % 8 === 0 ? [.03,.68,.43] : [.03,.16,.13]);
    }

    // Tervahaudanpuisto: the truck, tub and their crowd share this world frame.
    const saunaMeshStart=data.length;
    const site = window.LPRCampus.saunaSite;
    const stop = [site.x,0,site.y];
    this.saunaStop = { x: stop[0], y: stop[2] };
    this.poolStop = window.LPRCampus.poolSite || { x: stop[0]-57*Math.SQRT1_2, y: stop[2]-57*Math.SQRT1_2 };
    const travelAngle = Math.PI / 4;
    const forwardX = -Math.cos(travelAngle), forwardZ = -Math.sin(travelAngle);
    const rightX = -forwardZ, rightZ = forwardX;
    let sceneOffsetX=0,sceneOffsetZ=0;
    const vanPoint = (forward, side, height) => [
      stop[0] + forwardX * forward + rightX * side + sceneOffsetX,
      height,
      stop[2] + forwardZ * forward + rightZ * side + sceneOffsetZ
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
    // Round flue is built below.
    // vanPrism(-16,-10,-3,3,34,46,dark);               // sauna chimney
    // Round rain cap is built below.                // rain cap
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
    // Photo artwork is projected onto a subdivided wall, not a billboard.
    // Coordinates select only the painted box from the user's reference photo.
    this.makeSaunaArtwork(vanPoint);
    groundShadow(stop[0],stop[2],70,29,25);
    const ring = (f,side,h,r,depth,color,segments=40) => {
      for(let i=0;i<segments;i++) {
        const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
        const shade=color.map(c=>c*(.72+.28*Math.max(0,Math.sin(a))));
        quad(vanPoint(f+r*Math.cos(a),side,h+r*Math.sin(a)),
          vanPoint(f+r*Math.cos(b),side,h+r*Math.sin(b)),
          vanPoint(f+r*Math.cos(b),side+depth,h+r*Math.sin(b)),
          vanPoint(f+r*Math.cos(a),side+depth,h+r*Math.sin(a)),shade);
      }
    };
    // Cab panel gaps, rubber seals, reflective glass, mirrors and running boards.
    for(const side of [-1,1]) {
      const z=side*10.18;
      quad(vanPoint(15,z,14.5),vanPoint(29,z,14.5),vanPoint(29,z,22.5),vanPoint(15,z,22.5),[.045,.055,.055]);
      quad(vanPoint(16,z+side*.03,15.3),vanPoint(28,z+side*.03,15.3),vanPoint(28,z+side*.03,21.7),vanPoint(16,z+side*.03,21.7),[.22,.33,.37]);
      quad(vanPoint(16.4,z+side*.04,20.8),vanPoint(27.5,z+side*.04,21.1),vanPoint(23,z+side*.04,19.7),vanPoint(16.4,z+side*.04,19.4),[.42,.52,.54]);
      for(const f of [12.5,30]) vanPrism(f,f+.08,z,z+side*.08,8,23,[.38,.40,.38]);
      vanPrism(14,17,z,z+side*.25,13,13.5,dark);
      vanPrism(11.5,30,side*10.2,side*11,6.5,7.1,steel);
      vanPrism(28,28.5,side*10,side*13.2,17,17.5,steel);
      vanPrism(26.8,29,side*13,side*13.9,16,21,dark);
      vanPrism(26.7,26.8,side*13.1,side*13.8,16.4,20.6,[.46,.55,.57]);
      vanPrism(30.7,32.2,side*8,side*10.3,12,13,[.92,.38,.075]);
      vanPrism(-32.5,10.5,side*12.3,side*12.5,8,8.5,steel);
      for(const f of [-32,10]) vanPrism(f,f+.22,side*12.35,side*12.55,8,34,[.68,.69,.63]);
      vanPrism(-33,-32.5,side*8,side*10.5,5,7,[.65,.055,.03]);
      // Mud flaps and steel wheel-arch lips.
      for(const axle of [-22,22]) {
        vanPrism(axle-5.5,axle-5,side*10,side*13,1,5,dark);
        for(let i=0;i<24;i++) {
          const a=i*Math.PI/24,b=(i+1)*Math.PI/24;
          quad(vanPoint(axle+5.1*Math.cos(a),side*13.35,4.7+5.1*Math.sin(a)),
            vanPoint(axle+5.1*Math.cos(b),side*13.35,4.7+5.1*Math.sin(b)),
            vanPoint(axle+5.45*Math.cos(b),side*13.35,4.7+5.45*Math.sin(b)),
            vanPoint(axle+5.45*Math.cos(a),side*13.35,4.7+5.45*Math.sin(a)),axle===22?white:steel);
        }
      }
    }
    for(let h=8.3;h<12;h+=.65) vanPrism(34.09,34.18,-6.8,6.8,h,h+.15,steel);
    for(const side of [-1,1]) {
      vanPrism(34.1,34.3,side*7,side*9.7,8.2,11.8,[.24,.27,.26]);
      vanPrism(34.3,34.35,side*7.3,side*9.4,8.6,11.4,[.82,.86,.78]);
      for(let n=0;n<4;n++) vanPrism(34.36,34.38,side*(7.4+n*.5),side*(7.45+n*.5),8.7,11.3,[.58,.66,.65]);
      quad(vanPoint(32.2,side*1,15.2),vanPoint(32.2,side*1.2,15.2),vanPoint(32.2,side*6.4,18),vanPoint(32.2,side*6.2,18),dark);
    }
    vanPrism(34.2,34.4,-2.8,2.8,5.2,6.5,[.86,.87,.79]);
    for(let i=0;i<7;i++) vanPrism(34.41,34.43,-2.2+i*.65,-1.95+i*.65,5.55,6.05,dark);
    // Round flue and overhanging rain cap replace the square chimney.
    const flue=(radius,bottom,top,color)=>{
      for(let i=0;i<32;i++) {
        const a=i*Math.PI/16,b=(i+1)*Math.PI/16;
        quad(vanPoint(-13+radius*Math.cos(a),radius*Math.sin(a),bottom),vanPoint(-13+radius*Math.cos(b),radius*Math.sin(b),bottom),
          vanPoint(-13+radius*Math.cos(b),radius*Math.sin(b),top),vanPoint(-13+radius*Math.cos(a),radius*Math.sin(a),top),color.map(c=>c*(.7+.3*Math.cos(a)**2)));
        tri(vanPoint(-13,0,top),vanPoint(-13+radius*Math.cos(a),radius*Math.sin(a),top),vanPoint(-13+radius*Math.cos(b),radius*Math.sin(b),top),color);
      }
    };
    flue(2.2,34,44.5,dark);flue(2.6,35,35.5,steel);flue(1,44.5,47,dark);flue(3.7,47,47.7,dark);
    // Four wheels touch the grass; rounded shoulders, recessed rims and lug nuts.
    for (const axle of [-22,22]) for (const side of [-1,1]) {
      const outer = side * 13.2, inner = side * 10.3;
      const wheelCenter = vanPoint(axle,outer,4.7);
      ring(axle,inner,4.7,4.6,outer-inner,[.075,.08,.078]);
      const face=outer+side*.1;
      for(let i=0;i<40;i++) {
        const a=i*Math.PI/20,b=(i+1)*Math.PI/20;
        const disk=(r,color,z)=>tri(vanPoint(axle,z,4.7),vanPoint(axle+r*Math.cos(a),z,4.7+r*Math.sin(a)),vanPoint(axle+r*Math.cos(b),z,4.7+r*Math.sin(b)),color);
        disk(4.5,dark,face);disk(2.75,[.57,.59,.56],face+side*.06);
        disk(2.2,[.31,.34,.33],face+side*.08);disk(1.05,steel,face+side*.14);
      }
      ring(axle,face,4.7,4.35,side*.25,[.13,.14,.135]);
      ring(axle,face+side*.07,4.7,2.65,side*.15,[.69,.71,.67]);
      for(let i=0;i<6;i++) {
        const a=i*Math.PI/3;
        vanPrism(axle+1.5*Math.cos(a)-.16,axle+1.5*Math.cos(a)+.16,face+side*.2,face+side*.32,4.7+1.5*Math.sin(a)-.16,4.7+1.5*Math.sin(a)+.16,[.72,.73,.68]);
      }
    }

    // Floor plan reference: rear benches on both sides of a central aisle;
    this.obstacleMeshes.push({body:window.LPRCampus.vehicleBounds.at(-1).body,start:saunaMeshStart,end:data.length});
    // a lower central walkway, steps to that level and rails at the front;
    // stove front-left, entrance front-right.
    outdoorLighting=false;
    terrainEnabled=false;
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
    terrainEnabled=true;
    const tubForward=57, tubSide=0, tubRadius=14, tubInner=12.6;
    const poolMeshStart=data.length;
    sceneOffsetX=this.poolStop.x-(stop[0]+forwardX*tubForward);
    sceneOffsetZ=this.poolStop.y-(stop[2]+forwardZ*tubForward);
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
    sceneOffsetX=0;sceneOffsetZ=0;
    this.obstacleMeshes.push({body:window.LPRCampus.poolBody,start:poolMeshStart,end:data.length});
    terrainEnabled=false;
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
    for(const person of window.LPRCampus.peopleSites||[]){
      const dx=person.x-stop[0],dz=person.y-stop[2];
      crowdPositions[person.personId]=[dx*forwardX+dz*forwardZ,dx*rightX+dz*rightZ];
    }
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
      const body=window.LPRCampus.registerPerson(index,stop[0]+forwardX*forward+rightX*side,
        stop[2]+forwardZ*forward+rightZ*side);
      this.spectatorMeshes.push({ data: mesh, forward, side, activity, height, armRanges,body });
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
    const shadowSource=new Float32Array(terrain?.mesh(shadows,6)||shadows);
    this.shadowCount = shadowSource.length / 6;
    this.shadowSpatial=this.makeSpatialMesh(shadowSource);
    this.shadowBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, shadowSource, gl.STATIC_DRAW);
    this.buffer = gl.createBuffer();
    this.worldSource=new Float32Array(data);
    this.worldSpatial=this.makeSpatialMesh(this.worldSource);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    this.bindMesh(this.buffer);
  }

  makeSpatialMesh(source, stride=6) {
    const gl=this.gl,count=source.length/stride;
    if(count>65535) {
      this.indexUint32 ??= !!gl.getExtension?.('OES_element_index_uint');
      if(!this.indexUint32) return null; // Safe whole-mesh fallback on older GPUs.
    }
    const cells=new Map(),triangleChunks=new Int32Array(count/3);
    const include=(bounds,x,y,z)=>{
      bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.min(bounds[2],z);
      bounds[3]=Math.max(bounds[3],x);bounds[4]=Math.max(bounds[4],y);bounds[5]=Math.max(bounds[5],z);
    };
    for(let start=0;start<count;start+=3) {
      const bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
      for(let v=start;v<start+3;v++) include(bounds,source[v*stride],source[v*stride+1],source[v*stride+2]);
      // Large ground/road triangles keep their complete bounds and never hide
      // a small cell merely because their centre lies outside the view.
      const wide=bounds[3]-bounds[0]>800 || bounds[5]-bounds[2]>800;
      const key=wide?'large':`${Math.floor((bounds[0]+bounds[3])/800)},${Math.floor((bounds[2]+bounds[5])/800)}`;
      let chunk=cells.get(key);
      if(!chunk) {
        chunk={id:cells.size,indices:[],bounds:[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity]};
        cells.set(key,chunk);
      }
      chunk.indices.push(start,start+1,start+2);triangleChunks[start/3]=chunk.id;
      include(chunk.bounds,...bounds.slice(0,3));include(chunk.bounds,...bounds.slice(3));
    }
    const type=count>65535?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT;
    const chunks=[...cells.values()];
    for(const chunk of chunks) {
      const indices=count>65535?new Uint32Array(chunk.indices):new Uint16Array(chunk.indices);
      chunk.buffer=gl.createBuffer();chunk.count=indices.length;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,chunk.buffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
      delete chunk.indices;
    }
    return {chunks,triangleChunks,type,stride};
  }

  makeViewFrustum(camera,forward,right,up,focal,aspect) {
    const plane=(normal,offset=0)=>({normal,constant:offset-normal.reduce((sum,n,i)=>sum+n*camera[i],0),
      // A small guard band avoids edge flicker from floating point rounding.
      margin:2*Math.hypot(...normal)});
    const side=(axis,tangent,sign)=>forward.map((n,i)=>n*tangent+axis[i]*sign);
    return [plane(forward,-1),plane(forward.map(n=>-n),2000),
      plane(side(right,aspect/focal,1)),plane(side(right,aspect/focal,-1)),
      plane(side(up,1/focal,1)),plane(side(up,1/focal,-1))];
  }

  boundsVisible(bounds) {
    if(!this.viewFrustum) return true;
    return this.viewFrustum.every(({normal,constant,margin})=>{
      // AABB support point furthest into the plane. Reject only if the
      // complete box is outside, including tall crowns and crossing triangles.
      let maximum=constant;
      for(let axis=0;axis<3;axis++) maximum+=normal[axis]*bounds[axis+(normal[axis]>=0?3:0)];
      return maximum>=-margin;
    });
  }

  drawSpatialMesh(spatial,count) {
    const gl=this.gl;
    if(!spatial || !this.viewFrustum) {gl.drawArrays(gl.TRIANGLES,0,count);return;}
    for(const chunk of spatial.chunks) {
      if(!this.boundsVisible(chunk.bounds)) continue;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,chunk.buffer);
      gl.drawElements(gl.TRIANGLES,chunk.count,spatial.type,0);
    }
  }

  expandSpatialBounds(spatial,sourceStart,vertices) {
    if(!spatial) return;
    // Indices keep referring to the original vertex buffer after an impact.
    // Extend affected cells to include moved/deformed vertices. Keeping the
    // original extent is conservative and also covers an obstacle reset.
    const stride=spatial.stride;
    for(let i=0;i<vertices.length;i+=stride) {
      const triangle=Math.floor((sourceStart+i)/(stride*3));
      const bounds=spatial.chunks[spatial.triangleChunks[triangle]].bounds;
      for(let axis=0;axis<3;axis++) {
        bounds[axis]=Math.min(bounds[axis],vertices[i+axis]);
        bounds[axis+3]=Math.max(bounds[axis+3],vertices[i+axis]);
      }
    }
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
    gl.uniform1i(this.locations.material,0);
    gl.uniform1i(this.locations.vehicle,0);
    gl.disableVertexAttribArray(this.locations.normal);
    gl.vertexAttrib3f(this.locations.normal,0,1,0);
  }

  drawCampusMaterials() {
    const gl=this.gl;
    for(const mesh of this.materialMeshes) {
      this.bindMesh(mesh.buffer);
      gl.vertexAttribPointer(this.locations.position,3,gl.FLOAT,false,32,0);
      gl.vertexAttribPointer(this.locations.color,3,gl.FLOAT,false,32,12);
      gl.enableVertexAttribArray(this.locations.uv);
      gl.vertexAttribPointer(this.locations.uv,2,gl.FLOAT,false,32,24);
      gl.uniform1i(this.locations.material,mesh.material);
      this.drawSpatialMesh(mesh.spatial,mesh.count);
    }
    gl.uniform1i(this.locations.material,0);
  }

  makeKerbs(points, at, inner, outer) {
    const gl=this.gl;let vertices=[];
    const lengths = points.map((point,i) => {
      const next=points[(i+1)%points.length];
      return Math.hypot(next.x-point.x,next.y-point.y);
    });
    const total=lengths.reduce((sum,length)=>sum+length,0);
    // Whole repeats close the loop without a broken paint block at the start line.
    const repeatLength=total/Math.max(1,Math.round(total/36));
    for(const side of [-1,1]) {
      let distance=0;
      // A low raised crown and bevels catch light without changing the road width.
      const profile=[[inner,.06,.72],[inner+.65,.65,1],
        [outer-.65,.65,1],[outer,.02,.63]];
      for(let i=0;i<points.length;i++) {
        const next=(i+1)%points.length;
        const u0=distance/repeatLength+(side<0?.5:0);
        const u1=(distance+lengths[i])/repeatLength+(side<0?.5:0);
        for(let band=0;band<profile.length-1;band++) {
          const a=profile[band],b=profile[band+1];
          const corners=[at(i,side*a[0],a[1]),at(next,side*a[0],a[1]),
            at(next,side*b[0],b[1]),at(i,side*b[0],b[1])];
          const uv=[[u0,0],[u1,0],[u1,1],[u0,1]];
          for(const index of [0,1,2,0,2,3]) {
            const light=(index<2?a[2]:b[2]);
            vertices.push(...corners[index],light,light,light,...uv[index]);
          }
        }
        distance+=lengths[i];
      }
    }
    vertices=window.LPRTrackObjects?.terrain?.mesh(vertices,8,true)||vertices;
    const buffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    // Power-of-two paint texture: trilinear mipmaps average distant stripes
    // instead of leaving high-contrast subpixel triangles to flicker.
    const pixels=new Uint8Array(256*4*4);
    for(let y=0;y<4;y++) for(let x=0;x<256;x++) {
      const color=x<128?[171,39,34]:[232,229,213];
      pixels.set([...color,255],(y*256+x)*4);
    }
    const texture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,256,4,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
    if(anisotropy) gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
      Math.min(8,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    this.kerbMesh={buffer,texture,count:vertices.length/8,spatial:this.makeSpatialMesh(vertices,8)};
  }

  makeRoadPaint(points, at, edgeLine) {
    const gl=this.gl;let vertices=[];
    const lengths=points.map((p,i)=>Math.hypot(points[(i+1)%points.length].x-p.x,
      points[(i+1)%points.length].y-p.y));
    const total=lengths.reduce((sum,value)=>sum+value,0);
    const dashPeriod=total/Math.max(1,Math.round(total/120));
    const textureRepeat=total/Math.max(1,Math.round(total/40));
    const segment=(i,left,right,start,end,distance,tint=1) => {
      const next=(i+1)%points.length;
      const interpolate=offset=>{
        const a=at(i,offset,.075),b=at(next,offset,.075);
        return [a.map((v,k)=>v+(b[k]-v)*start),a.map((v,k)=>v+(b[k]-v)*end)];
      };
      const a=interpolate(left),b=interpolate(right);
      const corners=[a[0],a[1],b[1],b[0]];
      const v0=(distance+lengths[i]*start)/textureRepeat;
      const v1=(distance+lengths[i]*end)/textureRepeat;
      const uv=[[0,v0],[0,v1],[1,v1],[1,v0]];
      for(const index of [0,1,2,0,2,3]) vertices.push(...corners[index],tint,tint,tint,...uv[index]);
    };
    let distance=0;
    for(let i=0;i<points.length;i++) {
      segment(i,-edgeLine,-edgeLine+.9,0,1,distance);
      segment(i,edgeLine-.9,edgeLine,0,1,distance);
      // Clip every dash against the road segments, so paint follows bends
      // instead of connecting its endpoints with a chord across the asphalt.
      const end=distance+lengths[i];
      for(let period=Math.floor(distance/dashPeriod);period*dashPeriod<end;period++) {
        const from=Math.max(distance,period*dashPeriod);
        const to=Math.min(end,period*dashPeriod+dashPeriod*.4);
        if(to>from) segment(i,-.7,.7,(from-distance)/lengths[i],
          (to-distance)/lengths[i],distance,.92);
      }
      distance=end;
    }
    vertices=window.LPRTrackObjects?.terrain?.mesh(vertices,8,true)||vertices;
    const buffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    const width=128,height=256,pixels=new Uint8Array(width*height*4);
    let seed=7241;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const grain=random(),across=x/(width-1);
      const edge=.035+.009*Math.sin(y*.19)+.005*Math.sin(y*.53);
      const coverage=Math.max(0,Math.min(1,(Math.min(across,1-across)-edge)/.025));
      // Small chips expose the real asphalt beneath; translucent aggregate
      // and uneven application avoid the appearance of a solid white ribbon.
      const chip=grain<.035?.12:grain<.10?.55:1;
      const worn=.86+.10*Math.sin(y*.08+across*7)*Math.sin(y*.027);
      const shade=.94+grain*.06;
      pixels.set([Math.round(231*shade),Math.round(230*shade),Math.round(217*shade),
        Math.round(255*coverage*chip*worn)],(y*width+x)*4);
    }
    const texture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
    if(anisotropy) gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
      Math.min(8,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    this.roadPaintMesh={buffer,texture,count:vertices.length/8,spatial:this.makeSpatialMesh(vertices,8)};
  }

  drawRoadPaint() {
    if(!this.roadPaintMesh) return;
    const gl=this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    this.drawKerbs(this.roadPaintMesh,6);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  drawKerbs(mesh=this.kerbMesh,material=5) {
    const gl=this.gl;
    if(!mesh) return;
    this.bindMesh(mesh.buffer);
    gl.vertexAttribPointer(this.locations.position,3,gl.FLOAT,false,32,0);
    gl.vertexAttribPointer(this.locations.color,3,gl.FLOAT,false,32,12);
    gl.enableVertexAttribArray(this.locations.uv);
    gl.vertexAttribPointer(this.locations.uv,2,gl.FLOAT,false,32,24);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,mesh.texture);
    gl.uniform1i(this.locations.texture,0);
    gl.uniform1i(this.locations.material,material);
    this.drawSpatialMesh(mesh.spatial,mesh.count);
    gl.uniform1i(this.locations.material,0);
  }

  makeSaunaArtwork(point) {
    if(typeof Image==='undefined') return;
    const gl=this.gl;let vertices=[];
    // Projective mapping removes the photograph's perspective using its four wall corners.
    const corners=[[540,119],[859,172],[858,397],[528,438]];
    const [a,b,c,d]=corners;
    const dx1=b[0]-c[0],dx2=d[0]-c[0],dx3=a[0]-b[0]+c[0]-d[0];
    const dy1=b[1]-c[1],dy2=d[1]-c[1],dy3=a[1]-b[1]+c[1]-d[1];
    const determinant=dx1*dy2-dx2*dy1;
    const g=(dx3*dy2-dx2*dy3)/determinant,h=(dx1*dy3-dx3*dy1)/determinant;
    const vertex=(u,v,side)=>{
      const divisor=g*u+h*v+1;
      const px=((b[0]-a[0]+g*b[0])*u+(d[0]-a[0]+h*d[0])*v+a[0])/divisor;
      const py=((b[1]-a[1]+g*b[1])*u+(d[1]-a[1]+h*d[1])*v+a[1])/divisor;
      return [...point(11-44*u,side*12.65,34-26*v),.92,.92,.92,px/960,py/639];
    };
    for(const side of [-1,1]) for(let y=0;y<16;y++) for(let x=0;x<24;x++) {
      const a=vertex(x/24,y/16,side),b=vertex((x+1)/24,y/16,side);
      const c=vertex((x+1)/24,(y+1)/16,side),d=vertex(x/24,(y+1)/16,side);
      vertices.push(...a,...b,...c,...a,...c,...d);
    }
    vertices=window.LPRTrackObjects?.terrain?.mesh(vertices,8,false)||vertices;
    const mesh={buffer:gl.createBuffer(),texture:gl.createTexture(),count:vertices.length/8,ready:false,source:new Float32Array(vertices)};
    this.saunaArtwork=mesh;
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    const image=new Image();
    image.onload=()=>{
      gl.bindTexture(gl.TEXTURE_2D,mesh.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      mesh.ready=true;
    };
    image.src='assets/sauna-reference.jpg';
  }

  makeSaleFacade(faces) {
    if(typeof document==='undefined') return;
    const gl=this.gl;let vertices=[];
    const canvas=document.createElement('canvas');
    canvas.width=1024;canvas.height=512;
    const ctx=canvas.getContext('2d');
    // One mipmapped atlas keeps the sign smooth and all posters in one draw call.
    ctx.fillStyle='#e00024';ctx.beginPath();ctx.arc(128,128,125,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='white';ctx.font='italic 900 94px Arial';ctx.textAlign='center';
    ctx.fillText('Sale',128,160);
    ctx.fillStyle='#46514a';ctx.fillRect(256,0,512,128);
    ctx.fillStyle='#d8d9ce';ctx.font='bold 65px Arial';
    ctx.fillText('YOLO',512,85);
    // Muted sky and bare-tree reflections for this building's glass, without
    // the generic glass material's heavy bevel around every window pane.
    ctx.save();ctx.beginPath();ctx.rect(768,0,256,256);ctx.clip();
    const reflection=ctx.createLinearGradient(768,0,768,256);
    reflection.addColorStop(0,'#61706c');reflection.addColorStop(.45,'#47544c');
    reflection.addColorStop(1,'#28372e');ctx.fillStyle=reflection;ctx.fillRect(768,0,256,256);
    ctx.fillStyle='rgba(142,151,131,.16)';
    ctx.fillRect(792,108,36,148);ctx.fillRect(926,142,48,114);
    ctx.strokeStyle='rgba(18,29,22,.44)';ctx.lineCap='round';
    const branch=(x,y,length,angle,width,depth)=>{
      const ex=x+Math.cos(angle)*length,ey=y+Math.sin(angle)*length;
      ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();
      if(depth>0) {
        branch(ex,ey,length*.69,angle-.48,width*.58,depth-1);
        branch(ex,ey,length*.63,angle+.59,width*.52,depth-1);
      }
    };
    branch(846,280,98,-1.55,5,5);branch(995,275,80,-1.78,4,5);
    ctx.strokeStyle='rgba(163,174,160,.17)';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(779,210);ctx.lineTo(960,20);ctx.stroke();ctx.restore();
    for(let i=0;i<10;i++) {
      const left=i*100,top=256;
      ctx.fillStyle=i%3===2 ? '#377b42' : '#ffcb29';ctx.fillRect(left,top,100,256);
      ctx.fillStyle=i%3===2 ? '#eae9d4' : '#e29a36';
      for(let j=0;j<3;j++) {ctx.beginPath();ctx.ellipse(left+25+j*24,top+170-(j%2)*25,20,35,.3,0,Math.PI*2);ctx.fill();}
      ctx.fillStyle=i%3===2 ? 'white' : '#cf1730';ctx.font='italic bold 32px Arial';ctx.fillText(i%3===2 ? 'Tuoretta' : 'Sale',left+50,top+52);
      ctx.font='bold 12px Arial';ctx.fillText('OMAN KYL\u00c4N KAUPPA',left+50,top+231);
    }
    for(const [id,points] of Object.entries(faces)) {
      const i=Number(id.replace('poster',''));
      const bounds=id==='sign' ? [0,0,256,256] : id==='yolo' ? [256,0,512,128] :
        id.startsWith('glass') ? [768,0,256,256] : [i*100,256,100,256];
      const [x,y,w,h]=bounds,uv=[[x,y+h],[x+w,y+h],[x+w,y],[x,y]];
      if(id.startsWith('glass')) {
        // Reflections span several panes and floors, rather than repeating
        // a complete miniature tree in each individual pane.
        const centerX=(points[0][0]+points[1][0])/2,origin=Math.floor(centerX/72)*72;
        for(let j=0;j<4;j++) {
          uv[j][0]=x+w*Math.max(0,Math.min(1,(points[j][0]-origin)/72));
          uv[j][1]=y+h*(1-Math.max(0,Math.min(1,points[j][1]/70)));
        }
      }
      for(const index of [0,1,2,0,2,3]) vertices.push(...points[index],1,1,1,uv[index][0]/1024,uv[index][1]/512);
    }
    vertices=window.LPRTrackObjects?.terrain?.mesh(vertices,8,false)||vertices;
    const mesh={buffer:gl.createBuffer(),texture:gl.createTexture(),count:vertices.length/8};
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D,mesh.texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.generateMipmap(gl.TEXTURE_2D);
    this.saleFacade=mesh;
  }

  makeSaleInteriorDetails(faces) {
    if(typeof document==='undefined') return;
    const entries=Object.entries(faces),vertices=[];
    const canvas=document.createElement('canvas');canvas.width=1024;
    canvas.height=2**Math.ceil(Math.log2(Math.max(128,Math.ceil(entries.length/4)*128)));
    const ctx=canvas.getContext('2d');
    const departments={dairy:'MAITOTUOTTEET',groceries:'RUOKAKAAPPI',
      drinks:'JUOMAT',household:'KODIN TARVIKKEET',sweets:'MAKEISET',checkout:'KASSA',
      returns:'PALAUTA PULLOT',welcome:'TERVETULOA',exit:'ULOS'};
    // Illustrative shelf prices, never a live store price feed.
    const prices={riisi:'3,49',pasta:'0,89',kaurahiutaleet:'1,59',kahvi:'6,49',tee:'2,79',
      tomaattimurska:'1,69',hernekeitto:'1,39',nuudelit:'0,79',maito:'1,19',jogurtti:'0,69',
      juusto:'5,49',maitorahka:'1,09',kuohukerma:'1,59',ruokakerma:'0,99',smetana:'1,39',
      kermaviili:'0,79',voi:'4,29','hartwall-vichy':'2,39','coca-cola':'3,19',
      'ekstroms-vadelma':'2,59','marli-juissi':'1,89',megaforce:'1,29',karjala:'1,69',
      talouspaperi:'3,99',astianpesuaine:'2,89'};
    entries.forEach(([id,quads],index)=>{
      const x=(index%4)*256,y=Math.floor(index/4)*128;
      const price=id==='price' || id.startsWith('price-');
      const product=window.LPRSale.products.find(p=>p.id===(price ? id.slice(6) : id));
      ctx.fillStyle=price ? '#fffdf4' : id==='sale' ? '#cd1531' : id==='till' ? '#122d25' : '#205257';
      ctx.fillRect(x,y,256,128);
      ctx.textAlign='center';ctx.fillStyle=price ? '#222b29' : '#fff';
      if(price) {
        ctx.font='19px Arial';ctx.fillText(product?.name || 'Sale',x+128,y+24,236);
        ctx.font='bold 62px Arial';ctx.fillText(prices[product?.id] || '1,89',x+163,y+87,164);
        ctx.font='16px Arial';ctx.fillText('€ / kpl',x+182,y+112);
        for(let bar=0;bar<32;bar++) {
          const width=bar%3===0 ? 3 : 1;
          ctx.fillRect(x+12+bar*2,y+44,width,47-(bar%4)*3);
        }
        ctx.font='13px Arial';ctx.fillText('S-kaupat',x+47,y+112);
      } else if(id==='sale') {
        ctx.font='italic bold 100px Arial';ctx.fillText('Sale',x+128,y+97,230);
      } else if(id==='till') {
        ctx.font='20px monospace';ctx.fillText('TERVETULOA',x+128,y+39);
        ctx.font='bold 42px monospace';ctx.fillText('0,00 €',x+128,y+94);
      } else if(id==='entrance-glass') {
        const glass=ctx.createLinearGradient(x,y,x+256,y+128);
        glass.addColorStop(0,'#94a8a6');glass.addColorStop(.46,'#647b77');
        glass.addColorStop(1,'#3c5550');ctx.fillStyle=glass;ctx.fillRect(x,y,256,128);
        ctx.fillStyle='#50685f';ctx.fillRect(x,y+69,256,15);
        ctx.fillStyle='#7e8780';ctx.fillRect(x,y+84,256,44);
        ctx.fillStyle='rgba(222,236,228,.16)';
        ctx.beginPath();ctx.moveTo(x+15,y);ctx.lineTo(x+55,y);
        ctx.lineTo(x+170,y+128);ctx.lineTo(x+130,y+128);ctx.fill();
        ctx.fillStyle='rgba(230,239,233,.1)';ctx.fillRect(x+210,y,5,128);
      } else {
        ctx.fillStyle='#f2c51b';ctx.fillRect(x,y+118,256,10);
        ctx.fillStyle='#fff';ctx.font='bold 29px Arial';
        const title=departments[id] || product?.name.toLocaleUpperCase('fi');
        ctx.fillText(title || id,x+128,y+76,238);
      }
      const uv=[[x,y+128],[x+256,y+128],[x+256,y],[x,y]];
      for(const points of quads) for(const i of [0,1,2,0,2,3]) vertices.push(...points[i],1,1,1,uv[i][0]/canvas.width,uv[i][1]/canvas.height);
    });
    const gl=this.gl,mesh={buffer:gl.createBuffer(),texture:gl.createTexture(),count:vertices.length/8};
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D,mesh.texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.generateMipmap(gl.TEXTURE_2D);
    this.saleInteriorDetails=mesh;
  }

  makeSaleCashier(vertices) {
    if(typeof Image==='undefined' || typeof document==='undefined') return;
    const gl=this.gl,mesh={buffer:gl.createBuffer(),texture:gl.createTexture(),count:vertices.length/8,ready:false,
      vertices:new Float32Array(vertices),posedVertices:new Float32Array(vertices)};
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.DYNAMIC_DRAW);
    const reference=new Image();
    reference.onload=()=>{
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
      canvas.getContext('2d').drawImage(reference,0,0,512,512);
      gl.bindTexture(gl.TEXTURE_2D,mesh.texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);mesh.ready=true;
    };
    reference.src='assets/sale-cashier-reference.jpg';
    this.saleCashier=mesh;
  }

  makeSaleProducts(faces) {
    this.saleProducts=[];
    if(typeof document==='undefined' || typeof Image==='undefined') return;
    const gl=this.gl;
    for(const product of window.LPRSale.products) {
      const vertices=faces[product.id];
      if(!vertices?.length) continue;
      const mesh={buffer:gl.createBuffer(),texture:gl.createTexture(),count:vertices.length/8,ready:false,dairy:!!product.dairy};
      gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
      this.saleProducts.push(mesh);
      const image=product.image ? new Image() : document.createElement('canvas');
      if(product.packageLabel && !product.image) {
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
        ctx.fillStyle='#27372a';ctx.font='16px Arial';ctx.fillText(product.amount || (product.id==='maito' ? '1 L' : product.id==='astianpesuaine' ? '500 ml' : product.id==='talouspaperi' ? '2 rullaa' : '500 g'),128,281,108);
      }
      if(product.dairy && !product.image) {
        const ctx=image.getContext('2d');
        ctx.fillStyle='#f9fcf6';ctx.fillRect(10,130,236,111);
        ctx.fillStyle=product.shape==='tub' ? '#b7597c' : '#337baa';
        ctx.beginPath();ctx.ellipse(128,188,42,36,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#fff';ctx.font='bold 22px Arial';ctx.textAlign='center';
        ctx.fillText(product.shape==='tub' ? 'PEHME\u00c4' : 'RAIKAS',128,195);
        ctx.fillStyle='#365448';ctx.font='14px Arial';ctx.fillText('S\u00c4ILYT\u00c4 KYLM\u00c4SS\u00c4',128,237);
      }
      if(product.candyLabel && !product.image) {
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
        const palette=product.id==='salmiakki-mix' ?
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
      if(product.image) image.src=product.image;
      else image.onload();
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
      gl.uniform1i(this.locations.material,mesh.dairy ? 7 : 0);
      gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
      gl.vertexAttribPointer(this.locations.position,3,gl.FLOAT,false,32,0);
      gl.vertexAttribPointer(this.locations.color,3,gl.FLOAT,false,32,12);
      gl.vertexAttribPointer(this.locations.uv,2,gl.FLOAT,false,32,24);
      gl.bindTexture(gl.TEXTURE_2D,mesh.texture);
      gl.drawArrays(gl.TRIANGLES,0,mesh.count);
    }
    this.bindMesh(this.saleBuffer);
  }

  updateSuspension(car, now) {
    // Rendering reads physics; presentation rate cannot drive suspension.
    const state=car.suspension || {pitch:0,roll:0};
    const c=Math.cos(car.angle),s=Math.sin(car.angle),cp=Math.cos(state.pitch),sp=Math.sin(state.pitch);
    const cr=Math.cos(state.roll),sr=Math.sin(state.roll);
    const forward=[c*cp,sp,s*cp],right=[-s*cr-c*sp*sr,cp*sr,c*cr-s*sp*sr];
    const up=[s*sr-c*sp*cr,cp*cr,-c*sr-s*sp*cr];
    return {forward,right,up,heave:(state.heave || 0)*10,centreHeight:(state.centreHeight || 0)*10};
  }

  drawWheels(car, now) {
    const gl = this.gl;
    let vertices = [];
    let normals=[];
    // The untransformed path also supports geometry inspection without WebGL.
    const cached = this.locations.meshTransform != null;
    const spec=window.LPRVehicleSpec;
    const geometry=window.LPRCampus?.carGeometry;
    const damage=car.damage || 0;
    const revision=`${damage}/${car.impactSide || .3}/${!!car.crashed}`;
    if(cached && (this.vehicleRevision!==revision || this.vehicleSpec!==spec || this.vehicleGeometry!==geometry)) {
      for(const part of this.vehicleParts?.values() || []) {
        gl.deleteBuffer(part.buffer);gl.deleteBuffer(part.normalBuffer);
      }
      this.vehicleParts=new Map();this.vehicleRevision=revision;
      this.vehicleSpec=spec;this.vehicleGeometry=geometry;
    }
    const part=(key,origin,forward,up,right,floor,build)=>{
      if(!cached) {build();return;}
      let mesh=this.vehicleParts.get(key);
      if(!mesh) {
        const dynamicVertices=vertices,dynamicNormals=normals;
        vertices=[];normals=[];build();
        // Store in local space once. Subsequent frames change only uniforms.
        const local=new Float32Array(vertices.length),localNormals=new Float32Array(normals.length);
        for(let i=0,n=0;i<vertices.length;i+=6,n+=3) {
          const x=vertices[i]-origin[0],y=vertices[i+1]-origin[1],z=vertices[i+2]-origin[2];
          local[i]=x*forward[0]+y*forward[1]+z*forward[2];
          local[i+1]=x*up[0]+y*up[1]+z*up[2];
          local[i+2]=x*right[0]+y*right[1]+z*right[2];
          local[i+3]=vertices[i+3];local[i+4]=vertices[i+4];local[i+5]=vertices[i+5];
          for(const [axis,basis] of [forward,up,right].entries())
            localNormals[n+axis]=normals[n]*basis[0]+normals[n+1]*basis[1]+normals[n+2]*basis[2];
        }
        mesh={buffer:gl.createBuffer(),normalBuffer:gl.createBuffer(),count:local.length/6};
        gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.bufferData(gl.ARRAY_BUFFER,local,gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER,mesh.normalBuffer);gl.bufferData(gl.ARRAY_BUFFER,localNormals,gl.STATIC_DRAW);
        this.vehicleParts.set(key,mesh);vertices=dynamicVertices;normals=dynamicNormals;
      }
      this.bindMesh(mesh.buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER,mesh.normalBuffer);
      gl.enableVertexAttribArray(this.locations.normal);
      gl.vertexAttribPointer(this.locations.normal,3,gl.FLOAT,false,12,0);
      gl.uniform1i(this.locations.vehicle,1);
      gl.uniform3f(this.locations.carOrigin,car.x,0,car.y);
      gl.uniform3f(this.locations.carForward,Math.cos(car.angle),0,Math.sin(car.angle));
      gl.uniform3f(this.locations.carRight,-Math.sin(car.angle),0,Math.cos(car.angle));
      gl.uniform1i(this.locations.meshTransform,1);
      gl.uniform3f(this.locations.meshOrigin,...origin);
      gl.uniform3f(this.locations.meshForward,...forward);
      gl.uniform3f(this.locations.meshUp,...up);
      gl.uniform3f(this.locations.meshRight,...right);
      gl.uniform1f(this.locations.meshFloor,floor);
      gl.drawArrays(gl.TRIANGLES,0,mesh.count);
      gl.uniform1i(this.locations.meshTransform,0);
    };
    const vertex = (p,color,normal) => {
      vertices.push(p[0],p[1],p[2],color[0],color[1],color[2]);normals.push(...normal);
    };
    const triangle = (a,b,c,color,smooth) => {
      const u=b.map((v,i)=>v-a[i]),v=c.map((value,i)=>value-a[i]);
      const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const length=Math.hypot(...n)||1,normal=n.map(value=>value/length);
      vertex(a,color,smooth?.[0]||normal);vertex(b,color,smooth?.[1]||normal);vertex(c,color,smooth?.[2]||normal);
    };
    const quad = (a,b,c,d,color,smooth) => {
      triangle(a,b,c,color,smooth&&[smooth[0],smooth[1],smooth[2]]);
      triangle(a,c,d,color,smooth&&[smooth[0],smooth[2],smooth[3]]);
    };
    const bodyForward = [Math.cos(car.angle),Math.sin(car.angle)];
    const bodyRight = [-bodyForward[1],bodyForward[0]];
    const pose=this.vehiclePose || {forward:[bodyForward[0],0,bodyForward[1]],right:[bodyRight[0],0,bodyRight[1]],up:[0,1,0]};
    const visualSteerAngle = this.visualSteeringAngle(car);
    const steeredAngle = car.angle + visualSteerAngle;
    const wheelForward = [Math.cos(steeredAngle),Math.sin(steeredAngle)];
    const axleDirection = [-wheelForward[1],wheelForward[0]];
    const units=1/spec.metresPerWorldUnit;
    const radius=spec.tyreDiameter*units/2;
    const segments = 48;
    const tyreBlack = [.075,.085,.09];
    const sidewall = [.11,.12,.125];
    const rim = [.38,.42,.43];
    const frameGreen = [.045,.075,.065];
    if (this.lastWheelFrame) this.wheelPhase += Math.min((now-this.lastWheelFrame)/1000,.05) * (car.vx || 0) / (spec.tyreDiameter/2);
    this.lastWheelFrame = now;

    const rod = (a,b,width,color) => {
      const axis=b.map((value,i)=>value-a[i]),length=Math.hypot(...axis)||1;
      const direction=axis.map(value=>value/length);
      const reference=Math.abs(direction[1])>.95?[1,0,0]:[0,1,0];
      const perpendicular=[direction[1]*reference[2]-direction[2]*reference[1],
        direction[2]*reference[0]-direction[0]*reference[2],direction[0]*reference[1]-direction[1]*reference[0]];
      const span=Math.hypot(...perpendicular)||1;
      const u=perpendicular.map(value=>value/span);
      const v=[direction[1]*u[2],direction[2]*u[0]-direction[0]*u[2],-direction[1]*u[0]];
      const normal=angle=>u.map((value,i)=>value*Math.cos(angle)+v[i]*Math.sin(angle));
      const point=(origin,n)=>origin.map((value,i)=>value+n[i]*width);
      for(let segment=0;segment<8;segment++) {
        const n=normal(segment*Math.PI/4),next=normal((segment+1)*Math.PI/4);
        quad(point(a,n),point(b,n),point(b,next),point(a,next),color,[n,n,next,next]);
      }
    };
    const bodyPoint=(forward,side,height)=> {
      forward*=spec.bodyLengthScale;height*=spec.bodyHeightScale;
      // Crumple the nose and bend the suspension toward the struck side.
      const crush=Math.max(0,forward-2)*damage;
      const damagedForward=forward-crush*.55;
      const damagedSide=side+(car.impactSide || .3)*crush*.25;
      return [
        car.x+pose.forward[0]*damagedForward+pose.right[0]*damagedSide+pose.up[0]*(height-crush*.12-(pose.centreHeight || 0)),
        (pose.heave || 0)+(pose.centreHeight || 0)+pose.forward[1]*damagedForward+pose.right[1]*damagedSide+pose.up[1]*(height-crush*.12-(pose.centreHeight || 0)),
        car.y+pose.forward[2]*damagedForward+pose.right[2]*damagedSide+pose.up[2]*(height-crush*.12-(pose.centreHeight || 0))
      ];
    };

    const bodyBlack = [.055,.075,.065];
    const bodyShade = [.028,.042,.035];
    const cockpitBlack = [.035,.055,.055];
    const teamGreen = [.035,.62,.23];
    const liveryAccent = [.16,.9,.44];
    const bodyWhite = [.78,.86,.81];
    const glyphs={
      H:['10001','10001','10001','11111','10001','10001','10001'],
      O:['01110','10001','10001','10001','10001','10001','01110'],
      Z:['11111','00001','00010','00100','01000','10000','11111'],
      L:['10000','10000','10000','10000','10000','10000','11111'],
      U:['10001','10001','10001','10001','10001','10001','01110'],
      T:['11111','00100','00100','00100','00100','00100','00100'],
      N:['10001','11001','11001','10101','10011','10011','10001'],
      I:['11111','00100','00100','00100','00100','00100','11111'],
      V:['10001','10001','10001','10001','10001','01010','00100'],
      E:['11111','10000','10000','11110','10000','10000','11111'],
      R:['11110','10001','10001','11110','10100','10010','10001'],
      S:['01111','10000','10000','01110','00001','00001','11110'],
      Y:['10001','10001','01010','00100','00100','00100','00100']
    };
    const bodyPart=(key,build)=>part(key,bodyPoint(0,0,0),pose.forward,pose.up,pose.right,-100000,build);
    bodyPart('body',()=>{
      // Make the suspension pickup points visibly part of the open chassis.
      const chassisColor = [.045,.065,.055];
      rod(bodyPoint(1.0,-2.4,1.5),bodyPoint(1.0,2.4,1.5),.22,chassisColor);
      rod(bodyPoint(3.4,-2.4,1.5),bodyPoint(3.4,2.4,1.5),.22,chassisColor);
      rod(bodyPoint(1.8,-2.4,3.5),bodyPoint(1.8,2.4,3.5),.18,chassisColor);
      rod(bodyPoint(4.0,-2.4,3.5),bodyPoint(4.0,2.4,3.5),.18,chassisColor);

      // Student-built concept: compact fairings leave the front tyre keep-out
      // zones clear. The supplied dimensions scale this concept body.
      // Rounded nose sections, tapering ahead of the front axle; no wheel covers.
      const controlSections = geometry?.noseControls || [[-1.2,2.7,4.0],[3,2.75,2.65],[7.5,2.25,2.5],
        [10.8,1.65,2.05],[12,1.1,1.55],[12.4,.65,1.1]];
      // Cubic sections remove the angular breaks in the moulded nose.
      const sections=[];
      const tangent=(index,axis)=>{
        const a=controlSections[Math.max(0,index-1)],b=controlSections[Math.min(controlSections.length-1,index+1)];
        return (b[axis]-a[axis])/(b[0]-a[0]);
      };
      for(let i=0;i<controlSections.length-1;i++) {
        const a=controlSections[i],b=controlSections[i+1],length=b[0]-a[0];
        for(let step=0;step<5;step++) {
          const t=step/5,t2=t*t,t3=t2*t;
          sections.push([a[0]+length*t,...[1,2].map(axis=>
            (2*t3-3*t2+1)*a[axis]+(t3-2*t2+t)*length*tangent(i,axis)
            +(-2*t3+3*t2)*b[axis]+(t3-t2)*length*tangent(i+1,axis))]);
        }
      }
      sections.push(controlSections[controlSections.length-1]);
      if(geometry) sections.splice(0,sections.length,...geometry.noseSections);
      const crown=.48;
      const slope=index=>{
        const a=sections[Math.max(0,index-1)],b=sections[Math.min(sections.length-1,index+1)];
        return (b[2]-a[2])/(b[0]-a[0]);
      };
      const surfacePoint=(f,w,h,t)=>bodyPoint(f,w*t,h+crown*(1-t*t));
      const surfaceNormal=(index,w,t)=>{
        const forward=-slope(index),side=2*crown*t/w;
        const n=pose.up.map((value,i)=>value+pose.forward[i]*forward+pose.right[i]*side);
        const length=Math.hypot(...n);return n.map(value=>value/length);
      };
      const bands=[-1,-.86,-.66,-.54,-.50,-.46,-.10,0,.10,.46,.50,.54,.66,.86,1];
      for(let i=0;i<sections.length-1;i++) {
        const [f,w,h]=sections[i], [nf,nw,nh]=sections[i+1];
        for(let band=0;band<bands.length-1;band++) {
          const a=bands[band],b=bands[band+1],mid=Math.abs((a+b)/2);
          const color=mid<.10 ? bodyWhite : mid>.46 && mid<.54 ? liveryAccent
            : mid>.54 && mid<.86 ? teamGreen : bodyBlack;
          quad(surfacePoint(f,w,h,a),surfacePoint(f,w,h,b),surfacePoint(nf,nw,nh,b),surfacePoint(nf,nw,nh,a),color,
            [surfaceNormal(i,w,a),surfaceNormal(i,w,b),surfaceNormal(i+1,nw,b),surfaceNormal(i+1,nw,a)]);
        }
        for(const side of [-1,1]) {
          // Rounded shoulder blends the crown into the vertical lower shell.
          const shoulder=(forward,width,height,t)=>bodyPoint(forward,
            side*(width+.22*Math.sin(t*Math.PI/2)),height-.38*(1-Math.cos(t*Math.PI/2)));
          const shoulderNormal=t=>{
            const lateral=side*Math.sin(t*Math.PI/2),up=Math.cos(t*Math.PI/2);
            return pose.up.map((value,i)=>value*up+pose.right[i]*lateral);
          };
          for(let edge=0;edge<6;edge++) {
            const a=edge/6,b=(edge+1)/6;
            quad(shoulder(f,w,h,a),shoulder(nf,nw,nh,a),shoulder(nf,nw,nh,b),shoulder(f,w,h,b),bodyBlack,
              [shoulderNormal(a),shoulderNormal(a),shoulderNormal(b),shoulderNormal(b)]);
          }
          quad(shoulder(f,w,h,1),shoulder(nf,nw,nh,1),
            bodyPoint(nf,side*(nw+.22),.85),bodyPoint(f,side*(w+.22),.85),bodyShade);
        }
      }
      quad(bodyPoint(12.4,-.65,1.1),bodyPoint(12.4,.65,1.1),
        bodyPoint(12.4,.87,.85),bodyPoint(12.4,-.87,.85),bodyShade);
      // Flush panel fasteners follow the curved body rather than floating above it.
      for(const index of [3,10,17]) {
        const [f,w,h]=sections[index];
        for(const side of [-1,1]) {
          const center=surfacePoint(f,w,h,side*.92);
          const normal=surfaceNormal(index,w,side*.92);
          rod(center,center.map((value,i)=>value+normal[i]*.025),.065,[.42,.44,.43]);
        }
      }
      // Low side fairings sit inside the tyres and below the cockpit rim.
      for(const side of [-1,1]) {
        quad(bodyPoint(-7.8,side*3.1,2.2),bodyPoint(-7.8,side*5.1,1.7),
          bodyPoint(2.8,side*4.5,1.6),bodyPoint(3,side*2.9,2.25),cockpitBlack);
        quad(bodyPoint(-7.8,side*5.1,1.7),bodyPoint(-7.8,side*5.1,.8),
          bodyPoint(2.8,side*4.5,.8),bodyPoint(2.8,side*4.5,1.6),bodyBlack);
        quad(bodyPoint(-6.8,side*5.12,.87),bodyPoint(-6.8,side*5.12,1.0),
          bodyPoint(1.8,side*4.58,1.0),bodyPoint(1.8,side*4.58,.87),teamGreen);
        // Cockpit walls meet the rear section of the nose along a shared edge.
        // The driver opening stays clear between the two longitudinal rails.
        quad(bodyPoint(-9.4,side*2.7,.85),bodyPoint(-1.2,side*2.7,.85),
          bodyPoint(-1.2,side*2.7,4),bodyPoint(-9.4,side*2.7,4),bodyBlack);
        quad(bodyPoint(-9.4,side*2.7,4),bodyPoint(-1.2,side*2.7,4),
          bodyPoint(-1.2,side*3.1,3.8),bodyPoint(-9.4,side*3.1,3.8),bodyShade);
        rod(bodyPoint(-9.4,side*2.7,4.04),bodyPoint(-1.2,side*2.7,4.04),.13,cockpitBlack);
        rod(bodyPoint(-9.4,side*2.7,4.15),bodyPoint(-1.2,side*2.7,4.15),.035,teamGreen);
      }
      // High contrast university lettering on both sides, 56 mm tall (T12.3).
      // Small geometry glyphs keep it readable without another texture upload.

      for(const side of [-1,1]) {
        const labelPoint=(f,h)=>bodyPoint(f,side*(5.1-(f+7.8)*.6/10.6+.025),h);
        [...'LUT UNIVERSITY'].forEach((letter,index)=>{
          for(const [row,line] of (glyphs[letter] || []).entries()) {
            for(let column=0;column<5;column++) if(line[column]==='1') {
              const f=side===1 ? 1.8-index*.57-column*.08 : -6.3+index*.57+column*.08;
              const next=f+(side===1 ? -.08 : .08);
              const h=1.7-(f+7.8)*.1/10.6-.05-row*.08;
              quad(labelPoint(f,h),labelPoint(next,h),labelPoint(next,h-.08),labelPoint(f,h-.08),[.87,.96,.9]);
            }
          }
        });
      }

    });
        const upright = (a,b,width,color) => {
       quad([a[0]-width,a[1],a[2]],[a[0]+width,a[1],a[2]],
         [b[0]+width,b[1],b[2]],[b[0]-width,b[1],b[2]],color);
       quad([a[0],a[1],a[2]-width],[a[0],a[1],a[2]+width],
         [b[0],b[1],b[2]+width],[b[0],b[1],b[2]-width],color.map(value => value * .78));
        };
        const rollHoop = frameGreen;
        upright(bodyPoint(-9.4,-2.7,2.3),bodyPoint(-8.6,-3.25,10.5),.24*spec.bodyLengthScale,rollHoop);
        upright(bodyPoint(-9.4,2.7,2.3),bodyPoint(-8.6,3.25,10.5),.24*spec.bodyLengthScale,rollHoop);
        rod(bodyPoint(-8.6,-3.25,10.5),bodyPoint(-8.6,3.25,10.5),.24*spec.bodyHeightScale,rollHoop);

    bodyPart('wing',()=>{
      // Split, swept front-wing elements add a clear Formula Student silhouette
      // without filling the open wheel and suspension areas.
      const wingPoint=(side,span,forward,height)=>bodyPoint(forward,side*span,height);
      for(const side of [-1,1]) {
        const stations=[1.35,5.8,10.25];
        const panels=geometry ? geometry.wingPanels.map((panel,i)=>({...panel,color:i?bodyShade:bodyBlack})) : [
          {front:14.1,rear:12.85,sweep:.16,rise:0,color:bodyBlack},
          {front:12.35,rear:11.78,sweep:.13,rise:.12,color:bodyShade}
        ];
        for(const panel of panels) {
          for(let i=0;i<stations.length-1;i++) {
            const a=stations[i],b=stations[i+1];
            const front=(span)=>panel.front-panel.sweep*span;
            const rear=(span)=>panel.rear-panel.sweep*.72*span;
            const height=(span)=>1.62-.055*span+panel.rise;
            // Closed airfoil section gives the wing a rounded leading edge
            // and a tapered trailing edge instead of a single paper-thin quad.
            const foil=(span,t,upper)=>wingPoint(side,span,
              front(span)+(rear(span)-front(span))*t,
              height(span)+(upper ? .13 : -.07)*Math.sin(Math.PI*t));
            for(let chord=0;chord<8;chord++) {
              const t=chord/8,next=(chord+1)/8;
              for(const upper of [true,false]) quad(foil(a,t,upper),foil(a,next,upper),
                foil(b,next,upper),foil(b,t,upper),panel.color);
              for(const span of [a,b]) quad(foil(span,t,true),foil(span,next,true),
                foil(span,next,false),foil(span,t,false),bodyShade);
            }
            const stripeStart=front(a)-.16,stripeEnd=front(b)-.16;
            quad(wingPoint(side,a,stripeStart,height(a)+.035),wingPoint(side,b,stripeEnd,height(b)+.035),
              wingPoint(side,b,stripeEnd-.12,height(b)+.035),wingPoint(side,a,stripeStart-.12,height(a)+.035),teamGreen);
          }
        }
        quad(wingPoint(side,10.05,12.45,.78),wingPoint(side,10.25,12.4,.78),
          wingPoint(side,10.25,11.0,2.05),wingPoint(side,10.05,11.1,2.05),bodyBlack);
        quad(wingPoint(side,10.26,12.24,.82),wingPoint(side,10.28,12.2,.82),
          wingPoint(side,10.28,11.25,1.95),wingPoint(side,10.26,11.3,1.95),teamGreen);
        rod(wingPoint(side,1.5,12.0,1.5),wingPoint(side,6.7,11.2,1.45),.075,[.32,.35,.34]);
      }

    });

    for (const axle of [0,1]) for (const side of [-1,1]) {
      // Wheel centres follow unsprung dynamics rather than chassis rotation.
      const wheel=car.suspension?.wheels[axle*2+(side<0?0:1)];
      const wheelHeight=(wheel?.z || 0)*10;
      const crush=axle===0?6.1*damage:0,forward=(axle===0?spec.frontAxle:-spec.rearAxle)*units-crush*.55,lateral=side*spec.trackWidth*units/2+(car.impactSide || .3)*crush*.25;
      const center=[car.x+bodyForward[0]*forward+bodyRight[0]*lateral,
        radius+wheelHeight,car.y+bodyForward[1]*forward+bodyRight[1]*lateral];
      const uprightPoint=height=>[center[0]-axleDirection[0]*side*1.2,height+wheelHeight,center[2]-axleDirection[1]*side*1.2];
      const bentAngle=axle===0?car.angle+spec.roadWheelAngle(visualSteerAngle,side)+side*damage*.65:car.angle;
      wheelForward[0]=Math.cos(bentAngle); wheelForward[1]=Math.sin(bentAngle);
      axleDirection[0]=-wheelForward[1]; axleDirection[1]=wheelForward[0];
      const point=(axial,rad,theta)=>[
        center[0]+axleDirection[0]*axial+wheelForward[0]*rad*Math.cos(theta),
        cached ? center[1]+rad*Math.sin(theta) : Math.max((wheel?.road || 0)*10,center[1]+rad*Math.sin(theta)),
        center[2]+axleDirection[1]*axial+wheelForward[1]*rad*Math.cos(theta)
      ];
      const radial=r=>r<=1.12?r/1.12*spec.rimDiameter*units/2:
        spec.rimDiameter*units/2+(r-1.12)/1.18*(radius-spec.rimDiameter*units/2);
      const detailPoint=(axial,rad,theta)=>point((rad<=1.12?axial/1.12*spec.rimWidth:axial/1.1872*spec.tyreWidth)*units/2,radial(rad),theta);
      const wheelF=[wheelForward[0],0,wheelForward[1]],wheelU=[0,1,0],wheelR=[axleDirection[0],0,axleDirection[1]];
      const phaseCos=Math.cos(this.wheelPhase),phaseSin=Math.sin(this.wheelPhase);
      const spinF=wheelF.map((v,i)=>v*phaseCos+wheelU[i]*phaseSin);
      const spinU=wheelU.map((v,i)=>v*phaseCos-wheelF[i]*phaseSin);
      const wheelPart=(name,spinning,build)=>part(`${axle}/${side}/${name}`,center,
        spinning?spinF:wheelF,spinning?spinU:wheelU,wheelR,(wheel?.road || 0)*10,build);
      const tyreProfile=geometry?.tyreProfile || [[-1.1,2.08],[-1.03,2.18],[-.78,2.28],[-.48,2.3],
        [.48,2.3],[.78,2.28],[1.03,2.18],[1.1,2.08]].map(([a,r])=>[a/1.1872*spec.tyreWidth*units/2,radial(r)]);
      const tyreNormal=(ring,theta)=>{
        const a=tyreProfile[Math.max(0,ring-1)],b=tyreProfile[Math.min(tyreProfile.length-1,ring+1)];
        const axial=-(b[1]-a[1])/(b[0]-a[0]),length=Math.hypot(axial,1);
        return [(axleDirection[0]*axial+wheelForward[0]*Math.cos(theta))/length,
          Math.sin(theta)/length,(axleDirection[1]*axial+wheelForward[1]*Math.cos(theta))/length];
      };
      const shadowCenter=[center[0],.16+(wheel?.road || 0)*10,center[2]];
      for (let i=0;i<segments;i++) {
        const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
        const shadowPoint=angle=>[
          shadowCenter[0]+wheelForward[0]*2.5*Math.cos(angle)+axleDirection[0]*1.55*Math.sin(angle),
          shadowCenter[1],
          shadowCenter[2]+wheelForward[1]*2.5*Math.cos(angle)+axleDirection[1]*1.55*Math.sin(angle)
        ];
        triangle(shadowCenter,shadowPoint(a),shadowPoint(b),[.065,.075,.075]);
      }
      const pickup=(f,s,h)=>bodyPoint(axle===0?f:f-10,s,h);
      // Double wishbone and steering link, anchored at the narrow chassis.
      rod(pickup(1.0,side*2.4,1.5),uprightPoint(1.7),.17,frameGreen);
      rod(pickup(3.4,side*2.4,1.5),uprightPoint(1.7),.17,frameGreen);
      rod(pickup(1.8,side*2.4,3.5),uprightPoint(3.1),.15,[.13,.16,.18]);
      rod(pickup(4.0,side*2.4,3.5),uprightPoint(3.1),.15,[.13,.16,.18]);
      rod(pickup(5.2,side*2.2,2.2),uprightPoint(2.2),.11,[.36,.38,.37]);
      // Pushrod, damper body and helical spring, tucked inside the wishbones.
      const damperA=pickup(.5,side*2.0,2.35),damperB=pickup(2.8,side*2.3,3.7);
      const restLength=Math.hypot(...damperB.map((v,i)=>v-damperA[i]));
      const damperTravel=(wheel?.travel || 0)*10*(car.suspension?.motionRatio || .7);
      for(let axis=0;axis<3;axis++) damperB[axis]+=(damperA[axis]-damperB[axis])*damperTravel/restLength;
      rod(uprightPoint(1.8),damperB,.085,[.42,.44,.45]);
      const currentLength=Math.hypot(...damperB.map((v,i)=>v-damperA[i]));
      const cylinderEnd=damperA.map((v,i)=>v+(damperB[i]-v)*1.45/currentLength);
      rod(damperA,cylinderEnd,.16,[.24,.27,.28]);
      rod(cylinderEnd,damperB,.065,[.56,.59,.60]);
      const springAxis=damperB.map((v,i)=>v-damperA[i]),springLength=Math.hypot(...springAxis);
      const springU=[bodyRight[0],0,bodyRight[1]];
      const springV=[-springAxis[1]*bodyForward[0]/springLength,
        (springAxis[0]*bodyForward[0]+springAxis[2]*bodyForward[1])/springLength,
        -springAxis[1]*bodyForward[1]/springLength];
      const springPoint=t=>damperA.map((v,i)=>v+springAxis[i]*t+.25*(springU[i]*Math.cos(t*Math.PI*14)+springV[i]*Math.sin(t*Math.PI*14)));
      for(let coil=0;coil<56;coil++) rod(springPoint(coil/56),springPoint((coil+1)/56),.045,[.28,.30,.31]);

      wheelPart('fixed',false,()=>{
        for (let i=0;i<segments;i++) {
          const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
          for(let ring=0;ring<tyreProfile.length-1;ring++) {
            const [x,rad]=tyreProfile[ring],[nx,nrad]=tyreProfile[ring+1];
            quad(point(x,rad,a),point(nx,nrad,a),point(nx,nrad,b),point(x,rad,b),tyreBlack,
              [tyreNormal(ring,a),tyreNormal(ring+1,a),tyreNormal(ring+1,b),tyreNormal(ring,b)]);
          }
          for (const face of [-1.12,1.12]) {
            const faceNormal=[axleDirection[0]*Math.sign(face),0,axleDirection[1]*Math.sign(face)];
            const sideProfile=[[2.08,face],[1.96,face*1.045],[1.68,face*1.055],[1.32,face*1.025],[1.12,face]];
            for(let ring=0;ring<sideProfile.length-1;ring++) {
              const [r,x]=sideProfile[ring],[nr,nx]=sideProfile[ring+1];
              quad(detailPoint(x,r,a),detailPoint(x,r,b),detailPoint(nx,nr,b),detailPoint(nx,nr,a),sidewall,
                [faceNormal,faceNormal,faceNormal,faceNormal]);
            }
            // Subtle raised moulding rings, in rubber rather than silver paint.
            for(const band of [1.79,1.88]) quad(detailPoint(face*1.06,band,a),detailPoint(face*1.06,band,b),
              detailPoint(face*1.06,band-.018,b),detailPoint(face*1.06,band-.018,a),[.085,.095,.10],
              [faceNormal,faceNormal,faceNormal,faceNormal]);
            triangle(detailPoint(face*.65,0,a),detailPoint(face*.65,1.08,a),detailPoint(face*.65,1.08,b),[.09,.105,.11]);
            quad(detailPoint(face,1.12,a),detailPoint(face,1.12,b),detailPoint(face,1.03,b),detailPoint(face,1.03,a),rim);
            quad(detailPoint(face,1.03,a),detailPoint(face,1.03,b),detailPoint(face*.79,1.03,b),detailPoint(face*.79,1.03,a),[.25,.28,.29]);
          }
        }
        for (const face of [-1.16,1.16]) {
          // Recessed brake rotor behind the spokes and a stationary caliper.
          const rotorFace=face*.78;
          for(let i=0;i<segments;i++) {
            const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
            quad(detailPoint(rotorFace,.38,a),detailPoint(rotorFace,.88,a),detailPoint(rotorFace,.88,b),detailPoint(rotorFace,.38,b),[.30,.32,.33]);
          }
          rod(detailPoint(rotorFace,.77,.1),detailPoint(rotorFace,.77,.75),.14,[.18,.19,.20]);
        }
      });
      wheelPart('spin',true,()=>{
        // Nominal Hoosier slick sidewalls; lettering rotates with the tyre.
        for(const face of [-1.185,1.185]) {
          [...spec.tyreBrand.toUpperCase()].forEach((letter,index)=>{
            for(const [row,line] of glyphs[letter].entries()) for(let col=0;col<5;col++) if(line[col]==='1') {
              const a=this.wheelPhase+Math.PI/2+(index*6+col-20)*.025,b=a+.022;
              const r=1.96-row*.035;
              quad(detailPoint(face,r,a),detailPoint(face,r,b),detailPoint(face,r-.03,b),detailPoint(face,r-.03,a),[.75,.73,.60]);
            }
          });
        }
        for (const face of [-1.16,1.16]) {
          for (let spoke=0;spoke<6;spoke++) {
            const angle=this.wheelPhase+spoke*Math.PI/3;
            const root=face*.87;
            quad(detailPoint(root,.25,angle-.15),detailPoint(face,1.0,angle-.075),detailPoint(face,1.0,angle+.075),detailPoint(root,.25,angle+.15),[.48,.51,.52]);
            for(const edge of [-1,1]) quad(detailPoint(root,.25,angle+edge*.15),detailPoint(face,1,angle+edge*.075),
              detailPoint(face-Math.sign(face)*.09,1,angle+edge*.075),detailPoint(root-Math.sign(face)*.09,.25,angle+edge*.15),[.26,.29,.30]);
          }
          for(let bolt=0;bolt<4;bolt++) {
            const angle=this.wheelPhase+bolt*Math.PI/2;
            rod(detailPoint(face+Math.sign(face)*.035,.20,angle),detailPoint(face+Math.sign(face)*.085,.20,angle),.045,[.52,.54,.55]);
          }
          for (let i=0;i<segments;i++) {
            const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
            triangle(detailPoint(face+Math.sign(face)*.03,0,a),detailPoint(face+Math.sign(face)*.03,.28,a),detailPoint(face+Math.sign(face)*.03,.28,b),[.10,.13,.14]);
          }
          // OZ hub badge, without assuming a specific OZ spoke model.
          const badge=(u,v)=>detailPoint(face+Math.sign(face)*.04,Math.hypot(u,v),Math.atan2(v,u)+this.wheelPhase);
          [...'OZ'].forEach((letter,index)=>{
            for(const [row,line] of glyphs[letter].entries()) for(let col=0;col<5;col++) if(line[col]==='1') {
              const u=(index*6+col-5.5)*.029,v=(3-row)*.029;
              quad(badge(u,v),badge(u+.023,v),badge(u+.023,v-.023),badge(u,v-.023),[.86,.88,.85]);
            }
          });
        }
      });
    }

    if(car.crashed) {
      // Broken aluminium and suspension pieces remain beside the wreck.
      for(let i=0;i<7;i++) {
        const side=(i%2?1:-1)*(4+i*.7);
        const a=bodyPoint(5+i*.8,side,.3);
        const b=bodyPoint(6+i*.9,side+1.5,.45);
        rod(a,b,.25,i%2?frameGreen:bodyBlack);
      }
    }
    this.bindMesh(this.wheelBuffer);
    this.vehicleNormalBuffer ||= gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,this.vehicleNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(normals),gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.locations.normal);
    gl.vertexAttribPointer(this.locations.normal,3,gl.FLOAT,false,12,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.wheelBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
    gl.uniform1i(this.locations.vehicle,1);
    gl.uniform3f(this.locations.carOrigin,car.x,0,car.y);
    gl.uniform3f(this.locations.carForward,bodyForward[0],0,bodyForward[1]);
    gl.uniform3f(this.locations.carRight,bodyRight[0],0,bodyRight[1]);
    gl.drawArrays(gl.TRIANGLES,0,vertices.length/6);
    gl.uniform1i(this.locations.vehicle,0);
    gl.disableVertexAttribArray(this.locations.normal);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const mobile = window.matchMedia('(pointer:coarse)').matches;
    // Large desktop / HiDPI canvases otherwise shade millions of pixels per frame.
    // Keep CSS coordinates unchanged for the camera and wheel hit targets.
    const pixelBudget = mobile ? 1000000 : 1200000;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25,
      Math.sqrt(pixelBudget / Math.max(1, this.width * this.height)));
    const pixelWidth = Math.round(this.width * ratio);
    const pixelHeight = Math.round(this.height * ratio);
    if (this.canvas.width === pixelWidth && this.canvas.height === pixelHeight) return;
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.cockpitCanvas.width = this.canvas.width;
    this.cockpitCanvas.height = this.canvas.height;
    this.cockpit.setTransform(ratio,0,0,ratio,0,0);
    this.gl.viewport(0,0,this.canvas.width,this.canvas.height);
  }

  render(car, now = 0) {
    this.viewFrustum=null;
    this.updateVisualSteering(car,now);
    this.updateObstacleMeshes();
    if (car.sale) { this.renderSale(car); return; }
    if (car.pool) { this.renderPool(car, now); return; }
    if (car.sauna) { this.renderSauna(car, now); return; }
    const gl = this.gl;
    // Camera and body share one rigid pose; the horizon moves, not the nose
    // against the steering wheel. Wheel travel remains visible beside the body.
    const pose=this.vehiclePose=this.updateSuspension(car,now);
    const pitch = .055;
    const camera=pose.up.map((value,i)=>value*(8-pose.centreHeight)-pose.forward[i]*8
      +[car.x,pose.centreHeight+pose.heave,car.y][i]);
    const right = pose.right;
    const up = pose.up.map((value,i)=>value*Math.cos(pitch)+pose.forward[i]*Math.sin(pitch));
    const forward=pose.forward.map((value,i)=>value*Math.cos(pitch)-pose.up[i]*Math.sin(pitch));
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    this.bindMesh(this.buffer);
    gl.uniform3f(this.locations.camera,...camera);
    gl.uniform3f(this.locations.forward,...forward);
    gl.uniform3f(this.locations.right,right[0],right[1],right[2]);
    gl.uniform3f(this.locations.up,up[0],up[1],up[2]);
    gl.uniform1f(this.locations.aspect,this.width / this.height);
    const verticalFov = this.width < 650 ? 84 : 72;
    const focal=1 / Math.tan(verticalFov * Math.PI / 360);
    gl.uniform1f(this.locations.focal,focal);
    this.viewFrustum=this.makeViewFrustum(camera,forward,right,up,focal,this.width/this.height);
    gl.uniform1i(this.locations.outdoor,1);
    this.bindMesh(this.skyBuffer);
    gl.uniform1i(this.locations.sky,1);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES,0,6);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.uniform1i(this.locations.sky,0);
    this.bindMesh(this.buffer);
    this.drawSpatialMesh(this.worldSpatial,this.vertexCount);
    this.drawCampusMaterials();
    if(this.saunaArtwork?.ready) this.drawKerbs(this.saunaArtwork);
    this.drawKerbs();
    this.drawRoadPaint();
    this.drawKerbs(this.saleFacade,6);
    this.bindMesh(this.shadowBuffer);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniform1f(this.locations.opacity,.22);
    this.drawSpatialMesh(this.shadowSpatial,this.shadowCount);
    gl.uniform1f(this.locations.opacity,1);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.drawSpectators(car,now);
    this.drawImpactDamage();
    this.drawWheels(car,now);
    this.drawCockpit(car);
  }

  updateObstacleMeshes() {
    const campus=window.LPRCampus,gl=this.gl;
    if(!this.worldSource)return;
    const signature=b=>[b.x,b.y,b.angle,b.damage,b.bend,b.dents.map(d=>d.depth).join(',')].join('/');
    const transform=(source,stride,b)=>{
      const vertices=new Float32Array(source);
      const ground=window.LPRTrackObjects?.terrain?.heightAt(b.origin.x,b.origin.y)||0;
      for(let i=0;i<vertices.length;i+=stride) {
        const p=campus.deformPoint(b,source[i],source[i+1]-ground,source[i+2]);
        vertices[i]=p[0];vertices[i+1]=p[1]+ground;vertices[i+2]=p[2];
      }
      return vertices;
    };
    for(const mesh of this.obstacleMeshes) {
      const key=signature(mesh.body);
      if(key===mesh.poseKey)continue;
      mesh.poseKey=key;
      if(mesh.body.damage===0 && mesh.body.x===mesh.body.origin.x && mesh.body.y===mesh.body.origin.y &&
        mesh.body.angle===mesh.body.origin.angle && !mesh.changed)continue;
      mesh.changed=true;
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
      const vertices=transform(this.worldSource.subarray(mesh.start,mesh.end),6,mesh.body);
      gl.bufferSubData(gl.ARRAY_BUFFER,mesh.start*4,vertices);
      this.expandSpatialBounds(this.worldSpatial,mesh.start,vertices);
    }
    const sauna=campus.vehicleBounds.at(-1).body;
    if(this.saunaArtwork?.source && this.saunaArtwork.poseKey!==signature(sauna)) {
      this.saunaArtwork.poseKey=signature(sauna);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.saunaArtwork.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,transform(this.saunaArtwork.source,8,sauna));
    }
    this.saunaStop={x:sauna.x,y:sauna.y};
    this.poolStop={x:campus.poolBody.x,y:campus.poolBody.y};
  }

  drawImpactDamage() {
    const campus=window.LPRCampus,vertices=[];
    if(!campus?.bodies)return;
    const tri=(a,b,c,color)=>{for(const p of [a,b,c])vertices.push(...p,...color);};
    for(const b of campus.bodies) for(const d of b.dents) {
      const c=Math.cos(b.angle),s=Math.sin(b.angle);
      const nx=d.nx*c-d.ny*s,ny=d.nx*s+d.ny*c;
      const x=b.x+d.x*c-d.y*s-nx*.2,y=b.y+d.x*s+d.y*c-ny*.2;
      const ground=window.LPRTrackObjects?.terrain?.heightAt(x,y)||0;
      const point=(u,h)=>[x-ny*u,h+ground,y+nx*u];
      // Branching cracks and chipped edges stay on the contacted surface.
      const size=Math.min(9,2+d.depth*1.2);
      for(let branch=0;branch<5;branch++) {
        const angle=branch*2.399,dx=Math.cos(angle)*size,dh=Math.sin(angle)*size;
        const a=point(0,6),m=point(dx*.5+(branch%2?.7:-.7),6+dh*.4),end=point(dx,Math.max(.3,6+dh));
        const width=.12+d.depth*.055;
        tri(a,point(dx*.5+width,6+dh*.4),m,[.075,.065,.055]);
        tri(m,point(dx+width,Math.max(.3,6+dh)),end,[.075,.065,.055]);
      }
      if(b.kind==='wall' && d.depth>.3) for(let chip=0;chip<6;chip++) {
        const u=(chip-2.5)*1.5,base=[x-ny*u-nx*(1+chip%3),ground+.15,y+nx*u-ny*(1+chip%3)];
        tri(base,[base[0]+1.2,ground+.25,base[2]],[base[0]+.3,ground+.9,base[2]+1],[.42,.34,.28]);
      }
    }
    if(!vertices.length)return;
    const gl=this.gl;
    this.impactBuffer ||= gl.createBuffer();
    this.bindMesh(this.impactBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES,0,vertices.length/6);
  }

  spectatorPose(mesh,index,now) { return window.LPRPeople.pose(mesh,index,now); }

  updatePeople(now) {
    this.peopleTime=now;
    this.peopleModel ||= window.LPRPeople.create();
    this.peopleModel.update(now);
  }

  drawSpectators(car, now) {
    const frame=this.spectatorFrame,vertices=[],time=now/1000;
    for(const [index,mesh] of this.spectatorMeshes.entries()) {
      const {forward,side,yaw,walking,elevation,phase}=this.spectatorPose(mesh,index,this.peopleTime ?? now);
      const near = Math.hypot(car.x-frame.stop[0],car.y-frame.stop[2]) < 180 && Math.abs(car.speed || 0) > 3;
      const cheer = !mesh.body.damage && mesh.activity === 'cheer' && (near || phase < 7);
      const sip = !mesh.body.damage && mesh.activity === 'drink' ? Math.max(0,Math.sin((time+index*2.7)%11/11*Math.PI*2)) : 0;
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
        const worldX=frame.stop[0]+frame.forwardX*f+frame.rightX*s;
        const worldY=frame.stop[2]+frame.forwardZ*f+frame.rightZ*s;
        const point=window.LPRCampus.deformPoint(mesh.body,worldX,y,worldY);
        vertices.push(point[0],point[1]+(window.LPRTrackObjects?.terrain?.heightAt(point[0],point[2])||0),
          point[2],mesh.data[v+3],mesh.data[v+4],mesh.data[v+5]);
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
      const grip=[bowl[0]-2.7,bowl[1]+.7,bowl[2]];
      // The player's shoulder belongs to their body below the camera, rather
      // than to a fixed spot on the bench. Keep it behind the view so the arm
      // enters the foreground naturally when moving or looking around.
      const yaw=car.saunaYaw || 0, cy=Math.cos(yaw), sy=Math.sin(yaw);
      const bodyPoint=(forward,right,height)=>[
        (car.saunaX ?? 1986)+cy*forward-sy*right,
        height,
        (car.saunaZ ?? side*6)+sy*forward+cy*right
      ];
      const shoulder=bodyPoint(-.8,1.1,14.6), elbow=bodyPoint(1.4,1.5,12.4);
      const skin=[.86,.64,.46];
      rod(shoulder,elbow,.38,skin);
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

  drawSaleCashier(car) {
    const gl=this.gl,{cashierX,cashierZ}=window.LPRSale.checkout;
    // The reference pose faces +X. Rotate the entire solid character about its feet.
    const yaw=Math.atan2(car.saleZ-cashierZ,car.saleX-cashierX);
    if(yaw!==this.saleCashierYaw) {
      const cx=-6000+cashierX,cos=Math.cos(yaw),sin=Math.sin(yaw);
      for(const [mesh,stride] of [[this.saleCashierBody,6],[this.saleCashier,8]]) {
        if(!mesh) continue;
        const source=mesh.vertices,target=mesh.posedVertices;
        for(let i=0;i<source.length;i+=stride) {
          const x=source[i]-cx,z=source[i+2]-cashierZ;
          target[i]=cx+x*cos-z*sin;
          target[i+2]=cashierZ+x*sin+z*cos;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER,0,target);
      }
      this.saleCashierYaw=yaw;
    }
    if(this.saleCashierBody) {
      this.bindMesh(this.saleCashierBody.buffer);
      gl.drawArrays(gl.TRIANGLES,0,this.saleCashierBody.count);
    }
    if(this.saleCashier?.ready) this.drawKerbs(this.saleCashier,6);
  }

  renderSale(car) {
    this.gl.uniform1i(this.locations.outdoor,0);
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
    this.drawSaleCashier(car);
    gl.uniform1i(this.locations.textured,0);
    this.drawKerbs(this.saleInteriorDetails,6);
    this.cockpit.clearRect(0,0,this.width,this.height);
  }

  renderPool(car, now) {
    const previousX = car.saunaX;
    const previousZ = car.saunaZ;
    const previousSauna = car.sauna;
    car.sauna = true;
    car.saunaX = car.poolX ?? (this.poolStop?.x ?? this.saunaStop.x) - 18;
    car.saunaZ = car.poolZ ?? (this.poolStop?.y ?? this.saunaStop.y) + 10;
    this.renderSauna(car, now);
    car.sauna = previousSauna;
    car.saunaX = previousX;
    car.saunaZ = previousZ;
  }

  renderSauna(car, now) {
    this.gl.uniform1i(this.locations.outdoor,0);
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    this.bindMesh(this.buffer);
    const cameraX=car.saunaX??1986,cameraZ=car.saunaZ??(car.saunaSide||-1)*6;
    gl.uniform3f(this.locations.camera,cameraX,18+(car.pool?window.LPRTrackObjects?.terrain?.heightAt(cameraX,cameraZ)||0:0),cameraZ);
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
    // Bodywork and cockpit rails are one 3D assembly; the driver's arms,
    // wheel and instruments share this foreground layer.
    this.drawSteeringWheel(car);
  }

  updateVisualSteering(car,now) {
    const target=window.LPRVehicleSpec.visualRoadWheelAngle(car.steerAngle || 0);
    const previous=this.visualSteering;
    const dt=previous ? (now-previous.time)/1000 : 0;
    if(!previous || previous.car!==car || dt<0 || dt>.25) {
      this.visualSteering={car,time:now,angle:target};
      return;
    }
    // Presentation only: one shared, bounded movement for tyres, wheel and
    // hands. No spring overshoot or artificial opposite steering on release.
    const change=(target-previous.angle)*(1-Math.exp(-18*dt));
    const rate=1.2; // rad/s at the equivalent visual road wheel (306 deg/s at the wheel)
    previous.angle+=Math.max(-rate*dt,Math.min(rate*dt,change));
    previous.time=now;
  }

  visualSteeringAngle(car) {
    return this.visualSteering?.car===car ? this.visualSteering.angle :
      window.LPRVehicleSpec.visualRoadWheelAngle(car.steerAngle || 0);
  }

  steeringWheelLayout(car) {
    const radius=Math.min(this.width*.25,this.height*.17,140);
    const spec=window.LPRVehicleSpec;
    const lock=this.visualSteeringAngle(car)/spec.maxVisualRoadWheelAngle;
    // Leave room for the tall silhouette as the wheel passes through 90 degrees.
    return { x:this.width*.5, y:this.height-radius*1.04-10, radius, angle:lock*spec.maxSteeringWheelAngle };
  }

  steeringWheelActionAt(car, clientX, clientY) {
    if(car.sauna || car.sale || car.crashed) return null;
    const rect=this.canvas.getBoundingClientRect();
    const layout=this.steeringWheelLayout(car);
    if(!layout.radius || !rect.width || !rect.height) return null;
    const dx=(clientX-rect.left)*this.width/rect.width-layout.x;
    const dy=(clientY-rect.top)*this.height/rect.height-layout.y;
    const x=(dx*Math.cos(layout.angle)+dy*Math.sin(layout.angle))/layout.radius;
    const y=(-dx*Math.sin(layout.angle)+dy*Math.cos(layout.angle))/layout.radius;
    return this.steeringWheelControls().find(control=>Math.hypot(x-control.x,y-control.y)<.15)?.action || null;
  }

  steeringWheelControls() {
    return [{action:'page',x:-.65,y:-.18,label:'DISP',color:'#46aaff'},
      {action:'brightness',x:.65,y:-.18,label:'DIM',color:'#e0b94f'},
      {action:'tc',x:0,y:.44,label:'TC',color:'#22c878'}];
  }

  driverArmPose(layout,side) {
    const height=2.85, width=height*this.driverArm.naturalWidth/this.driverArm.naturalHeight;
    const wrist={x:width*(.52-.45),y:-.50+height*.36};
    // Anchor the pinch point to the horizontal side of the wheel (9 and 3),
    // then turn the glove so the wrist descends from that side grip.
    const grip={x:width*(.35-.45),y:-.50+height*.13};
    const c=Math.cos(layout.angle),s=Math.sin(layout.angle);
    const gripWorld={x:layout.x+side*layout.radius*.94*c,
      y:layout.y+side*layout.radius*.94*s};
    // Let each elbow follow its hand a little, then orient the glove/forearm
    // toward that elbow about the fixed grip point. Arms can cross at full lock.
    const elbow={x:layout.x+side*layout.radius*1.60+
      (gripWorld.x-layout.x-side*layout.radius*.94)*.25,
      y:this.height+layout.radius*.85};
    const sourceDirection=Math.atan2(wrist.y-grip.y,side*(wrist.x-grip.x));
    const gripDirection=Math.atan2(elbow.y-gripWorld.y,elbow.x-gripWorld.x);
    const baseAngle=side*(gripDirection-sourceDirection-layout.angle);
    const pose={width,height,wrist,grip,baseAngle,side,radius:layout.radius};
    const wheelWrist=this.driverArmWheelPoint(pose,wrist);
    const localX=wheelWrist.x,localY=wheelWrist.y;
    const wristWorld={x:layout.x+layout.radius*(localX*c-localY*s),
      y:layout.y+layout.radius*(localX*s+localY*c)};
    const neutralDirection=Math.atan2(height*.64,side*width*.26)+side*baseAngle+layout.angle;
    const desiredDirection=Math.atan2(elbow.y-wristWorld.y,elbow.x-wristWorld.x);
    const difference=Math.atan2(Math.sin(desiredDirection-neutralDirection),Math.cos(desiredDirection-neutralDirection));
    const bend=Math.max(-.28,Math.min(.28,difference))*side;
    return {...pose,wristWorld,elbow,bend};
  }

  driverArmWheelPoint(pose,point) {
    const x=pose.side*(point.x-pose.grip.x),y=point.y-pose.grip.y;
    const angle=pose.side*pose.baseAngle,c=Math.cos(angle),s=Math.sin(angle);
    return {x:pose.side*.94+x*c-y*s,y:x*s+y*c};
  }

  placeDriverArm(pose) {
    const ctx=this.cockpit;
    ctx.translate(pose.side*.94,0);ctx.rotate(pose.side*pose.baseAngle);
    ctx.scale(pose.side,1);ctx.translate(-pose.grip.x,-pose.grip.y);
  }

  driverArmPoint(pose,u,v) {
    const x=pose.width*(u-.45),y=-.50+pose.height*v;
    // Flex only across the anatomical wrist/cuff. Below it the entire
    // forearm has one rigid rotation, so it cannot bend in its middle.
    const t=Math.max(0,Math.min(1,(v-.30)/.13));
    const angle=pose.bend*t*t*(3-2*t),c=Math.cos(angle),s=Math.sin(angle);
    return {x:pose.wrist.x+(x-pose.wrist.x)*c-(y-pose.wrist.y)*s,
      y:pose.wrist.y+(x-pose.wrist.x)*s+(y-pose.wrist.y)*c};
  }

  drawDriverArm(pose) {
    const ctx=this.cockpit,image=this.driverArm,W=image.naturalWidth,H=image.naturalHeight;
    const crop=(start,end)=>ctx.drawImage(image,0,H*start,W,H*(end-start),
      -pose.width*.45,-.50+pose.height*start,pose.width,pose.height*(end-start));
    // The glove stays locked to the grip; the sleeve rotates around the wrist.
    crop(0,.30);
    ctx.save();ctx.translate(pose.wrist.x,pose.wrist.y);ctx.rotate(pose.bend);
    ctx.translate(-pose.wrist.x,-pose.wrist.y);crop(.43,1);ctx.restore();
    const triangle=(uv,points)=>{
      const [p,q,r]=points;
      const [a,b,c]=uv.map(([u,v])=>({x:u*W,y:v*H}));
      const det=(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);
      const m11=((q.x-p.x)*(c.y-a.y)-(r.x-p.x)*(b.y-a.y))/det;
      const m12=((q.y-p.y)*(c.y-a.y)-(r.y-p.y)*(b.y-a.y))/det;
      const m21=((r.x-p.x)*(b.x-a.x)-(q.x-p.x)*(c.x-a.x))/det;
      const m22=((r.y-p.y)*(b.x-a.x)-(q.y-p.y)*(c.x-a.x))/det;
      ctx.save();ctx.beginPath();
      // Subpixel overlap prevents antialiasing cracks along mesh edges.
      const centre={x:(p.x+q.x+r.x)/3,y:(p.y+q.y+r.y)/3};
      for(const [i,point] of points.entries()) {
        const overlap=.75/pose.radius;
        const x=point.x+Math.sign(point.x-centre.x)*overlap;
        const y=point.y+Math.sign(point.y-centre.y)*overlap;
        if(i===0) ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.closePath();ctx.clip();
      ctx.transform(m11,m12,m21,m22,p.x-m11*a.x-m21*a.y,p.y-m12*a.x-m22*a.y);
      // Sample the full texture so filtering never hits the edge of a cropped
      // strip; otherwise bright horizontal seams appear across the cuff.
      ctx.drawImage(image,0,0,W,H,0,0,W,H);ctx.restore();
    };
    // Eight narrow bands blend the joint, while hand and forearm stay rigid.
    for(let band=0;band<8;band++) {
      const a=.30+.13*band/8,b=.30+.13*(band+1)/8;
      const tl=this.driverArmPoint(pose,0,a),tr=this.driverArmPoint(pose,1,a);
      const bl=this.driverArmPoint(pose,0,b),br=this.driverArmPoint(pose,1,b);
      triangle([[0,a],[1,a],[1,b]],[tl,tr,br]);
      triangle([[0,a],[1,b],[0,b]],[tl,br,bl]);
    }
  }

  drawDriverThumb(pose) {
    const ctx=this.cockpit;
    // Mask follows the thumb in the source photograph, not the entire closed
    // finger loop. Index finger and fingertips remain behind the front rim.
    ctx.save();ctx.translate(-pose.width*.45,-.50);ctx.scale(pose.width,pose.height);
    ctx.beginPath();ctx.moveTo(.18,.08);
    ctx.bezierCurveTo(.250,.074,.285,.074,.310,.083);
    ctx.bezierCurveTo(.320,.103,.310,.130,.345,.157);
    ctx.bezierCurveTo(.365,.176,.383,.186,.395,.198);
    // Continue into the palm where the foreground rim ends; cutting the
    // mask across the thumb base would leave an artificial triangular edge.
    ctx.bezierCurveTo(.430,.226,.510,.244,.650,.250);
    ctx.lineTo(.80,.30);ctx.lineTo(.15,.30);
    ctx.closePath();ctx.clip();
    ctx.drawImage(this.driverArm,0,0,1,1);ctx.restore();
  }

  drawSteeringWheel(car) {
    const ctx=this.cockpit, layout=this.steeringWheelLayout(car), r=layout.radius;
    if(r<=0) return;
    // FS 2027 T2.8.7: closed, convex oval perimeter, including at full lock.
    ctx.save();
    ctx.translate(layout.x,layout.y);ctx.rotate(layout.angle);ctx.scale(r,r);
    ctx.lineJoin='round';ctx.lineCap='round';
    const material=(x1,y1,x2,y2,stops)=>{
      const gradient=ctx.createLinearGradient(x1,y1,x2,y2);
      for(const [position,color] of stops) gradient.addColorStop(position,color);
      return gradient;
    };
    const rubber=material(-.6,-.7,.6,.7,[[0,'#68706b'],[.18,'#343c38'],[.48,'#161d19'],[1,'#070b09']]);
    const rim=()=>{
      ctx.beginPath();ctx.ellipse(0,0,.94,.64,0,0,Math.PI*2);
      ctx.strokeStyle=rubber;ctx.lineWidth=.145;ctx.stroke();
      ctx.beginPath();ctx.ellipse(0,-.012,.922,.627,0,0,Math.PI*2);
      ctx.strokeStyle='#b1b8ab25';ctx.lineWidth=.012;ctx.stroke();
    };
    // Paddle silhouettes and the quick-release collar sit inside the perimeter.
    for(const side of [-1,1]) {
      ctx.beginPath();ctx.moveTo(side*.65,-.35);ctx.lineTo(side*.76,-.29);
      ctx.lineTo(side*.78,.24);ctx.lineTo(side*.63,.32);ctx.closePath();
      ctx.fillStyle=material(side*.62,0,side*.78,0,[[0,'#202a28'],[.4,'#8d9690'],[.65,'#c1c5b9'],[1,'#3a4541']]);
      ctx.fill();ctx.strokeStyle='#08100d';ctx.lineWidth=.014;ctx.stroke();
    }
    ctx.beginPath();ctx.arc(0,.24,.22,0,Math.PI*2);ctx.fillStyle='#b5bcbc';ctx.fill();
    ctx.beginPath();ctx.arc(0,.24,.15,0,Math.PI*2);ctx.fillStyle='#c4a24b';ctx.fill();
    const faceplate=()=>{
      ctx.beginPath();ctx.moveTo(-.42,-.36);ctx.lineTo(.42,-.36);
      ctx.lineTo(.72,-.27);ctx.lineTo(.73,.06);ctx.lineTo(.49,.26);
      ctx.lineTo(.26,.56);ctx.lineTo(-.26,.56);ctx.lineTo(-.49,.26);
      ctx.lineTo(-.73,.06);ctx.lineTo(-.72,-.27);ctx.closePath();
    };
    ctx.save();ctx.translate(0,.035);
    faceplate();ctx.fillStyle='#020705';ctx.fill();
    ctx.strokeStyle='#07100c';ctx.lineWidth=.035;ctx.stroke();ctx.restore();
    faceplate();ctx.fillStyle=material(-.35,-.42,.4,.6,[[0,'#3b4440'],[.35,'#202825'],[.65,'#111916'],[1,'#060c09']]);ctx.fill();
    ctx.strokeStyle='#8b96865c';ctx.lineWidth=.012;ctx.stroke();
    ctx.save();
    faceplate();ctx.clip();
    // Diagonal two-over-two carbon weave under the satin resin surface.
    ctx.lineWidth=.009;
    for(let row=0;row<22;row++) for(let column=0;column<34;column++) {
      const x=-.82+column*.05,y=-.42+row*.05;
      ctx.strokeStyle=(row+column)%4<2 ? '#b3c2b31c' : '#02050365';
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+.033,y+.025);ctx.stroke();
    }
    ctx.restore();
    // The lower offset edge gives the rim depth without changing its outline.
    ctx.beginPath();ctx.ellipse(0,.025,.94,.64,0,0,Math.PI*2);
    ctx.strokeStyle='#020604';ctx.lineWidth=.16;ctx.stroke();
    rim();
    // Padded side grips follow the same convex outer oval. Thumb bolsters
    // are on the inner edge and do not change the closed outer perimeter.
    for(const side of [-1,1]) {
      const start=side===1 ? -.54 : Math.PI-.54;
      ctx.beginPath();ctx.ellipse(0,0,.935,.64,0,start,start+1.08);
      ctx.strokeStyle=rubber;ctx.lineWidth=.165;ctx.stroke();
      ctx.beginPath();ctx.ellipse(0,0,.885,.59,0,start+.06,start+1.02);
      ctx.strokeStyle='#2d95634d';ctx.lineWidth=.009;ctx.stroke();
      ctx.beginPath();ctx.ellipse(side*.78,-.03,.065,.15,side*.20,0,Math.PI*2);
      ctx.fillStyle=material(side*.74,-.16,side*.84,.10,[[0,'#546250'],[.5,'#293a2c'],[1,'#0a150e']]);ctx.fill();
    }
    // Grip stitching follows the rim without introducing concave cut-outs.
    ctx.strokeStyle='#93a6a0';ctx.lineWidth=.008;
    for(const side of [-1,1]) for(let i=0;i<7;i++) {
      const angle=(side===1 ? 0 : Math.PI)+(i-3)*.1;
      ctx.beginPath();ctx.moveTo(.9*Math.cos(angle),.60*Math.sin(angle));
      ctx.lineTo(.98*Math.cos(angle+.018),.67*Math.sin(angle+.018));ctx.stroke();
    }
    ctx.strokeStyle='#39d77a';ctx.lineWidth=.035;
    ctx.beginPath();ctx.ellipse(0,0,.94,.64,0,-Math.PI/2-.045,-Math.PI/2+.045);ctx.stroke();
    const text=(value,x,y,size,color='#e7fff3')=>{
      ctx.fillStyle=color;ctx.font=`600 ${size}px monospace`;ctx.textAlign='center';ctx.fillText(value,x,y);
    };
    // Recessed fasteners and green trim give the centre a machined finish.
    for(const [x,y] of [[-.45,-.29],[.45,-.29],[-.43,.20],[.43,.20],[-.19,.51],[.19,.51]]) {
      ctx.beginPath();ctx.arc(x,y,.018,0,Math.PI*2);ctx.fillStyle='#7b8783';ctx.fill();
      ctx.strokeStyle='#18231f';ctx.lineWidth=.007;
      ctx.beginPath();ctx.moveTo(x-.009,y);ctx.lineTo(x+.009,y);ctx.stroke();
    }
    ctx.strokeStyle='#23ba65';ctx.lineWidth=.012;
    for(const side of [-1,1]) {
      ctx.beginPath();ctx.moveTo(side*.48,.27);ctx.lineTo(side*.28,.51);ctx.stroke();
    }
    // LED bar reports modeled tyre use; it is not an invented RPM indicator.
    const grip=Math.max(0,Math.min(1,car.tireUse || 0));
    text('GRIP',0,-.44,.055,'#bccfc7');
    for(let i=0;i<10;i++) {
      ctx.fillStyle=grip>(i/10) ? i>7 ? '#ff5954' : i>5 ? '#ffce55' : '#38d889' : '#20352b';
      ctx.fillRect(-.34+i*.07,-.40,.048,.025);
    }
    // Compact instrument module leaves space for the grips and thumb controls.
    ctx.fillStyle='#020504';ctx.fillRect(-.412,-.307,.824,.514);
    ctx.fillStyle=material(0,-.30,0,.19,[[0,'#859084'],[.06,'#37443b'],[.65,'#17231b'],[1,'#030906']]);
    ctx.fillRect(-.40,-.30,.80,.49);
    ctx.fillStyle='#020b09';ctx.fillRect(-.36,-.26,.72,.41);
    ctx.fillStyle=material(-.36,-.26,.20,.12,[[0,'#aec5b31c'],[.5,'#758c7908'],[1,'#00000000']]);
    ctx.beginPath();ctx.moveTo(-.36,-.26);ctx.lineTo(.28,-.26);
    ctx.lineTo(-.08,.15);ctx.lineTo(-.36,.15);ctx.closePath();ctx.fill();
    ctx.save();ctx.globalAlpha=car.wheelDim ? .55 : 1;
    const seconds=Math.max(0,car.lapElapsedMs || 0)/1000;
    const lapTime=`${Math.floor(seconds/60)}:${(seconds%60).toFixed(1).padStart(4,'0')}`;
    text(`L${car.lap || 1}  ${lapTime}`,0,-.175,.065,'#92b6a7');
    ctx.strokeStyle='#274238';ctx.lineWidth=.006;
    ctx.beginPath();ctx.moveTo(-.31,-.13);ctx.lineTo(.31,-.13);ctx.stroke();
    if(car.wheelPage===1) {
      text(`${Math.abs(car.lateralG || 0).toFixed(2)} G`,0,-.015,.12);
      text(`${rendererText('PITO')} ${Math.round(grip*100)}%`,0,.075,.065,'#a6e8c3');
    } else {
      text(String(Math.round((car.speed || 0)*3.6)),0,-.005,.14);
      text('km/h',0,.065,.055,'#a6c3b5');
    }
    const status=car.crashed ? 'STOP' : car.damage ? rendererText('VAURIO') : car.offroad ? 'OFF TRACK' : car.tcActive ? 'TC ACTIVE' : car.tcEnabled===false ? 'TC OFF' : 'TC ON';
    text(status,0,.13,.055,car.crashed || car.damage || car.offroad ? '#ff8075' : car.tcActive ? '#ffce55' : '#91d4ae');
    ctx.restore();
    // Pedal command bars are sourced from the same input sent to the dynamics.
    for(const [x,value,color,label] of [[-.57,car.throttleInput,'#36d787','G'],[.53,car.brakeInput,'#ff715e','B']]) {
      ctx.fillStyle='#0b1513';ctx.fillRect(x,-.02,.04,.27);
      const amount=Math.max(0,Math.min(1,value || 0));ctx.fillStyle=color;
      ctx.fillRect(x,.25-amount*.27,.04,amount*.27);text(label,x+.02,.34,.065,color);
    }
    for(const control of this.steeringWheelControls()) {
      ctx.beginPath();ctx.arc(control.x,control.y,.115,0,Math.PI*2);
      ctx.fillStyle='#040a08';ctx.fill();
      ctx.beginPath();ctx.arc(control.x,control.y,.095,0,Math.PI*2);
      ctx.fillStyle=control.action==='tc' && car.tcEnabled===false ? '#5c392b' : control.color;ctx.fill();
      ctx.strokeStyle='#dae7df';ctx.lineWidth=.012;ctx.stroke();
      // Knurled encoder caps and index marks keep controls distinct by shape.
      if(control.action!=='tc') {
        for(let notch=0;notch<12;notch++) {
          const angle=notch*Math.PI/6;
          ctx.strokeStyle='#71877c';ctx.lineWidth=.006;
          ctx.beginPath();ctx.moveTo(control.x+Math.cos(angle)*.10,control.y+Math.sin(angle)*.10);
          ctx.lineTo(control.x+Math.cos(angle)*.112,control.y+Math.sin(angle)*.112);ctx.stroke();
        }
        ctx.beginPath();ctx.arc(control.x,control.y,.065,0,Math.PI*2);ctx.fillStyle='#182b2e';ctx.fill();
        ctx.strokeStyle=control.color;ctx.lineWidth=.02;
        const selected=control.action==='page' ? car.wheelPage===1 : car.wheelDim;
        const angle=selected ? -.65 : -2.5;
        ctx.beginPath();ctx.moveTo(control.x+Math.cos(angle)*.03,control.y+Math.sin(angle)*.03);
        ctx.lineTo(control.x+Math.cos(angle)*.067,control.y+Math.sin(angle)*.067);ctx.stroke();
      } else {
        text(car.tcEnabled===false ? '0' : '1',control.x,control.y+.025,.07,'#05180e');
      }
      text(control.label,control.x,control.y+.155,.065,'#edf5f0');
    }
    text('LPR / LUT',0,.31,.055,'#b1c7bc');
    // Animate the wrist within the continuous photograph. The hands follow
    // the wheel, while the forearms turn toward the offscreen elbows.
    if(this.driverArm?.complete && this.driverArm.naturalWidth>0) {
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality='high';
      for(const side of [-1,1]) {
        const pose=this.driverArmPose(layout,side);
        ctx.save();this.placeDriverArm(pose);
        this.drawDriverArm(pose);
        ctx.restore();
      }
      // The front surface of each grip occludes the fingers curled behind it.
      // Use the actual rim arc rather than a hole-sized patch: the hidden
      // fingertips must disappear under the grip, while the outer hand and
      // the near-side thumb stay visible alongside its inner edge.
      for(const side of [-1,1]) {
        ctx.save();ctx.scale(side,1);
        ctx.shadowColor='#020604b3';ctx.shadowBlur=r*.018;
        ctx.shadowOffsetX=r*.012;ctx.shadowOffsetY=r*.008;
        ctx.beginPath();ctx.ellipse(0,0,.94,.64,0,-.40,.17);
        ctx.strokeStyle=rubber;ctx.lineWidth=.165;ctx.stroke();
        ctx.shadowColor='transparent';
        ctx.beginPath();ctx.ellipse(0,-.012,.922,.627,0,-.40,.17);
        ctx.strokeStyle='#b1b8ab25';ctx.lineWidth=.012;ctx.stroke();
        ctx.restore();
      }
      // Restore only the near-side thumb across the front of the grip.
      // Grip, hidden fingers and visible thumb must occupy different layers.
      for(const side of [-1,1]) {
        const pose=this.driverArmPose(layout,side);
        ctx.save();this.placeDriverArm(pose);
        this.drawDriverThumb(pose);
        ctx.restore();
      }
    }
    ctx.restore();
  }
};
