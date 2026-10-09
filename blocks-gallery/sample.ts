export const sampleSource = `({
  id: 'orbit-card', version: '1.0.0', name: 'Orbit card',
  category: 'Original', defaultDuration: 4,
  params: [
    {name:'color',label:'Accent',type:'color',default:'#77eed5'},
    {name:'label',label:'Label',type:'text',default:'PURE MOTION',maxLength:40},
    {name:'speed',label:'Speed',type:'number',min:0,max:4,step:0.1,default:1}
  ],
  render(ctx,t,size,params,seed) {
    const x = size.width / 2;
    const y = size.height / 2;
    const a = t * params.speed + helpers.rngFor(seed,0) * Math.PI * 2;
    ctx.fillStyle = params.color;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a)*size.width*0.2, y + Math.sin(a)*size.height*0.2, 18, 0, Math.PI*2);
    ctx.fill();
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(params.label,x,y);
  }
})`;
