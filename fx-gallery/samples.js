export function makeSample(kind, w = 640, h = 360) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const gradient = g.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, kind === 'portrait' ? '#283c51' : '#79b7e1');
  gradient.addColorStop(1, kind === 'portrait' ? '#b99886' : '#efe1a1');
  g.fillStyle = gradient;
  g.fillRect(0, 0, w, h);
  if (kind === 'portrait') {
    const skin = g.createRadialGradient(
      w * 0.48,
      h * 0.35,
      2,
      w * 0.5,
      h * 0.45,
      h * 0.42,
    );
    skin.addColorStop(0, '#f8d4b0');
    skin.addColorStop(0.6, '#c58d6e');
    skin.addColorStop(1, '#825442');
    g.fillStyle = '#283b46';
    g.beginPath();
    g.ellipse(w * 0.5, h * 0.97, w * 0.28, h * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(w * 0.5, h * 0.42, w * 0.14, h * 0.36, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#392e2c';
    for (const x of [0.45, 0.55]) {
      g.beginPath();
      g.ellipse(w * x, h * 0.38, w * 0.018, h * 0.012, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#a25452';
    g.fillRect(w * 0.46, h * 0.59, w * 0.08, h * 0.018);
  } else {
    g.fillStyle = '#f6ca56';
    g.beginPath();
    g.arc(w * 0.75, h * 0.25, h * 0.13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#428b75';
    g.beginPath();
    g.moveTo(0, h * 0.8);
    g.lineTo(w * 0.3, h * 0.35);
    g.lineTo(w * 0.65, h);
    g.lineTo(0, h);
    g.fill();
    g.fillStyle = '#365872';
    g.beginPath();
    g.moveTo(w * 0.25, h);
    g.lineTo(w * 0.7, h * 0.5);
    g.lineTo(w, h);
    g.fill();
    g.fillStyle = '#d35754';
    g.fillRect(w * 0.1, h * 0.6, w * 0.12, h * 0.23);
  }
  g.fillStyle = '#fff';
  g.font = `bold ${Math.round(h * 0.075)}px sans-serif`;
  g.fillText(
    kind === 'portrait' ? 'PORTRAIT TONES' : 'COLOUR / MOTION',
    w * 0.05,
    h * 0.12,
  );
  g.fillStyle = '#171d2c';
  g.fillRect(w * 0.05, h * 0.88, w * 0.22, h * 0.07);
  g.fillStyle = '#fff';
  g.fillRect(w * 0.28, h * 0.88, w * 0.22, h * 0.07);
  return g.getImageData(0, 0, w, h);
}
