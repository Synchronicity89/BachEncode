const fs=require('fs');
const mp=require('midi-parser-js');
const file=process.argv[2];
if(!file){console.error('usage: node inspect-first-note.js <midi>');process.exit(1);} 
const b=fs.readFileSync(file,'base64');
const m=mp.parse(b);
let earliest=null;
for(let t=0;t<(m.track||[]).length;t++){
  let tick=0;const active=new Map();
  for(const ev of m.track[t].event){
    tick += (ev.deltaTime||ev.delta||0);
    if(ev.type===9 && ev.data && ev.data.length>=2 && ev.data[1]>0){
      if(!earliest){earliest={track:t,note:ev.data[0],start:tick};}
      if(!active.has(ev.data[0])) active.set(ev.data[0],tick);
    } else if((ev.type===8 || (ev.type===9 && ev.data && ev.data.length>=2 && ev.data[1]===0))){
      const start=active.get(ev.data[0]);
      if(start!=null){
        const dur = tick - start;
        if(earliest && earliest.note===ev.data[0] && earliest.track===t && earliest.dur==null){
          earliest.dur=dur; earliest.offTick=tick;
          console.log('Earliest note duration determined:', earliest);
          process.exit(0);
        }
      }
    }
  }
}
console.log('Earliest note (no off yet?):', earliest);
