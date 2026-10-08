/* Sale Skinnarila, stylised from the supplied exterior and interior photos. */
window.LPRSale = {
  entrance: window.LPRCampus.world(520,453),
  buildExterior({box,quad}) {
    const p=window.LPRCampus.world(550,462), x=p.x,z=p.y;
    box(x,0,z,300,65,100,[.86,.88,.87]);
    box(x,65,z,303,3,103,[.25,.28,.27]);
    // Panel joints, continuous yellow window advertisements and glazed door.
    for(let dx=-150;dx<=150;dx+=25) box(x+dx,0,z-50.6,.6,65,.6,[.54,.59,.6]);
    for(const h of [20,40,60]) box(x,h,z-50.6,300,.6,.6,[.54,.59,.6]);
    for(let dx=-85;dx<140;dx+=23) {
      box(x+dx,23,z-51,21,15,1,[.93,.73,.14]);
      box(x+dx,25,z-52,8,10,.5,[.79,.23,.08]);
    }
    box(x-126,0,z-51,35,41,1,[.16,.28,.31]);
    for(const dx of [-144,-126,-108]) box(x+dx,0,z-52,1,42,1,[.35,.41,.42]);
    box(x-126,0,z-67,37,1,31,[.65,.65,.59]);
    box(x-126,1,z-81,37,1,2,[.95,.71,.05]);
    // Circular projecting red Sale sign, with white lettering.
    const cx=x-88, cy=49, front=z-54;
    for(let i=0;i<40;i++) {
      const a=i*Math.PI/20,b=(i+1)*Math.PI/20;
      quad([cx,cy,front],[cx+Math.cos(a)*16,cy+Math.sin(a)*16,front],
        [cx+Math.cos(b)*16,cy+Math.sin(b)*16,front],[cx,cy,front],[.85,.03,.1]);
    }
    const glyphs={S:['111','100','111','001','111'],a:['000','110','001','111','111'],l:['10','10','10','10','11'],e:['000','111','101','110','111']};
    let cursor=cx-12;
    for(const letter of 'Sale') {
      glyphs[letter].forEach((row,r)=>[...row].forEach((bit,c)=>{
        if(bit==='1') box(cursor+c*1.8+(4-r)*.25,cy+4-r*1.8,front-.5,1.6,1.6,.4,[1,1,.97]);
      }));
      cursor+=letter==='l' ? 4.8 : 6.8;
    }
    // Accessible side ramp and steel railing.
    box(x+45,0,z-68,155,2,24,[.58,.6,.59]);
    for(let dx=-28;dx<125;dx+=20) box(x+dx,2,z-79,1,10,1,[.52,.57,.57]);
    box(x+45,12,z-79,155,1,1,[.52,.57,.57]);
  },
  buildInterior({box}) {
    const b=(x,y,z,w,h,d,c)=>box(-6000+x,y,z,w,h,d,c);
    b(0,-1,0,180,1,300,[.36,.38,.35]);
    b(0,45,0,180,2,300,[.28,.3,.29]);
    for(const x of [-90,90]) b(x,0,0,2,45,300,[.7,.71,.67]);
    for(const z of [-150,150]) b(0,0,z,180,45,2,[.7,.71,.67]);
    // Ceiling panels and long bright strip lights.
    for(let z=-130;z<150;z+=35) {
      b(-20,43,z,110,1,28,[.72,.73,.67]);
      for(const x of [-55,35]) b(x,41,z,2,1,27,[1,1,.88]);
    }
    const colors=[[.84,.17,.13],[.91,.74,.13],[.15,.42,.62],[.34,.6,.22],[.8,.65,.49]];
    // Right-hand refrigerated wall with yellow fascia and dark door frames.
    b(80,0,0,18,36,290,[.16,.18,.17]);
    b(68,36,0,3,7,290,[.97,.78,.04]);
    for(let z=-136;z<145;z+=23) {
      b(68,1,z,1,35,1,[.07,.08,.075]);
      b(66,15,z+2,1,10,1,[.67,.69,.65]);
      for(let h=3;h<34;h+=7) {
        b(74,h,z+11,14,.8,21,[.76,.77,.7]);
        for(let item=0;item<5;item++) b(69,h+1,z+3+item*4,4,4,3,colors[(item+Math.round(h)+Math.abs(z))%5]);
      }
      b(67,1,z+11,.5,1,22,[.65,.71,.7]);
      b(67,34,z+11,.5,1,22,[.65,.71,.7]);
    }
    // Two stocked grocery islands; aisle remains open by the fridge wall.
    for(const x of [-48,-3]) for(const z of [-75,40]) {
      b(x,0,z,24,29,72,[.23,.25,.23]);
      for(let h=2;h<29;h+=7) {
        b(x,h,z,27,1,74,[.74,.75,.68]);
        for(const side of [-1,1]) for(let item=0;item<12;item++)
          b(x+side*10,h+1,z-32+item*5.7,5,4+(item%3),4,colors[(item+h)%5]);
      }
    }
    // Entrance and checkout at the near end.
    b(35,0,149,35,34,1,[.18,.31,.34]);
    b(-50,0,119,45,12,18,[.74,.74,.68]);
    b(-50,12,119,46,1,19,[.17,.19,.18]);
    b(-53,13,119,8,7,4,[.12,.14,.13]);
  },
  canWalk(x,z) {
    if(x<-82 || x>60 || z<-140 || z>139) return false;
    return ![-48,-3].some(sx=>[-75,40].some(sz=>Math.abs(x-sx)<17 && Math.abs(z-sz)<41));
  }
};
