const fs=require('fs');const mp=require('midi-parser-js');
const file=process.argv[2];if(!file){console.error('usage: node dump-track-events.js <midi>');process.exit(1);} 
const b=fs.readFileSync(file,'base64');const m=mp.parse(b);
for(let t=0;t<m.track.length;t++){
  let tick=0;let out=[];for(const ev of m.track[t].event){tick+= (ev.deltaTime||ev.delta||0);if(ev.type===9 && ev.data && ev.data.length>=2 && ev.data[1]>0){out.push({kind:'on',note:ev.data[0],vel:ev.data[1],tick});} else if(ev.type===8 || (ev.type===9 && ev.data && ev.data.length>=2 && ev.data[1]===0)){out.push({kind:'off',note:ev.data[0],tick});}}
  console.log('Track',t,'events(first 30):');
  console.log(out.slice(0,30));
}
