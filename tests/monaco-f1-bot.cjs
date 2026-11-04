/* Input-only path follower: never sets car pose, velocity or tick clock after
   launch. It uses the same tyre contacts, wall sweeps and gate as the client. */
const {create,sampleRoad}=require('./helpers-monaco-f1.cjs');
function runBot({record=false,pace=.97,lookTime=.58,curveA=19,brakeA=20,manual=false,aeroCurve=.005}={}){
 const {w,d,s}=create(),M=w.LPRMath,c=w.LPRCampus,t=c.track,n=t.length,dt=1/120;
 const lengths=t.map((a,i)=>M.hypot(t[(i+1)%n].x-a.x,t[(i+1)%n].y-a.y)*.1);
 const tangents=t.map((a,i)=>M.atan2(t[(i+2)%n].y-t[(i+n-2)%n].y,t[(i+2)%n].x-t[(i+n-2)%n].x));
 const wrap=a=>M.atan2(M.sin(a),M.cos(a));
 // Integrate the actual arc distances: Monaco sample spacing varies.
 const curvature=t.map((a,i)=>wrap(tangents[(i+2)%n]-tangents[(i+n-2)%n])/[i-2,i-1,i,i+1].reduce((sum,j)=>sum+lengths[(j+n)%n],0));
 const speedPlan=curvature.map(k=>M.min(79,M.sqrt(curveA/M.max(.002,M.abs(k)-aeroCurve)))*pace);
 for(let pass=0;pass<3;pass++)for(let i=n-1;i>=0;i--)speedPlan[i]=M.min(speedPlan[i],M.sqrt(speedPlan[(i+1)%n]**2+2*brakeA*lengths[i]));
 Object.assign(s,c.launchPosition);d.reset(s);
 let tick=0,start=null,lastAlong=null,distance=0,hits=0,maxError=0,peakSpeed=0,peakG=0;const inputs=[],states=[];
 while(tick++<120*180){
  const q=c.monaco.mainQuery(s.x,s.y),idx=q.segment.index;
  const p=d.parameters,grass=sampleRoad(w,d,s);
  let ahead=idx,span=-q.t*lengths[idx],look=M.max(4,s.speed*lookTime);
  while(span+lengths[ahead]<look){span+=lengths[ahead];ahead=(ahead+1)%n;}
  // Interpolate the pursuit point; discrete points used to jump at segment edges.
  const mix=(look-span)/lengths[ahead],next=t[(ahead+1)%n];
  const target={x:t[ahead].x+(next.x-t[ahead].x)*mix,y:t[ahead].y+(next.y-t[ahead].y)*mix};
  const targetDistance=M.hypot(target.x-s.x,target.y-s.y)*p.metresPerWorldUnit;
  const alpha=wrap(M.atan2(target.y-s.y,target.x-s.x)-s.angle-M.atan2(s.vy,M.max(s.vx,1)));
  const desiredYaw=2*M.max(s.vx,2)*M.sin(alpha)/M.max(1,targetDistance);
  d.stepSuspension(s,dt);const [fl,rl]=d.capacities(s,grass);
  const assist=p.assistedSteeringGrip+(p.fastSteeringGrip-p.assistedSteeringGrip)*M.max(0,M.min(1,(s.vx-p.assistFadeStart)/p.assistFadeRange));
  const yawLimit=M.min(M.max(s.vx,p.assistSpeedFloor)*M.tan(p.maxRoadWheelAngle)/p.wheelbase,M.min(fl/p.aeroFrontBalance,rl/(1-p.aeroFrontBalance))/p.mass*assist/M.max(s.vx,p.assistSpeedFloor));
  const steer=M.max(-1,M.min(1,desiredYaw/M.max(.01,yawLimit)));
  const wanted=speedPlan[idx],delta=wanted-s.speed;
  const under=p.mass/p.wheelbase*(p.rearAxle/p.frontCorneringStiffness-p.frontAxle/p.rearCorneringStiffness)/M.max(1,M.pow((p.mass*9.81+s.downforce)/(p.mass*9.81),.75));
  const wheelSteer=(M.atan(p.wheelbase*desiredYaw/M.max(s.vx,2))+under*s.vx*desiredYaw+.10*(desiredYaw-s.yawRate))/p.maxRoadWheelAngle;
  const feed=(speedPlan[(idx+1)%n]-speedPlan[idx])/lengths[idx]*s.speed;
  const accel=feed+delta*4;
  const resist=.5*p.airDensity*p.dragArea*s.vx*s.vx+p.rollingResistance+p.mass*s.terrainSlope.forward*9.81;
  const force=accel*p.mass+resist;
  const driveCap=M.min(p.launchForce+M.max(0,s.vx-p.launchFadeSpeed)*p.launchForceSlope,p.peakPower/M.max(s.vx,2));
  const input={gas:force>0?M.min(1,force/driveCap):0,brake:force<0?M.min(1,-force/p.peakBrakeForce):0,steer:manual?M.max(-1,M.min(1,wheelSteer)):steer,analog:true,wheel:manual,tc:true,abs:true,steeringAssist:true};
  if(record)inputs.push({...input});
  const previous={x:s.x,y:s.y,angle:s.angle};d.step(s,input,dt,grass);
  const hit=c.resolveObstacleCollision(s,previous,contact=>d.applyImpact(s,contact.normal,contact.impactMaterial,contact));if(hit)hits++;
  if(record)states.push(structuredClone(s));
  const error=q.distance*.1;maxError=M.max(maxError,error);peakSpeed=M.max(peakSpeed,s.speed*3.6);peakG=M.max(peakG,M.abs(s.lateralG));
  if(c.crossesFinishLine(previous,s)){
   if(start===null){start=tick;distance=0;}
   else if(distance>c.length*.09)return {lapSeconds:(tick-start)/120,hits,maxError,peakSpeed,peakG,ticks:tick,inputs,states};
  }
  if(start!==null){if(lastAlong!==null)distance+=M.max(0,(idx-lastAlong+n)%n<n/2?((idx-lastAlong+n)%n)*lengths[idx]:0);lastAlong=idx;}
  if(s.crashed)return {failed:'crashed',idx,hits,maxError,ticks:tick,state:s};
 }
 return {failed:'timeout',hits,maxError,ticks:tick,state:s};
}
module.exports={runBot};
if(require.main===module)console.log(runBot());
