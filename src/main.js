const canvas = document.getElementById("world");
const ctx = canvas.getContext("2d");

const world = {
  width: 80,
  height: 45,
  floorY: 0,
};

const player = {
  position: { x: 8, y: 1.5, z: 8 },
  velocity: { x: 0, y: 0, z: 0 },
  speed: 9,
  flySpeed: 12,
  flyMode: false,
  size: 0.6,
};

const keys = new Set();
let lastTime = performance.now();

window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
  if (event.key.toLowerCase() === "f") toggleFlyMode();
  if (event.key.toLowerCase() === "r") resetPlayer();
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

function toggleFlyMode() {
  player.flyMode = !player.flyMode;
  if (!player.flyMode) {
    player.velocity.y = 0;
  }
}

function resetPlayer() {
  player.position = { x: 8, y: 1.5, z: 8 };
  player.velocity = { x: 0, y: 0, z: 0 };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stepPhysics(deltaSeconds) {
  const forward = keys.has("w") || keys.has("arrowup");
  const backward = keys.has("s") || keys.has("arrowdown");
  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");
  const ascend = keys.has(" ");
  const descend = keys.has("shift");

  const moveDir = { x: 0, y: 0, z: 0 };
  if (forward) moveDir.z -= 1;
  if (backward) moveDir.z += 1;
  if (left) moveDir.x -= 1;
  if (right) moveDir.x += 1;
  if (player.flyMode) {
    if (ascend) moveDir.y += 1;
    if (descend) moveDir.y -= 1;
  } else if (ascend && player.position.y <= player.size + 0.05) {
    player.velocity.y = 6;
  }

  const hasPlanarInput = moveDir.x !== 0 || moveDir.z !== 0;
  if (hasPlanarInput) {
    const length = Math.hypot(moveDir.x, moveDir.z);
    moveDir.x /= length;
    moveDir.z /= length;
  }

  const speed = player.flyMode ? player.flySpeed : player.speed;
  player.velocity.x = moveDir.x * speed;
  player.velocity.z = moveDir.z * speed;

  if (player.flyMode) {
    player.velocity.y = moveDir.y * player.flySpeed;
  } else {
    player.velocity.y -= 18 * deltaSeconds; // gravity
  }

  player.position.x += player.velocity.x * deltaSeconds;
  player.position.y += player.velocity.y * deltaSeconds;
  player.position.z += player.velocity.z * deltaSeconds;

  // Bounds and floor
  player.position.x = clamp(player.position.x, player.size, world.width - player.size);
  player.position.z = clamp(player.position.z, player.size, world.height - player.size);

  if (!player.flyMode && player.position.y < player.size) {
    player.position.y = player.size;
    player.velocity.y = 0;
  }
}

function projectIso({ x, y, z }) {
  const scale = 12;
  const isoX = (x - z) * scale + canvas.width / 2;
  const isoY = (x + z) * scale * 0.5 + (world.height * 0.25 - y * 8);
  return { x: isoX, y: isoY };
}

function drawGrid() {
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1;
  const step = 1;
  for (let x = 0; x <= world.width; x += step) {
    const a = projectIso({ x, y: 0, z: 0 });
    const b = projectIso({ x, y: 0, z: world.height });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let z = 0; z <= world.height; z += step) {
    const a = projectIso({ x: 0, y: 0, z });
    const b = projectIso({ x: world.width, y: 0, z });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawPlayer() {
  const base = projectIso(player.position);
  const bob = player.flyMode ? Math.sin(performance.now() / 300) * 2 : 0;
  ctx.fillStyle = player.flyMode ? "#22d3ee" : "#8b5cf6";
  ctx.strokeStyle = "#0b1021";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(base.x, base.y - bob, 10, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawInfo() {
  ctx.fillStyle = "rgba(13, 17, 23, 0.75)";
  ctx.fillRect(12, 12, 260, 76);
  ctx.fillStyle = "#e6edf3";
  ctx.font = "14px 'Segoe UI', system-ui, sans-serif";
  ctx.fillText(`Modus: ${player.flyMode ? "Fliegen" : "Geerdet"}`, 24, 36);
  ctx.fillText(`Position: x=${player.position.x.toFixed(1)} y=${player.position.y.toFixed(1)} z=${player.position.z.toFixed(1)}`, 24, 56);
  ctx.fillText("F: Flugmodus | R: Reset | Space: Sprung", 24, 76);
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawPlayer();
  drawInfo();
}

function loop(now) {
  const deltaSeconds = Math.min(0.05, (now - lastTime) / 1000);
  stepPhysics(deltaSeconds);
  render();
  lastTime = now;
  requestAnimationFrame(loop);
}

resetPlayer();
requestAnimationFrame(loop);
