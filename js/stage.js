// Escenario 3D compartido por todos los personajes: renderer, cámara, luces y escena de fondo.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Fracción de la zona libre del cuadro (entre la barra superior y las animaciones) que ocupa el personaje
const CHARACTER_FILL_FRACTION = 0.88;
const CAMERA_FOV = 35;
// Inclinación de la cámara hacia abajo (grados), para ver un poco el piso
const CAMERA_PITCH_DEG = 4;
// Radio del círculo blanco si el personaje no indica otro en su ficha (stageRadius)
const DEFAULT_STAGE_RADIUS = 1.7;

// Paleta con la estética de la app: ciudad de edificios negros con pocas luces naranjas,
// cielo carbón con un resplandor naranja tenue en el horizonte (el personaje conserva su propia luz)
const PALETTE = {
  skyTop: 0x16171c,
  skyMid: 0x2a2626,
  horizon: 0xb4582a,
  fog: 0x2b2324,
  ground: 0x2a2b31,
  stageRing: 0xff7a2f,
  buildingNear: 0x0e0e11,
  buildingFar: 0x16161a,
  sun: 0xff8a3d,
  lights: [0xff7a2f, 0xffb347],
};

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.timer = new THREE.Timer();
    this.updaters = [];
    this.characterHeight = 2;
    this.focusOffset = new THREE.Vector3();

    this.renderer = this.createRenderer(canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 400);
    this.controls = this.createControls();

    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.buildScenery();
    this.buildEnvironmentMap();
  }

  createRenderer(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // Limitar la densidad de píxeles cuida la batería y el rendimiento en celular
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    return renderer;
  }

  // Solo permite girar alrededor del personaje: sin zoom ni desplazamiento para mantener su tamaño
  createControls() {
    const controls = new OrbitControls(this.camera, this.canvas);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;
    controls.minPolarAngle = THREE.MathUtils.degToRad(60);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(92);
    return controls;
  }

  // Cúpula de cielo con degradado vertical hecho en un shader
  buildSky() {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(PALETTE.skyTop) },
        midColor: { value: new THREE.Color(PALETTE.skyMid) },
        horizonColor: { value: new THREE.Color(PALETTE.horizon) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor; uniform vec3 midColor; uniform vec3 horizonColor;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 color = mix(horizonColor, midColor, smoothstep(0.0, 0.25, h));
          color = mix(color, topColor, smoothstep(0.25, 0.8, h));
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 16), material);
    this.scene.add(this.sky);
    // La niebla funde el suelo lejano con el horizonte
    // Bruma rosada: difumina la ciudad para que se vea suave y el personaje resalte
    // Bruma oscura y cálida: las siluetas negras se funden suave con el horizonte
    this.scene.fog = new THREE.Fog(PALETTE.fog, 40, 170);
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xd6d9e8, 0x3a3036, 1.25);
    this.scene.add(hemi);

    // Luz principal cálida (sol bajo del atardecer) que proyecta la sombra del personaje
    const key = new THREE.DirectionalLight(0xffd2ad, 2.9);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -3;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    this.keyLight = key;

    // Luz de contorno azul (color de "viaje en curso" de la app) desde atrás para despegar al personaje del fondo
    const rim = new THREE.DirectionalLight(0x7fd0ff, 2.3);
    rim.position.set(-5, 4, -6);
    this.scene.add(rim);

    // Contorno cálido desde atrás a la derecha, con el naranja de la app
    const accentRim = new THREE.DirectionalLight(0xff9a5a, 1.1);
    accentRim.position.set(5, 3, -5);
    this.scene.add(accentRim);
  }

  buildGround() {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(150, 64),
      new THREE.MeshStandardMaterial({ color: PALETTE.ground, map: createGroundTexture(), roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    // Queda a la altura de la base de la plataforma para que no se encimen (evita parpadeo)
    ground.position.y = -0.14;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Plataforma circular donde se para el personaje (radio 1; se escala con setStageRadius)
    // Materiales del cilindro: [costado, tapa superior, tapa inferior]
    const sideMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d0dc, roughness: 0.5 });
    const topMaterial = new THREE.MeshStandardMaterial({ map: createStageTexture(), roughness: 0.55 });
    this.platform = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.06, 0.14, 96), [sideMaterial, topMaterial, sideMaterial]);
    this.platform.position.y = -0.07;
    this.platform.receiveShadow = true;
    this.scene.add(this.platform);

    // Aro luminoso naranja alrededor de la plataforma
    this.ring = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: PALETTE.stageRing, emissive: PALETTE.stageRing, emissiveIntensity: 1.6 })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.scene.add(this.ring);

    this.setStageRadius(DEFAULT_STAGE_RADIUS);
  }

  /**
   * Ajusta el tamaño del círculo blanco. Cada personaje puede pedir uno más grande
   * si sus animaciones lo desplazan (ej. NaVu da una vuelta al correr).
   */
  setStageRadius(radius = DEFAULT_STAGE_RADIUS) {
    this.platform.scale.set(radius, 1, radius);
    // El aro se reconstruye (no se escala) para que su grosor no cambie
    this.ring.geometry.dispose();
    this.ring.geometry = new THREE.TorusGeometry(radius * 1.035, 0.025, 12, 160);
  }

  buildScenery() {
    this.addSun();
    this.addCity();
    this.addCityLights();
  }

  // Sol de atardecer detrás de la ciudad (brillo suave en el horizonte)
  addSun() {
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(14, 48),
      new THREE.MeshBasicMaterial({ color: PALETTE.sun, transparent: true, opacity: 0.22, fog: false, depthWrite: false })
    );
    glow.position.set(-24, 12, -140);
    glow.lookAt(0, 12, 0);
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(7, 48),
      new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.45, fog: false, depthWrite: false })
    );
    core.position.set(-24, 12, -139.5);
    core.lookAt(0, 12, 0);
    this.scene.add(glow, core);
  }

  /**
   * Silueta de ciudad alrededor del personaje: dos anillos de edificios (cercano y lejano)
   * con ventanas encendidas en naranja, ámbar y azul. Usa InstancedMesh para que sea ligero en celular.
   */
  addCity() {
    const windows = createWindowTexture();
    // Lejos y bajos para que dejen ver el cielo del atardecer y no le quiten protagonismo al personaje
    this.addBuildingRing({ count: 80, minRadius: 46, maxRadius: 56, minHeight: 3.5, maxHeight: 10, color: PALETTE.buildingNear, windows, seed: 5, glow: 1.1 });
    this.addBuildingRing({ count: 70, minRadius: 80, maxRadius: 96, minHeight: 9, maxHeight: 22, color: PALETTE.buildingFar, windows, seed: 9, glow: 0.7 });
  }

  addBuildingRing({ count, minRadius, maxRadius, minHeight, maxHeight, color, windows, seed, glow }) {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      metalness: 0,
      emissive: 0xffffff,
      emissiveMap: windows,
      emissiveIntensity: glow,
    });
    const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, count);
    const random = seededRandom(seed);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + random() * 0.05;
      const radius = minRadius + random() * (maxRadius - minRadius);
      const height = minHeight + random() ** 1.6 * (maxHeight - minHeight);
      const width = 4 + random() * 5;
      position.set(Math.sin(angle) * radius, height / 2 - 0.14, Math.cos(angle) * radius);
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      scale.set(width, height, 4 + random() * 4);
      buildings.setMatrixAt(i, matrix.compose(position, rotation, scale));
    }
    this.scene.add(buildings);
  }

  // Nubes suaves teñidas de rosa por el atardecer, que se desplazan lentamente
  addClouds() {
    const material = new THREE.MeshStandardMaterial({
      color: 0xffc9c0, emissive: 0xff9a7a, emissiveIntensity: 0.3, roughness: 1, flatShading: true,
    });
    const random = seededRandom(3);
    const clouds = [];
    for (let i = 0; i < 5; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + Math.floor(random() * 3);
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), material);
        puff.position.set(p * 1.3 - puffs * 0.6, random() * 0.5, random() * 0.6);
        puff.scale.setScalar(0.9 + random() * 0.7);
        cloud.add(puff);
      }
      cloud.position.set(-40 + random() * 80, 20 + random() * 8, -45 - random() * 20);
      cloud.userData.speed = 0.25 + random() * 0.3;
      this.scene.add(cloud);
      clouds.push(cloud);
    }
    this.updaters.push((delta) => {
      for (const cloud of clouds) {
        cloud.position.x += cloud.userData.speed * delta;
        if (cloud.position.x > 55) cloud.position.x = -55;
      }
    });
  }

  // Luces de ciudad flotando (naranjas, ámbar y azules como la app) para dar vida al fondo
  addCityLights() {
    const count = 36;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const random = seededRandom(11);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 2.8 + random() * 9;
      positions.set([Math.cos(angle) * radius, 0.3 + random() * 3.2, Math.sin(angle) * radius], i * 3);
      color.set(PALETTE.lights[i % PALETTE.lights.length]);
      colors.set([color.r, color.g, color.b], i * 3);
      phases[i] = random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const base = positions.slice();
    const material = new THREE.PointsMaterial({
      size: 0.08, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.scene.add(new THREE.Points(geometry, material));

    let time = 0;
    this.updaters.push((delta) => {
      time += delta;
      const attr = geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        attr.array[i * 3 + 1] = base[i * 3 + 1] + Math.sin(time * 0.8 + phases[i]) * 0.25;
        attr.array[i * 3] = base[i * 3] + Math.cos(time * 0.5 + phases[i]) * 0.15;
      }
      attr.needsUpdate = true;
      material.opacity = 0.7 + Math.sin(time * 2) * 0.2;
    });
  }

  // Mapa de entorno generado desde el propio cielo: da reflejos al cuerpo metálico del robot
  buildEnvironmentMap() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(this.sky.clone());
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 1;
    pmrem.dispose();
  }

  /**
   * Coloca la cámara para que un personaje de altura `height` llene la zona libre de su cuadro.
   * `freeArea` = { x, y, height } en px: centro y altura de la zona que no tapa la interfaz.
   */
  frameCharacter(height, freeArea, forcedAzimuth = null) {
    this.characterHeight = height;
    const width = this.canvas.clientWidth;
    const screenHeight = this.canvas.clientHeight;
    this.renderer.setSize(width, screenHeight, false);
    this.camera.aspect = width / screenHeight;

    // Altura visible = 2·d·tan(fov/2); se despeja d para que el personaje sea la fracción deseada del cuadro
    const screenFraction = (CHARACTER_FILL_FRACTION * freeArea.height) / screenHeight;
    const halfFov = THREE.MathUtils.degToRad(CAMERA_FOV / 2);
    const distance = height / (2 * screenFraction * Math.tan(halfFov));
    const pitch = THREE.MathUtils.degToRad(CAMERA_PITCH_DEG);

    // Mantiene el ángulo horizontal que el usuario haya girado (salvo que se pida uno fijo)
    const azimuth = forcedAzimuth ?? this.controls.getAzimuthalAngle();
    const target = new THREE.Vector3(0, height / 2, 0).add(this.focusOffset);
    this.controls.target.copy(target);
    this.camera.position.set(
      target.x + Math.sin(azimuth) * Math.cos(pitch) * distance,
      target.y + Math.sin(pitch) * distance,
      target.z + Math.cos(azimuth) * Math.cos(pitch) * distance
    );

    // Desplaza la imagen para centrar al personaje en la zona libre (entre la barra y las animaciones)
    const offsetX = width / 2 - freeArea.x;
    const offsetY = screenHeight / 2 - freeArea.y;
    this.camera.setViewOffset(width, screenHeight, offsetX, offsetY, width, screenHeight);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  // Regresa la cámara al frente del personaje
  resetView(freeArea) {
    this.frameCharacter(this.characterHeight, freeArea, 0);
  }

  // Hace que la cámara acompañe al personaje si se desplaza (por ejemplo al correr)
  followPoint(worldPoint) {
    const desired = new THREE.Vector3(worldPoint.x, 0, worldPoint.z);
    const step = desired.sub(this.focusOffset).multiplyScalar(0.08);
    if (step.lengthSq() < 1e-8) return;
    this.focusOffset.add(step);
    this.controls.target.add(step);
    this.camera.position.add(step);
  }

  /**
   * Indica si un punto de la pantalla (clientX/clientY) cae sobre la caja 3D dada,
   * con un margen en px para que sea fácil de acertar con el dedo.
   */
  isPointOverBox(box, clientX, clientY, marginPx = 16) {
    if (box.isEmpty()) return false;
    const rect = this.canvas.getBoundingClientRect();
    const corner = new THREE.Vector3();
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    // Proyecta las 8 esquinas de la caja a la pantalla y arma el rectángulo que las contiene
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      corner.project(this.camera);
      const x = rect.left + ((corner.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - corner.y) / 2) * rect.height;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    return clientX >= left - marginPx && clientX <= right + marginPx && clientY >= top - marginPx && clientY <= bottom + marginPx;
  }

  onUpdate(callback) {
    this.updaters.push(callback);
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      this.timer.update();
      const delta = Math.min(this.timer.getDelta(), 0.1);
      for (const update of this.updaters) update(delta);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }
}

