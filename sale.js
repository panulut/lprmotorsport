/* Sale Skinnarila, stylised from the supplied exterior and interior photos. */
window.LPRSale = {
  products: [
    {"id":"riisi","name":"Riisi","packageLabel":"Riisi","color":[0.88,0.79,0.5],"width":4,"height":5},
    {"id":"pasta","name":"Pasta","packageLabel":"Pasta","color":[0.85,0.57,0.13],"width":4,"height":5},
    {"id":"kaurahiutaleet","name":"Kaurahiutaleet","packageLabel":"Kaurahiutaleet","color":[0.73,0.41,0.15],"width":4,"height":5.5},
    {"id":"kahvi","name":"Kahvi","packageLabel":"Kahvi","color":[0.35,0.13,0.08],"width":4,"height":4.5},
    {"id":"tee","name":"Tee","packageLabel":"Tee","color":[0.18,0.42,0.22],"width":4,"height":3.5},
    {"id":"tomaattimurska","name":"Tomaattimurska","packageLabel":"Tomaattimurska","color":[0.77,0.16,0.08],"width":3.5,"height":4},
    {"id":"hernekeitto","name":"Hernekeitto","packageLabel":"Hernekeitto","color":[0.34,0.48,0.16],"width":3.5,"height":4},
    {"id":"maito","name":"Maito","packageLabel":"Maito","color":[0.18,0.45,0.73],"width":3,"height":6},
    {"id":"jogurtti","name":"Jogurtti","packageLabel":"Jogurtti","color":[0.82,0.35,0.5],"width":3,"height":4},
    {"id":"juusto","name":"Juusto","packageLabel":"Juusto","color":[0.88,0.72,0.24],"width":4.8,"height":3.5},
    {"id":"ruisleipa","name":"Ruisleip?","packageLabel":"Ruisleip?","color":[0.53,0.32,0.12],"width":5,"height":4},
    {"id":"paahtoleipa","name":"Paahtoleip?","packageLabel":"Paahtoleip?","color":[0.69,0.5,0.25],"width":5,"height":5},
    {"id":"talouspaperi","name":"Talouspaperi","packageLabel":"Talouspaperi","color":[0.55,0.66,0.7],"width":5,"height":5.5},
    {"id":"astianpesuaine","name":"Astianpesuaine","packageLabel":"Astianpesuaine","color":[0.12,0.5,0.34],"width":3,"height":5.5},
    {id:'doris',name:'Fazer Doris Tryffeli',image:'assets/doris.png',color:[.92,.57,.65],width:5.4,height:4.1},
    {id:'jaffa',name:'Fazer Jaffa Appelsiini',image:'assets/jaffa.webp',color:[.94,.36,.04],width:5.4,height:4.1},
    {id:'hedelma-mix',name:'Hedelmä Mix',candyLabel:'HEDELMÄ',color:[.92,.28,.06],width:4.7,height:5.6},
    {id:'salmiakki-mix',name:'Salmiakki Mix',candyLabel:'SALMIAKKI',color:[.12,.1,.16],width:4.7,height:5.6},
    {id:'kirpeat-mix',name:'Kirpeä Mix',candyLabel:'KIRPEÄ',color:[.75,.06,.4],width:4.7,height:5.6},
    {id:'lakritsi-mix',name:'Lakritsi Mix',candyLabel:'LAKRITSI',color:[.06,.29,.46],width:4.7,height:5.6},
    {id:'vaahtokarkit',name:'Vaahtokarkit',candyLabel:'VAAHTO',color:[.36,.66,.08],width:4.7,height:5.6},
    {id:'karkki-mix',name:'Karkki Mix',candyLabel:'KARKKI',color:[.94,.65,.04],width:4.7,height:5.6},
    {id:'hartwall-vichy',name:'Hartwall Vichy Original',color:[.85,.86,.8],width:2.8,height:6},
    {id:'coca-cola',name:'Coca-Cola Original Taste',color:[.85,.03,.04],width:3,height:5.5},
    {id:'ekstroms-vadelma',name:'Ekströms Vadelmainen sekamehu',image:'assets/ekstroms-vadelma.webp',color:[.24,.04,.08],width:2.8,height:6},
    {id:'marli-juissi',name:'Marli Juissi Mustikka-vadelma',color:[.7,.12,.35],width:3,height:6},
    {id:'hk-sininen',name:'HK Sininen Lenkki',color:[.9,.88,.8],width:5.8,height:5.5},
    {id:'megaforce',name:'Megaforce',color:[.75,.04,.03],width:3,height:6},
    {id:'karjala',name:'Karjala',color:[.08,.07,.06],width:3,height:6},
    {id:'fazer-sininen',name:'Karl Fazer Maitosuklaa',color:[.02,.12,.35],width:6,height:3},
    {id:'remix',name:'Fazer Remix',color:[.12,.06,.12],width:4.7,height:5.6},
    {id:'lihapiirakka',name:'HoviRuoka Lihapiirakka',color:[.94,.55,.08],width:6,height:3.8},
    {id:'snellman-nakki',name:'Snellman Kunnon kuoreton nakki',color:[.03,.33,.16],width:4.8,height:5.8},
    {id:'banaani',name:'Banaani',color:[.96,.81,.12],width:6,height:3.8},
    {id:'omena',name:'Omena Royal Gala',color:[.78,.16,.08],width:4.4,height:4.4},
    {id:'croissant',name:'Voicroissant',color:[.83,.49,.16],width:6,height:3.5},
    {id:'nakkipiilo',name:'Nakkipiilo',color:[.76,.42,.17],width:6,height:3.6},
    {id:'aino-maitosuklaa',name:'Aino Ihana Maitosuklaa',color:[.85,.77,.6],width:8,height:4},
    {id:'pingviini-suklaatuutit',name:'Pingviini Sukkela Suklaa',image:'assets/pingviini-suklaatuutit.png',color:[.05,.12,.5],width:8,height:4},
    {id:'eskimo-vanilja',name:'Eskimo Vanilja',color:[.16,.56,.8],width:8,height:4},
    {id:'pingviini-vanilja',name:'Pingviini Veikeä Vanilja',image:'assets/pingviini-vanilja.webp',color:[.02,.38,.65],width:8,height:4}
  ],
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
    // From the street (-Z), screen-right points toward decreasing world X.
    let cursor=-12;
    for(const letter of 'Sale') {
      glyphs[letter].forEach((row,r)=>[...row].forEach((bit,c)=>{
        if(bit==='1') box(cx-(cursor+c*1.8+(4-r)*.25),cy+4-r*1.8,front-.5,1.6,1.6,.4,[1,1,.97]);
      }));
      cursor+=letter==='l' ? 4.8 : 6.8;
    }
    // Accessible side ramp and steel railing.
    box(x+45,0,z-68,155,2,24,[.58,.6,.59]);
    for(let dx=-28;dx<125;dx+=20) box(x+dx,2,z-79,1,10,1,[.52,.57,.57]);
    box(x+45,12,z-79,155,1,1,[.52,.57,.57]);
  },
  buildInterior({box,quad=()=>{},productFace=()=>{}}) {
    const b=(x,y,z,w,h,d,c)=>box(-6000+x,y,z,w,h,d,c);
    const q=(a,c,d,e,color)=>quad(...[a,c,d,e].map(p=>[p[0]-6000,p[1],p[2]]),color);
    const apple=(x,y,z,seed=0)=>{
      const radius=1.65+.12*Math.sin(seed*2.7);
      const point=(ring,segment)=>{
        const theta=ring*Math.PI/10,phi=segment*Math.PI/8;
        const r=radius*Math.sin(theta)*(1+.045*Math.cos(phi*5)*Math.abs(Math.cos(theta)));
        // Broad shoulders, narrower base and a small hollow around the stem.
        return [x+r*Math.cos(phi)*(1+.08*Math.cos(theta)),
          y+radius+radius*.92*Math.cos(theta)-.32*Math.exp(-theta*theta*12),
          z+r*Math.sin(phi)];
      };
      for(let ring=0;ring<10;ring++) for(let segment=0;segment<16;segment++) {
        const blush=(1+Math.sin(segment*Math.PI/8+seed))*.5;
        const stripe=.025*Math.sin(segment*3+seed);
        q(point(ring,segment),point(ring+1,segment),point(ring+1,segment+1),point(ring,segment+1),
          [.72+blush*.18,.09+(1-blush)*.29+stripe,.035+(1-blush)*.035]);
      }
      b(x,y+radius*1.92-.32,z,.22,.85,.22,[.27,.16,.055]);
      q([x,y+radius*1.92+.2,z],[x+.6,y+radius*1.92+.5,z-.3],
        [x+1.15,y+radius*1.92+.35,z],[x+.5,y+radius*1.92+.15,z+.2],[.18,.36,.07]);
    };
    const candyBag=(product,x,y,z,side,axis)=>{
      const w=product.width,h=product.height;
      const p=(u,v,d)=>axis==='x' ? [x+side*d,y+v,z-side*u] : [x+side*u,y+v,z+side*d];
      const front=[p(-w*.45,.35,1.32),p(w*.45,.35,1.32),p(w*.4,h-.35,1.32),p(-w*.4,h-.35,1.32)];
      const back=[p(-w*.48,0,-.3),p(w*.48,0,-.3),p(w*.46,h,-.3),p(-w*.46,h,-.3)];
      // A soft filled pouch, pinched flat at its heat-sealed edges.
      for(let i=0;i<4;i++) q(back[i],back[(i+1)%4],front[(i+1)%4],front[i],product.color);
      productFace(product.id,front.map(point=>[point[0]-6000,point[1],point[2]]));
      const localBox=(u,v,d,uw,vh,dd,c)=>{
        const point=p(u,v,d);
        b(...point,...(axis==='x' ? [dd,vh,uw] : [uw,vh,dd]),c);
      };
      for(const v of [0,h-.28]) {
        localBox(0,v,.05,w,.28,.22,product.color);
        for(let u=-w*.43;u<w*.44;u+=.4) localBox(u,v,.18,.09,.28,.05,[.86,.84,.75]);
      }
      // Metal peg behind the top seal, with a raised tip.
      localBox(0,h+.1,-.9,.13,.13,2.8,[.66,.69,.7]);
      localBox(0,h+.05,.52,.13,.35,.13,[.66,.69,.7]);
    };
    const stock=(id,x,y,z,side)=>{
      if(id==='omena') { apple(x,y,z,x+z); return; }
      const product=this.products.find(p=>p.id===id),w=product.width,h=product.height;
      if(id==='remix' || product.candyLabel) { candyBag(product,x,y,z,side,'x'); return; }
      b(x,y,z,2.6,h,w,product.color);
      // Front artwork faces the aisle independently on either side of a shelf.
      const faceX=-6000+x+side*1.32;
      productFace(id,[[faceX,y,z+side*w/2],[faceX,y,z-side*w/2],
        [faceX,y+h,z-side*w/2],[faceX,y+h,z+side*w/2]]);
    };
    const stockZ=(id,x,y,z,side)=>{
      if(id==='omena') { apple(x,y,z,x+z); return; }
      const product=this.products.find(p=>p.id===id),w=product.width,h=product.height;
      if(id==='remix' || product.candyLabel) { candyBag(product,x,y,z,side,'z'); return; }
      b(x,y,z,w,h,2.6,product.color);
      const faceZ=z+side*1.32;
      productFace(id,[[x-6000-side*w/2,y,faceZ],[x-6000+side*w/2,y,faceZ],
        [x-6000+side*w/2,y+h,faceZ],[x-6000-side*w/2,y+h,faceZ]]);
    };
    const candyIds=['hedelma-mix','salmiakki-mix','kirpeat-mix','lakritsi-mix','vaahtokarkit','karkki-mix','remix'];
    const candyRack=(x,z,side,axis,width,columns)=>{
      const p=(u,y,d)=>axis==='x' ? [x+side*d,y,z-side*u] : [x+side*u,y,z+side*d];
      const block=(u,y,d,w,h,depth,color)=>b(...p(u,y,d),...(axis==='x' ? [depth,h,w] : [w,h,depth]),color);
      block(0,0,-2.3,width,35,.7,[.18,.19,.17]);
      // Regular perforations remain visible between the hanging bags.
      for(let y=6;y<35;y+=1.8) for(let u=-width/2+1;u<width/2;u+=1.8)
        block(u,y,-1.9,.24,.3,.04,[.045,.05,.045]);
      for(let row=0;row<4;row++) {
        const y=5+row*7.3;
        block(0,y-.9,.65,width,.8,.45,[.75,.76,.7]);
        for(let column=0;column<columns;column++) {
          const u=(column-(columns-1)/2)*(width-6)/(columns-1);
          const pos=p(u,y,0),id=candyIds[(column+row*2)%candyIds.length];
          if(axis==='x') stock(id,...pos,side); else stockZ(id,...pos,side);
          block(u,y-.88,.93,3,.65,.08,column%3===0 ? [.98,.85,.15] : [.96,.96,.91]);
          // Price digits and a barcode give the strips the reference's detail.
          for(let digit=0;digit<3;digit++) block(u-.7+digit*.55,y-.7,.99,.2,.22,.04,[.1,.1,.09]);
          for(let line=0;line<5;line++) block(u+.6+line*.09,y-.8,.99,.04,.35,.04,[.15,.15,.14]);
        }
      }
      // Chocolate bars in low open display trays.
      block(0,1,.2,width,.8,5,[.64,.62,.53]);
      for(let column=0;column<columns;column++) {
        const pos=p((column-(columns-1)/2)*(width-6)/(columns-1),2,0);
        if(axis==='x') stock('fazer-sininen',...pos,side); else stockZ('fazer-sininen',...pos,side);
      }
    };
    const dryGoods=['riisi','pasta','kaurahiutaleet','kahvi','tee','tomaattimurska','hernekeitto'];
    const department=z=>z>70 ? ['ruisleipa','paahtoleipa'] : z>20 ? dryGoods :
      z>-20 ? ['hk-sininen','snellman-nakki','lihapiirakka'] :
      z>-75 ? ['maito','jogurtti','juusto'] : ['talouspaperi','astianpesuaine'];
    b(0,-1,0,180,1,300,[.36,.38,.35]);
    b(0,45,0,180,2,300,[.28,.3,.29]);
    for(const x of [-90,90]) b(x,0,0,2,45,300,[.7,.71,.67]);
    for(const z of [-150,150]) b(0,0,z,180,45,2,[.7,.71,.67]);
    // Ceiling panels and long bright strip lights.
    for(let z=-130;z<150;z+=35) {
      b(-20,43,z,110,1,28,[.72,.73,.67]);
      for(const x of [-55,35]) b(x,41,z,2,1,27,[1,1,.88]);
    }
    // Meat and chilled foods follow dry groceries, midway into the shop.
    b(80,0,0,18,36,70,[.16,.18,.17]);
    b(68,36,0,3,7,70,[.97,.78,.04]);
    for(let z=-34;z<30;z+=23) {
      b(68,1,z,1,35,1,[.07,.08,.075]);
      b(66,15,z+2,1,10,1,[.67,.69,.65]);
      for(let h=3;h<34;h+=7) {
        b(74,h,z+11,14,.8,21,[.76,.77,.7]);
        const chilled=['hk-sininen','snellman-nakki','lihapiirakka'];
        for(let item=0;item<3;item++) stock(chilled[Math.floor((z+34)/23)%3],69,h+1,z+4+item*7,-1);
      }
      b(67,1,z+11,.5,1,22,[.65,.71,.7]);
      b(67,34,z+11,.5,1,22,[.65,.71,.7]);
    }
    // One uninterrupted, wide shelving run leaves two narrow wall-side aisles.
    b(-3,0,-30,70,29,180,[.23,.25,.23]);
    for(const shelf of this.shelves) {
      const {x,z,products}=shelf;
      for(const side of [-1,1]) {
        if(z===30 && side===-1) { candyRack(x-35,z,-1,'x',60,10); continue; }
        for(let h=2;h<29;h+=7) {
          b(x+side*27,h,z,18,1,60,[.74,.75,.68]);
          for(let item=0;item<10;item++) {
            // Biscuits occupy one small vertical bay, not entire aisles.
            const id=side===1 && z===-30 && item<2 ? (item===0 ? 'doris' : 'jaffa') :
              side===1 ? dryGoods[Math.floor(item*dryGoods.length/10)] : products[Math.floor(item*products.length/10)];
            stock(id,x+side*35,h+1,z-26+item*5.8,side);
          }

        }
      }
    }
    b(32,2,-47,6,27,.6,[.64,.65,.6]);
    // End displays only at the exposed ends; no gaps between departments.
    for(let h=2;h<29;h+=7) {
      b(-3,h,-120,70,1,3,[.74,.75,.68]);
      for(let item=0;item<10;item++) stockZ(item%2 ? 'talouspaperi' : 'astianpesuaine',-33+item*6.6,h+1,-120,-1);
    }
    for(let h=2;h<29;h+=7) {
      b(-3,h,60,70,1,3,[.74,.75,.68]);
      for(const dx of [-30,-24,-18,18,24,30]) stockZ(dx<0 ? 'ruisleipa' : 'paahtoleipa',-3+dx,h+1,60,1);
    }
    // Wall shelving follows the same department order as the central islands.
    for(const side of [-1,1]) for(let z=-122;z<=130;z+=21) {
      // Reserve the left wall for the staff door and bottle-return machine;
      // the existing meat refrigerators occupy the middle of the right wall.
      if(side===-1 && (Math.abs(z)<25 || Math.abs(z-81)<23)) continue;
      if(side===-1 && z<-34) continue; // Ice cream lines the left return aisle.
      if(side===1 && Math.abs(z)<46) continue; // Meat refrigerators stay on the right.
      const x=side===-1 ? -85 : 79,faceX=side===-1 ? -79 : 69;
      b(x,0,z,8,32,20,[.23,.25,.23]);
      const ids=department(z);
      for(let h=2;h<30;h+=7) {
        b(x,h,z,12,1,20,[.74,.75,.68]);
        for(let item=0;item<3;item++) stock(ids[(item+(h-2)/7)%ids.length],faceX,h+1,z-7+item*7,-side);
      }
    }
    // Both end walls are stocked, with a clear opening at the entrance.
    for(const side of [-1,1]) for(const x of [-66,-44,-22,0,24,48]) {
      if(side===1 && x>=-22 && x<=48) continue; // Separate entry and exit openings.
      b(x,0,side*146,22,30,6,[.23,.25,.23]);
      const ids=side===1 ? (x===-66 ? ['croissant','nakkipiilo'] : ['ruisleipa','paahtoleipa']) : ['talouspaperi','astianpesuaine'];
      for(let h=2;h<29;h+=7) {
        b(x,h,side*144,22,1,8,[.74,.75,.68]);
        for(let item=0;item<3;item++) stockZ(ids[item%ids.length],x-7+item*7,h+1,side*140,-side);
      }
    }
    // Bottle-return machine: dark intake, screen and green status light.
    b(-80,0,81,14,30,22,[.64,.68,.65]);
    b(-72.8,8,81,.5,20,18,[.15,.19,.17]);
    b(-72.4,16,85,.4,7,7,[.025,.03,.025]);
    b(-72.2,17,85,.4,5,5,[.07,.08,.07]);
    b(-72.3,22,77,.4,4,6,[.12,.65,.4]);
    b(-72.3,12,77,.4,1,3,[.1,.9,.25]);
    // Staff-only door with the requested lowercase wording and a handle.
    b(-88,0,0,2,34,32,[.33,.36,.34]);
    b(-86.8,22,0,.5,7,25,[.94,.94,.9]);
    b(-86.3,13,11,1,1,4,[.78,.8,.78]);
    const glyphs={v:['000','101','101','101','010'],a:['000','110','001','111','111'],
      i:['010','000','010','010','010'],n:['000','110','101','101','101'],
      h:['100','100','110','101','101'],e:['000','111','101','110','111'],
      k:['100','101','110','101','101'],l:['110','010','010','010','111'],
      ö:['101','000','111','101','111'],u:['000','101','101','101','111'],
      t:['010','111','010','010','011']};
    [...'vain henkilökunta'].forEach((letter,i)=>glyphs[letter]?.forEach((row,r)=>[...row].forEach((bit,c)=>{
      if(bit==='1') b(-86.4,26-r*.55,10-i*1.2-c*.3,.2,.45,.25,[.08,.1,.09]);
    })));
    // Apples beside the compact banana stand at the entrance.
    b(-3,0,76,18,10,24,[.57,.39,.16]);
    b(-3,10,76,17,.6,23,[.25,.36,.12]);
    for(const x of [-11.5,5.5]) b(x,10,76,1,2,24,[.72,.53,.24]);
    for(const z of [64.5,87.5]) b(-3,10,z,18,2,1,[.72,.53,.24]);
    for(let row=0;row<5;row++) for(let column=0;column<4;column++) {
      apple(-9.5+column*4.3,10.6,67+row*4.4,row*4+column);
    }
    for(let row=0;row<3;row++) for(let column=0;column<3;column++) {
      apple(-7.3+column*4.3,13.1,69.2+row*4.4,30+row*3+column);
    }
    // Low ice cream chest with four wire baskets and sliding lid frames.
    // Its hollow interior leaves the packages visible from above.
    const freezer=this.freezer;
    const fx=freezer.x,fz=freezer.z;
    b(fx,0,fz,20,3,72,[.79,.84,.86]);
    for(const x of [fx-10,fx+10]) {
      b(x,3,fz,1.5,10,72,[.92,.95,.96]);
      b(x,13,fz,2,1,74,[.49,.61,.65]);
    }
    for(const z of [fz-36,fz+36]) {
      b(fx,3,z,20,10,1.5,[.92,.95,.96]);
      b(fx,13,z,22,1,2,[.49,.61,.65]);
    }
    b(fx+(fx<0 ? 10.8 : -10.8),4,fz, .5,6,68,[.02,.4,.66]);
    const frozen=['aino-maitosuklaa','pingviini-suklaatuutit','eskimo-vanilja','pingviini-vanilja'];
    for(let section=0;section<4;section++) {
      const z=fz-27+section*18;
      b(fx,4,z,18,.5,16,[.67,.78,.8]);
      for(const offset of [-8,8]) b(fx,4,z+offset,18,7,.3,[.68,.76,.78]);
      for(let wire=-7;wire<=7;wire+=2) b(fx+wire,4,z, .2,.5,16,[.85,.9,.91]);
      for(const x of [fx-4.5,fx+4.5]) for(const dz of [-4,4]) {
        const id=frozen[section],product=this.products.find(p=>p.id===id);
        b(x,5,z+dz,8,5,7,product.color);
        productFace(id,[[x-6000-4,10.03,z+dz+3.5],[x-6000+4,10.03,z+dz+3.5],
          [x-6000+4,10.03,z+dz-3.5],[x-6000-4,10.03,z+dz-3.5]]);
      }
    }
    for(const z of [fz-18,fz,fz+18]) b(fx,13.5,z,20,.5,.7,[.68,.8,.83]);
    for(const z of [fz-17,fz+17]) b(fx-6,14,z,3,.7,.8,[.22,.29,.32]);
    // Cold glass highlights along the edges avoid obscuring the stock below.
    for(const x of [fx-8,fx+8]) b(x,13.5,fz,.4,.25,68,[.77,.93,.97]);
    // Entrance and checkout at the near end.
    b(35,0,149,35,34,1,[.18,.31,.34]);
    b(-8,0,149,24,34,1,[.18,.31,.34]);
    b(-50,0,119,45,12,18,[.74,.74,.68]);
    b(-50,12,119,46,1,19,[.17,.19,.18]);
    b(-53,13,119,8,7,4,[.12,.14,.13]);
    // Cashier behind the counter, facing the customer aisle (-Z).
    const skin=[.83,.62,.46], uniform=[.12,.48,.28], trousers=[.12,.14,.15];
    for(const x of [-54,-46]) {
      b(x,0,133,4,11,5,trousers);
      b(x,0,131,5,2,8,[.08,.09,.08]);
    }
    // Compact produce stand immediately ahead of the entrance.
    const bx=-3,bz=102;
    b(bx,0,bz,18,9,24,[.57,.39,.16]);
    for(const x of [bx-9,bx+9]) b(x,9,bz,1,2,24,[.78,.61,.3]);
    q([bx-9,9,bz+12],[bx+9,9,bz+12],[bx+9,13,bz-12],[bx-9,13,bz-12],[.06,.36,.13]);
    b(bx,13,bz-12,18,7,1,[.05,.23,.1]);
    const letters={B:['110','101','110','101','110'],A:['010','101','111','101','101'],
      N:['101','111','111','111','101'],I:['111','010','010','010','111'],T:['111','010','010','010','010']};
    [...'BANAANIT'].forEach((letter,i)=>letters[letter].forEach((row,r)=>[...row].forEach((bit,c)=>{
      if(bit==='1') b(bx-8+i*2+c*.45,18.5-r*.7,bz-11.4,.4,.55,.3,[1,.95,.75]);
    })));
    for(let row=0;row<3;row++) for(let column=0;column<2;column++) {
      const cx=bx-4+column*8,cz=bz-8+row*8;
      for(let finger=0;finger<4;finger++) {
        const x=cx+(finger-1.5)*1.2;
        const point=(segment,ring)=>{
          const t=segment/8,a=ring*Math.PI/3;
          const radius=.5*Math.sin(Math.PI*t)+.12;
          return [x+Math.sin(t*Math.PI)*1.2+Math.cos(a)*radius,
            10+(bz+12-cz)/6+Math.sin(t*Math.PI)*.5+Math.sin(a)*radius,
            cz+(t-.5)*5];
        };
        for(let segment=0;segment<8;segment++) for(let ring=0;ring<6;ring++) {
          q(point(segment,ring),point(segment+1,ring),point(segment+1,ring+1),point(segment,ring+1),
            segment===0 || segment===7 ? [.38,.29,.06] : [.98,.77+ring*.018,.06]);
        }
      }
    }
    for(const side of [-1,1]) stock('banaani',bx+side*8,3,bz,side);
    b(-50,11,133,12,13,7,uniform);
    for(const x of [-58,-42]) {
      b(x,15,132,4,8,5,uniform);
      b(x,13,128,4,3,8,skin);
    }
    b(-50,24,133,3,2,3,skin);
    b(-50,26,133,8,8,7,skin);
    b(-50,33,133,9,2,8,[.23,.15,.1]);
    for(const x of [-52,-48]) b(x,30,129.4,1,1,.4,[.08,.08,.07]);
    b(-50,27.5,129.4,3,.5,.4,[.45,.2,.17]);
    b(-47,20,129.4,3,2,.4,[.96,.96,.88]);
  },
  shelves: [
    {x:-3,z:30,products:['riisi','pasta','kaurahiutaleet','kahvi','tee']},
    {x:-3,z:-30,products:['hartwall-vichy','coca-cola','ekstroms-vadelma','marli-juissi','megaforce','karjala']},
    {x:-3,z:-90,products:['talouspaperi','astianpesuaine']}
  ],
  freezer: {x:-79,z:-85,width:22,depth:74},
  canWalk(x,z) {
    if(x<-82 || x>60 || z<-140 || z>139) return false;
    if(x<-75 && !(Math.abs(z)<25 || Math.abs(z-81)<23)) return false;
    if(x<-68 && Math.abs(z-81)<15) return false;
    if(z<-135 || (z>135 && (x<-22 || x>60))) return false;
    // Include player clearance around the countertop and cashier.
    if(Math.abs(x+50)<28 && Math.abs(z-119)<15) return false;
    if(Math.abs(x+50)<13 && Math.abs(z-133)<10) return false;
    if(Math.abs(x-this.freezer.x)<this.freezer.width/2+4 &&
      Math.abs(z-this.freezer.z)<this.freezer.depth/2+4) return false;
    if(Math.abs(x+3)<13 && Math.abs(z-102)<16) return false;
    if(Math.abs(x+3)<13 && Math.abs(z-76)<16) return false;
    return !(Math.abs(x+3)<40 && z>-125 && z<64);
  }
};
