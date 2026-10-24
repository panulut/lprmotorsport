/* Deterministic spectator collision model, shared with the renderer. */
(function(root){
  function create() {
    const campus=root.LPRCampus,site=campus.saunaSite;
    const forwardX=-Math.cos(Math.PI/4),forwardZ=-Math.sin(Math.PI/4),rightX=-forwardZ,rightZ=forwardX;
    const frame={stop:[site.x,0,site.y],forwardX,forwardZ,rightX,rightZ};
    const positions=[[-48,-30],[-27,-35],[-16,-29],[4,-35],[18,-30],[39,-23],[-46,15],[-23,23],[-7,26],[10,20],[-49,-16],[-42,29]];
    const dx=campus.bonfireSite.x-site.x,dy=campus.bonfireSite.y-site.y;
    for(let i=0;i<10;i++){const a=i*Math.PI*2/10;positions.push([dx*forwardX+dy*forwardZ+Math.cos(a)*32,dx*rightX+dy*rightZ+Math.sin(a)*32]);}
    for(const person of campus.peopleSites||[]){const dx=person.x-site.x,dy=person.y-site.y;positions[person.personId]=[dx*forwardX+dy*forwardZ,dx*rightX+dy*rightZ];}
    const meshes=positions.map(([forward,side],i)=>({forward,side,activity:i===10||i===11?'walk':i%3===0?'cheer':i%3===1?'drink':'relax',
      body:campus.registerPerson(i,site.x+forwardX*forward+rightX*side,site.y+forwardZ*forward+rightZ*side)}));
    function update(now){for(const [i,m] of meshes.entries()){const p=pose(m,i,now);campus.movePerson(m.body,site.x+forwardX*p.forward+rightX*p.side,site.y+forwardZ*p.forward+rightZ*p.side,p);}}
    return {frame,meshes,update};
  }
  function pose(mesh,index,now) {
    if(mesh.body.direction && mesh.body.pose)return {...mesh.body.pose,walking:false};
    const time = now / 1000;
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
    return {forward,side,yaw,walking,elevation,phase};
  }

  root.LPRPeople={create,pose};
})(window);
