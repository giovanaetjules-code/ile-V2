/*
 * Shaders (WebGL, post-traitement de la scène 2D). Le renderer dessine la scène « albédo » (sans ambiance) dans le canvas 2D,
 * puis ce module la relit comme texture et calcule, pixel par pixel :
 *   - lumières dynamiques (soleil, lune, torches, foyers, lampes, cristaux, portail, lucioles) avec ombres portées
 *     (lancer de rayons dans une carte de hauteurs des obstacles : arbres, murs, toits, rochers, joueurs…) ;
 *   - PBR approximé : normales déduites de la luminance des textures, rugosité / métal / eau déduits de la couleur et du type de tuile,
 *     diffus + spéculaire (GGX simplifié), AO de contact, sol mouillé, flaques et rides sous la pluie ;
 *   - ombres de nuages, brume volumétrique (bruit fractal), éclairs ;
 *   - bloom, étalonnage des couleurs, vignette, aberration chromatique légère, grain.
 * Mode « low » : sans bloom, ombres des lumières ni AO. Si WebGL est indisponible ou plante, le jeu retombe sur le rendu 2D.
 */
(function (I) {
  const MAXL = 14;
  const VS = 'attribute vec2 a;varying vec2 vUv;uniform float uFlip;void main(){vUv=vec2(a.x*.5+.5,mix(a.y*.5+.5,.5-a.y*.5,uFlip));gl_Position=vec4(a,0.,1.);}';
  const COMMON = 'precision highp float;varying vec2 vUv;' +
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}' +
    'float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}' +
    'float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*vnoise(p);p*=2.03;a*=.5;}return s;}' +
    'float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}';

  // ---------- passe 1 : éclairage ----------
  const FS_LIT = COMMON + `
uniform sampler2D uScene,uOcc,uMat;
uniform vec2 uRes,uCam,uMatSize;
uniform float uTime,uCloud,uRain,uWet,uNight,uFlash,uQ;
uniform vec3 uAmb,uSunCol,uMoonCol,uSunDir,uSky;
uniform float uNL,uNS;
uniform vec4 uL[${MAXL}];
uniform vec4 uLC[${MAXL}];
float occ(vec2 p){return texture2D(uOcc,p/uRes).r;}
float shadowSun(vec2 p,vec2 dir,float tanE,float self){
  float sh=1.;
  for(int i=1;i<=10;i++){
    float d=float(i)*float(i)*.45+2.;
    float o=occ(p+dir*d);
    float h=d*tanE;
    sh=min(sh,1.-clamp((o*26.-h)/5.,0.,1.)*step(self+.04,o));
  }
  return sh;
}
float shadowPt(vec2 p,vec2 lp,float lh,float self){
  float sh=1.;
  for(int i=1;i<=7;i++){
    float t=float(i)/8.;
    vec2 q=mix(p,lp,t);
    float o=occ(q);
    float b=clamp((o*26.-lh*t)/5.,0.,1.)*step(self+.04,o)*step(6.,length(q-lp));
    sh=min(sh,1.-b);
  }
  return sh;
}
void main(){
  vec2 px=vUv*uRes;
  vec2 tp=floor(px)+.5;
  vec3 alb=texture2D(uScene,tp/uRes).rgb;
  vec2 wp=uCam+tp;
  vec3 mat=texture2D(uMat,(floor(wp/16.)-floor(uCam/16.)+.5)/uMatSize).rgb;
  float water=mat.r,stone=mat.g,gloss=mat.b;
  float lc=lum(alb);
  float lx=lum(texture2D(uScene,(tp+vec2(1.,0.))/uRes).rgb)-lum(texture2D(uScene,(tp-vec2(1.,0.))/uRes).rgb);
  float ly=lum(texture2D(uScene,(tp+vec2(0.,1.))/uRes).rgb)-lum(texture2D(uScene,(tp-vec2(0.,1.))/uRes).rgb);
  float flatness=1.-clamp((abs(lx)+abs(ly))*6.,0.,1.);
  vec3 N=normalize(vec3(-lx*(2.2+1.8*stone),-ly*(2.2+1.8*stone),1.));
  float mx=max(alb.r,max(alb.g,alb.b)),mn=min(alb.r,min(alb.g,alb.b));
  float sat=(mx-mn)/max(mx,.001);
  float metal=(1.-sat*2.)*smoothstep(.55,.85,lc)*(1.-stone)*(1.-water);
  float rough=mix(.85,.5,gloss);
  rough=mix(rough,.32,metal);
  if(water>.05){
    vec2 q=wp*.32;
    vec2 g=vec2(vnoise(q+vec2(uTime*.6,uTime*.3)),vnoise(q*1.7-vec2(uTime*.4,uTime*.5)))-.5;
    N=normalize(mix(N,normalize(vec3(g*1.1,1.)),water));
    alb*=1.+(vnoise(q*2.+uTime*.8)-.5)*.2*water;
    rough=mix(rough,.18,water);
  }
  float wet=uWet*(1.-water);
  float self=occ(tp);
  float elev=texture2D(uOcc,tp/uRes).g; // pixel d'un objet haut (feuillage…) : pas d'ombre portée dessus
  float pud=0.;
  if(wet>.02&&self<.03){
    pud=smoothstep(.52,.62,fbm(wp*.05+7.))*smoothstep(.25,.7,wet)*flatness;
    float rip=0.;
    vec2 cell=floor(wp/9.);
    float ph=fract(uTime*.9+hash(cell)*7.);
    float rr=length(fract(wp/9.)-.5-(vec2(hash(cell+3.),hash(cell+8.))-.5)*.4)*9.;
    rip=smoothstep(1.2,0.,abs(rr-ph*4.))*(1.-ph)*step(.5,hash(cell+1.))*uRain;
    alb=mix(alb,alb*vec3(.5,.58,.72)+uSky*.18,pud*.75);
    alb+=vec3(.5,.6,.7)*rip*pud*.35;
    rough=mix(rough,.1,pud);
  }
  rough*=1.-.5*wet;
  float f0=mix(.035,.5,metal)+.05*wet+.45*water+.3*pud;
  alb*=1.-.22*wet*(1.-pud);
  vec3 V=vec3(0.,0.,1.);
  float shin=mix(6.,90.,1.-rough);
  vec3 diff=vec3(0.),spec=vec3(0.);
  // soleil (ombres portées + ombres de nuages)
  vec3 S=normalize(uSunDir);
  float cs=smoothstep(.34,.66,fbm((wp+vec2(uTime*3.,uTime*1.2))*.0065));
  float sunI=clamp(1.-uCloud*.55-uCloud*cs*.45,0.,1.);
  if(max(uSunCol.r,max(uSunCol.g,uSunCol.b))>.01){
    float sh=shadowSun(tp,normalize(S.xy),S.z/max(length(S.xy),.001),self);
    sh=mix(sh,1.,uCloud*.7);
    sh=mix(sh,1.,elev);
    float nl=max(dot(N,S),0.);
    diff+=uSunCol*nl*sh*sunI;
    vec3 H=normalize(S+V);
    spec+=uSunCol*pow(max(dot(N,H),0.),shin)*f0*(shin*.04+.4)*sh*sunI;
  }
  // lune
  vec3 Mn=normalize(vec3(-.4,-.3,.85));
  diff+=uMoonCol*max(dot(N,Mn),0.);
  spec+=uMoonCol*pow(max(dot(N,normalize(Mn+V)),0.),shin)*f0*.8;
  // lumières ponctuelles
  for(int i=0;i<${MAXL};i++){
    if(float(i)>=uNL)break;
    vec4 L=uL[i];vec4 C=uLC[i];
    vec2 d=L.xy-tp;
    float dist=length(d);
    float a=1.-dist/L.z;
    if(a<=0.)continue;
    a*=a;
    if(float(i)<uNS&&uQ>.5)a*=mix(shadowPt(tp,L.xy,L.w,self),1.,elev);
    vec3 Ld=normalize(vec3(d,L.w));
    float nl=max(dot(N,Ld),0.);
    diff+=C.rgb*a*nl*1.35;
    vec3 H=normalize(Ld+V);
    spec+=C.rgb*a*pow(max(dot(N,H),0.),shin)*f0*(shin*.04+.4)*1.6;
  }
  float ao=1.;
  if(uQ>.5){
    float o=(occ(tp+vec2(-3.,0.))+occ(tp+vec2(3.,0.))+occ(tp+vec2(0.,-3.))+occ(tp+vec2(0.,3.)))*.25;
    ao=1.-.45*clamp(o-self,0.,1.)*1.6;
  }
  vec3 col=alb*(uAmb*ao+diff)+spec;
  if(water>.05){ // reflets du ciel + éclats du soleil
    vec3 H=normalize(S+V);
    float gl=pow(max(dot(N,H),0.),150.);
    col+=uSunCol*gl*1.3*water*sunI;
    col=mix(col,uSky*(.4+.6*lc),.12*water);
  }
  col+=alb*vec3(.65,.72,1.)*uFlash*1.1;
  gl_FragColor=vec4(col,1.);
}`;

  // ---------- bloom : seuil + flou séparable ----------
  const FS_BRIGHT = COMMON + 'uniform sampler2D uT;uniform vec2 uPx;void main(){vec3 c=vec3(0.);' +
    'for(int i=0;i<4;i++){vec2 o=vec2(i<2?-1.:1.,(i==0||i==2)?-1.:1.)*uPx*1.5;c+=texture2D(uT,vUv+o).rgb;}c*=.25;' +
    'gl_FragColor=vec4(max(c-.8,0.)*2.2,1.);}';
  const FS_BLUR = COMMON + 'uniform sampler2D uT;uniform vec2 uDir;void main(){vec3 c=texture2D(uT,vUv).rgb*.227;' +
    'c+=(texture2D(uT,vUv+uDir*1.385).rgb+texture2D(uT,vUv-uDir*1.385).rgb)*.316;c+=(texture2D(uT,vUv+uDir*3.23).rgb+texture2D(uT,vUv-uDir*3.23).rgb)*.07;' +
    'gl_FragColor=vec4(c,1.);}';

  // ---------- composition finale ----------
  const FS_FINAL = COMMON + `
uniform sampler2D uLit,uBloom;
uniform vec2 uRes,uCam;
uniform float uTime,uFog,uCloud,uNight,uBloomK,uQ;
uniform vec3 uFogCol;
void main(){
  vec2 dir=vUv-.5;
  float ca=.0011*dot(dir,dir)*4.*uQ;
  vec3 c=vec3(texture2D(uLit,vUv+dir*ca).r,texture2D(uLit,vUv).g,texture2D(uLit,vUv-dir*ca).b);
  c+=texture2D(uBloom,vUv).rgb*uBloomK;
  vec2 wp=uCam+vec2(vUv.x,1.-vUv.y)*uRes;
  if(uFog>.01){
    float fn=fbm(wp*.011+vec2(uTime*.035,0.))*.7+fbm(wp*.028-vec2(uTime*.06,uTime*.02))*.3;
    float fa=clamp(uFog*(.35+.9*fn),0.,.9);
    c=mix(c,uFogCol+texture2D(uBloom,vUv).rgb*.4,fa);
  }
  float l=lum(c);
  c=mix(vec3(l),c,1.1+.1*(1.-uCloud)-uFog*.3);
  c=(c-.5)*1.06+.5;
  c+=(1.-l)*vec3(-.012,.0,.024)*(1.-uNight)+l*vec3(.02,.012,-.01)*(1.-uNight);
  float v=length(dir*vec2(1.,.92));
  c*=1.-smoothstep(.42,.95,v)*(.22+.28*uNight);
  if(uQ>.5)c+=(hash(vUv*uRes*3.1+fract(uTime)*91.)-.5)*.022;
  vec3 over=max(c-.82,0.);
  c=c-over+over/(1.+over*2.2);
  gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;

  class GLFX {
    constructor(host) {
      this.ok = false; this.mode = 'off'; this.w = 0; this.h = 0; this.fb = {};
      const cv = this.canvas = document.createElement('canvas');
      cv.id = 'gl'; cv.style.cssText = 'position:absolute;left:0;top:0;image-rendering:pixelated;pointer-events:none;display:none';
      host.parentNode.insertBefore(cv, host.nextSibling);
      let gl = null;
      try { gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
      if (!gl) { this.err = 'WebGL indisponible'; return; }
      this.gl = gl;
      try {
        this.pLit = this.prog(FS_LIT); this.pBright = this.prog(FS_BRIGHT); this.pBlur = this.prog(FS_BLUR); this.pFinal = this.prog(FS_FINAL);
      } catch (e) { this.err = e.message; return; }
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.tex = { scene: this.texture(), occ: this.texture(), mat: this.texture() };
      cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; cv.style.display = 'none'; });
      this.ok = true;
    }

    prog(fs) {
      const gl = this.gl, mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader : ' + gl.getShaderInfoLog(s)); return s; };
      const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('programme : ' + gl.getProgramInfoLog(p));
      p.u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i), name = info.name.replace('[0]', ''); p.u[name] = gl.getUniformLocation(p, info.name); }
      return p;
    }

    texture(filter) {
      const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter || gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t;
    }

    target(name, w, h) { // cible de rendu (texture + framebuffer)
      const gl = this.gl; let f = this.fb[name];
      if (f && f.w === w && f.h === h) return f;
      if (f) { gl.deleteTexture(f.t); gl.deleteFramebuffer(f.f); }
      const t = this.texture(gl.LINEAR); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return (this.fb[name] = { t: t, f: fbo, w: w, h: h });
    }

    setMode(m) {
      this.mode = this.ok ? m : 'off';
      this.canvas.style.display = this.mode === 'off' ? 'none' : 'block';
    }
    get active() { return this.ok && this.mode !== 'off'; }

    /** w,h : taille logique ; s : pixels écran (physiques) par pixel logique ; css : pixels CSS par pixel logique. */
    resize(w, h, s, css) {
      this.w = w; this.h = h; const cv = this.canvas;
      s = Math.max(1, Math.min(s, Math.floor(Math.sqrt(3.7e6 / (w * h))))); // écrans géants : on limite le nombre de pixels calculés
      const W = Math.round(w * s), H = Math.round(h * s);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      cv.style.width = w * css + 'px'; cv.style.height = h * css + 'px';
    }

    pass(prog, target, uniforms, textures) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null);
      gl.viewport(0, 0, target ? target.w : this.canvas.width, target ? target.h : this.canvas.height);
      gl.useProgram(prog); gl.uniform1f(prog.u.uFlip, uniforms.uFlip || 0);
      textures.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t[1]); gl.uniform1i(prog.u[t[0]], i); });
      for (const k in uniforms) {
        const v = uniforms[k], loc = prog.u[k]; if (loc === undefined || loc === null) continue;
        if (typeof v === 'number') gl.uniform1f(loc, v); else if (v.length === 2) gl.uniform2fv(loc, v); else if (v.length === 3) gl.uniform3fv(loc, v); else gl.uniform4fv(loc, v);
      }
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /** f : trame préparée par le renderer (voir Renderer.shaderFrame). */
    render(f) {
      if (!this.active) return;
      const gl = this.gl, hi = this.mode === 'high', W = this.canvas.width, H = this.canvas.height;
      gl.disable(gl.BLEND);
      const up = (name, src) => { gl.bindTexture(gl.TEXTURE_2D, this.tex[name]); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); };
      up('scene', f.scene); up('occ', f.occ); up('mat', f.mat);
      const lit = this.target('lit', W, H);
      this.pass(this.pLit, lit, Object.assign({ uFlip: 1, uRes: [this.w, this.h], uMatSize: f.matSize, uQ: hi ? 1 : 0 }, f.u), [['uScene', this.tex.scene], ['uOcc', this.tex.occ], ['uMat', this.tex.mat]]);
      let bloom = lit;
      if (hi) {
        const bw = Math.max(2, W >> 2), bh = Math.max(2, H >> 2), a = this.target('b1', bw, bh), b = this.target('b2', bw, bh);
        this.pass(this.pBright, a, { uPx: [1 / bw, 1 / bh] }, [['uT', lit.t]]);
        this.pass(this.pBlur, b, { uDir: [2.2 / bw, 0] }, [['uT', a.t]]);
        this.pass(this.pBlur, a, { uDir: [0, 2.2 / bh] }, [['uT', b.t]]);
        this.pass(this.pBlur, b, { uDir: [4 / bw, 0] }, [['uT', a.t]]);
        this.pass(this.pBlur, a, { uDir: [0, 4 / bh] }, [['uT', b.t]]);
        bloom = a;
      }
      this.pass(this.pFinal, null, { uRes: [this.w, this.h], uBloomK: hi ? 0.7 : 0, uQ: hi ? 1 : 0, uCam: f.u.uCam, uTime: f.u.uTime, uFog: f.u.uFog, uCloud: f.u.uCloud, uNight: f.u.uNight, uFogCol: f.u.uFogCol }, [['uLit', lit.t], ['uBloom', bloom.t]]);
    }
  }
  GLFX.MAXL = MAXL;
  I.GLFX = GLFX;
})((window.Iles = window.Iles || {}));
