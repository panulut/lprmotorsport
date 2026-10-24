function driver(world){
 const car=world.car,{track,trackDistances}=world,n=track.length;
 const nearest=world.nearestTrack(car.x,car.y),loop=trackDistances[n];
 const target=(nearest.along+60+Math.max(0,car.speed)*3)%loop;
 let i=0;while(i<n-1&&trackDistances[i+1]<target)i++;
 const a=track[i],b=track[(i+1)%n],f=(target-trackDistances[i])/(trackDistances[i+1]-trackDistances[i]);
 const dx=a.x+(b.x-a.x)*f-car.x,dy=a.y+(b.y-a.y)*f-car.y;
 const lateral=(-Math.sin(car.angle)*dx+Math.cos(car.angle)*dy)*.1,distance2=(dx*dx+dy*dy)*.01;
 const p=world.dynamics.parameters,angle=Math.atan(2*p.wheelbase*lateral/Math.max(.1,distance2));
 return {gas:car.speed<10?Math.min(1,(10-car.speed)*.5):0,brake:car.speed>10.3?Math.min(1,(car.speed-10)*.25):0,
  steer:Math.max(-1,Math.min(1,angle/p.maxRoadWheelAngle)),analog:true,wheel:true,tc:true};
}
module.exports={driver};