// Generador pseudoaleatorio con semilla: el escenario sale igual en cada carga
function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

/**
 * Textura de la tapa de la plataforma: degradado claro (el centro más luminoso para que el robot resalte)
 * con anillos finos naranjas y marcas tipo "plataforma tecnológica", a juego con la app.
 */
function createStageTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const center = size / 2;

  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, '#fbf6f1');
  gradient.addColorStop(0.7, '#eee6ee');
  gradient.addColorStop(1, '#d9d0de');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  // Anillos concéntricos finos
  context.strokeStyle = 'rgba(255, 122, 47, 0.35)';
  for (const [radius, width] of [[0.93, 3], [0.62, 1.5], [0.3, 1]]) {
    context.lineWidth = width;
    context.beginPath();
    context.arc(center, center, radius * center, 0, Math.PI * 2);
    context.stroke();
  }

  // Marcas cortas alrededor del borde (como un dial)
  context.strokeStyle = 'rgba(120, 100, 150, 0.35)';
  context.lineWidth = 2;
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    const inner = i % 4 === 0 ? 0.8 : 0.85;
    context.beginPath();
    context.moveTo(center + Math.cos(angle) * inner * center, center + Math.sin(angle) * inner * center);
    context.lineTo(center + Math.cos(angle) * 0.89 * center, center + Math.sin(angle) * 0.89 * center);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Piso tipo plaza: gris azulado con una cuadrícula fina (como el mapa de la app) y líneas naranjas cada tanto. */
function createGroundTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  // Líneas finas claras cada cuarto y una línea naranja en la orilla (se repite como baldosa)
  context.strokeStyle = 'rgba(255, 255, 255, 0.10)';
  context.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    const p = (i * size) / 4;
    context.beginPath(); context.moveTo(p, 0); context.lineTo(p, size); context.stroke();
    context.beginPath(); context.moveTo(0, p); context.lineTo(size, p); context.stroke();
  }
  context.strokeStyle = 'rgba(255, 122, 47, 0.55)';
  context.lineWidth = 4;
  context.strokeRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(40, 40);
  texture.anisotropy = 8;
  return texture;
}

/** Ventanas de edificios: la mayoría apagadas y algunas encendidas en naranja, ámbar o azul. */
function createWindowTexture() {
  const columns = 14;
  const rows = 36;
  const cell = 8;
  const canvas = document.createElement('canvas');
  canvas.width = columns * cell;
  canvas.height = rows * cell;
  const context = canvas.getContext('2d');
  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const random = seededRandom(21);
  const lit = ['#ff7a2f', '#ff9a45', '#ffb347'];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      // Muy pocas ventanas encendidas (≈4%): la ciudad se lee como silueta, no como puntos
      if (random() > 0.04) continue;
      context.fillStyle = lit[Math.floor(random() * lit.length)];
      context.globalAlpha = 0.55 + random() * 0.45;
      context.fillRect(column * cell + 2, row * cell + 2, cell - 4, cell - 3);
    }
  }
  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
