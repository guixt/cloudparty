/** Shader-Quelltexte der Zusatz-Effekte (Comic, Retro). */
export const COMIC_SHADER = 'cpComic';
export const RETRO_SHADER = 'cpRetro';

export const COMIC_FRAGMENT = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform vec2 texel;
uniform float farMeters;
uniform float amount;
uniform float thickness;

float meters(vec2 uv) { return texture2D(depthSampler, uv).r * farMeters; }

void main(void) {
  vec4 src = texture2D(textureSampler, vUV);
  vec3 col = src.rgb;
  float lum = max(dot(col, vec3(0.299, 0.587, 0.114)), 0.0001);
  float levels = 4.0;
  float q = floor(lum * levels + 0.5) / levels;
  q = mix(lum, q, 0.7);
  vec3 cel = col * clamp(q / lum, 0.7, 1.5);
  cel = mix(vec3(dot(cel, vec3(0.299, 0.587, 0.114))), cel, 1.15);

  vec2 o = texel * thickness;
  float c = meters(vUV);
  float l = meters(vUV + vec2(-o.x, 0.0));
  float r = meters(vUV + vec2(o.x, 0.0));
  float u = meters(vUV + vec2(0.0, o.y));
  float d = meters(vUV + vec2(0.0, -o.y));
  // zweite Ableitung der Tiefe: ebene (auch schräge) Flächen ergeben 0, Kanten ergeben große Werte
  float lap = abs(l + r - 2.0 * c) + abs(u + d - 2.0 * c);
  float edge = smoothstep(0.03, 0.08, lap / (c + 0.5));
  edge *= 1.0 - smoothstep(0.5 * farMeters, 0.9 * farMeters, c);

  // Farbkanten (Innenlinien, z. B. Texturgrenzen)
  float lumL = dot(texture2D(textureSampler, vUV + vec2(-o.x, 0.0)).rgb, vec3(0.333));
  float lumR = dot(texture2D(textureSampler, vUV + vec2(o.x, 0.0)).rgb, vec3(0.333));
  float lumU = dot(texture2D(textureSampler, vUV + vec2(0.0, o.y)).rgb, vec3(0.333));
  float lumD = dot(texture2D(textureSampler, vUV + vec2(0.0, -o.y)).rgb, vec3(0.333));
  float cedge = smoothstep(0.25, 0.5, abs(lumL - lumR) + abs(lumU - lumD)) * 0.6;
  edge = max(edge, cedge);

  vec3 ink = vec3(0.04, 0.03, 0.05);
  vec3 outc = mix(cel, ink, clamp(edge, 0.0, 1.0));
  gl_FragColor = vec4(mix(col, outc, amount), src.a);
}
`;

export const RETRO_FRAGMENT = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screenSize;
uniform float pixelSize;
uniform float amount;

float bayer4(vec2 p) {
  vec2 m = mod(floor(p), 4.0);
  float i = m.x + m.y * 4.0;
  // Bayer-Matrix 4x4, ohne Feld-Indizierung (WebGL1-sicher)
  float v = 0.0;
  if (i < 0.5) v = 0.0; else if (i < 1.5) v = 8.0; else if (i < 2.5) v = 2.0; else if (i < 3.5) v = 10.0;
  else if (i < 4.5) v = 12.0; else if (i < 5.5) v = 4.0; else if (i < 6.5) v = 14.0; else if (i < 7.5) v = 6.0;
  else if (i < 8.5) v = 3.0; else if (i < 9.5) v = 11.0; else if (i < 10.5) v = 1.0; else if (i < 11.5) v = 9.0;
  else if (i < 12.5) v = 15.0; else if (i < 13.5) v = 7.0; else if (i < 14.5) v = 13.0; else v = 5.0;
  return v / 16.0 - 0.5;
}

void main(void) {
  vec4 src = texture2D(textureSampler, vUV);
  vec2 cell = floor(vUV * screenSize / pixelSize);
  vec2 uv = (cell + 0.5) * pixelSize / screenSize;
  vec3 col = texture2D(textureSampler, uv).rgb;
  float levels = 9.0;
  col += bayer4(cell) * 0.6 / levels;
  col = floor(col * levels + 0.5) / levels;
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(mix(src.rgb, col, amount), src.a);
}
`;
