import * as THREE from "three";

const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function canUseWebGL() {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    return !!gl;
  } catch {
    return false;
  }
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function setupNav() {
  const toggle = document.querySelector(".nav__toggle");
  const links = document.getElementById("navLinks");
  if (!toggle || !links) return;

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    links.dataset.open = open ? "true" : "false";
  };

  setOpen(false);

  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    setOpen(open);
  });

  links.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.tagName === "A") setOpen(false);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
}

function setupYear() {
  const el = document.getElementById("year");
  if (el) el.textContent = String(new Date().getFullYear());
}

setupNav();
setupYear();

const canvas = document.getElementById("bg");
const tooltip = document.getElementById("tooltip");
const webglNotice = document.getElementById("webglNotice");

if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
  // No canvas in DOM; nothing else to do.
} else if (!canUseWebGL()) {
  if (webglNotice) webglNotice.hidden = false;
} else {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070a12, 0.065);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0.8, 0.6, 6.4);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(clamp(window.devicePixelRatio || 1, 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0x7c5cff, 1.1);
  key.position.set(3, 4, 4);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x18d7ff, 0.9);
  rim.position.set(-4, 2, -2);
  scene.add(rim);

  // Subtle background stars
  const starCount = 900;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const i3 = i * 3;
    starPos[i3 + 0] = (Math.random() - 0.5) * 40;
    starPos[i3 + 1] = (Math.random() - 0.5) * 26;
    starPos[i3 + 2] = (Math.random() - 0.5) * 40;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.03,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // Main centerpiece
  const group = new THREE.Group();
  scene.add(group);

  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.85, 0.25, 180, 24),
    new THREE.MeshStandardMaterial({
      color: 0x9b8cff,
      roughness: 0.35,
      metalness: 0.55,
      emissive: 0x120a22,
      emissiveIntensity: 0.25,
    })
  );
  knot.position.set(0, 0.1, 0);
  group.add(knot);

  // Skill nodes (hoverable)
  const skillDefs = [
    { label: "TypeScript", color: 0x18d7ff },
    { label: "React", color: 0x7c5cff },
    { label: "Three.js", color: 0xa78bfa },
    { label: "Node.js", color: 0x7dd3fc },
    { label: "Postgres", color: 0x93c5fd },
    { label: "Performance", color: 0xc4b5fd },
  ];

  const nodes = [];
  const nodeGeo = new THREE.SphereGeometry(0.16, 28, 22);
  for (let i = 0; i < skillDefs.length; i++) {
    const t = (i / skillDefs.length) * Math.PI * 2;
    const r = 1.65;
    const mat = new THREE.MeshStandardMaterial({
      color: skillDefs[i].color,
      roughness: 0.25,
      metalness: 0.35,
      emissive: 0x000000,
      emissiveIntensity: 0.0,
    });
    const mesh = new THREE.Mesh(nodeGeo, mat);
    const baseX = Math.cos(t) * r;
    const baseY = Math.sin(t * 0.9) * 0.55;
    const baseZ = Math.sin(t) * r;
    mesh.position.set(baseX, baseY, baseZ);
    mesh.userData = {
      label: skillDefs[i].label,
      baseColor: skillDefs[i].color,
      baseX,
      baseY,
      baseZ,
    };
    group.add(mesh);
    nodes.push(mesh);
  }

  // Pointer-based parallax (lighter than full orbit controls)
  let targetRotX = 0;
  let targetRotY = 0;
  let pointerHasMoved = false;

  // Hover + tooltip
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2(999, 999);
  let hovered = null;
  let lastPointer = { x: 0, y: 0, active: false };

  const setTooltip = (text, x, y) => {
    if (!tooltip) return;
    if (!text) {
      tooltip.textContent = "";
      tooltip.style.transform = "translate(-9999px, -9999px)";
      return;
    }
    tooltip.textContent = text;
    tooltip.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
  };

  const onPointerMove = (clientX, clientY) => {
    const nx = (clientX / window.innerWidth) * 2 - 1;
    const ny = -(clientY / window.innerHeight) * 2 + 1;
    mouse.set(nx, ny);
    lastPointer = { x: clientX, y: clientY, active: true };
    pointerHasMoved = true;
    targetRotY = nx * 0.35;
    targetRotX = ny * 0.18;
    if (prefersReducedMotion) renderOnce();
  };

  window.addEventListener("mousemove", (e) => onPointerMove(e.clientX, e.clientY), {
    passive: true,
  });
  window.addEventListener(
    "touchstart",
    (e) => {
      if (!e.touches || e.touches.length === 0) return;
      onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true }
  );
  window.addEventListener(
    "touchmove",
    (e) => {
      if (!e.touches || e.touches.length === 0) return;
      onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true }
  );

  window.addEventListener(
    "mouseleave",
    () => {
      lastPointer.active = false;
      if (prefersReducedMotion) renderOnce();
    },
    { passive: true }
  );
  window.addEventListener(
    "touchend",
    () => {
      lastPointer.active = false;
      if (prefersReducedMotion) renderOnce();
    },
    { passive: true }
  );

  function updateHover() {
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(nodes, false);
    const hit = hits.length ? hits[0].object : null;

    if (hovered && hovered !== hit) {
      hovered.scale.setScalar(1);
      hovered.material.emissive.setHex(0x000000);
      hovered.material.emissiveIntensity = 0;
      hovered = null;
    }

    if (hit && hit !== hovered) {
      hovered = hit;
      hovered.scale.setScalar(1.22);
      hovered.material.emissive.setHex(0xffffff);
      hovered.material.emissiveIntensity = 0.35;
    }

    if (hovered && tooltip && lastPointer.active) {
      setTooltip(hovered.userData.label, lastPointer.x, lastPointer.y);
    } else {
      setTooltip("", 0, 0);
    }
  }

  // Scroll-reactive motion (subtle)
  function applyScrollMotion() {
    const y = window.scrollY || 0;
    const t = clamp(y / 1200, 0, 1.25);
    group.rotation.y = t * 0.55;
    group.rotation.x = -0.12 + t * 0.15;
    camera.position.z = 6.4 + t * 0.75;
  }

  window.addEventListener(
    "scroll",
    () => {
      applyScrollMotion();
      if (prefersReducedMotion) renderOnce();
    },
    { passive: true }
  );

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(clamp(window.devicePixelRatio || 1, 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (prefersReducedMotion) renderOnce();
  }
  window.addEventListener("resize", onResize, { passive: true });

  applyScrollMotion();

  let t0 = performance.now();
  function tick(now) {
    const dt = (now - t0) / 1000;
    t0 = now;

    // Keep things alive but not too busy.
    const speed = prefersReducedMotion ? 0 : 0.35;
    knot.rotation.x += dt * 0.24 * speed;
    knot.rotation.y += dt * 0.34 * speed;
    group.rotation.z =
      Math.sin(now * 0.00045) * 0.04 * (prefersReducedMotion ? 0 : 1);
    stars.rotation.y += dt * 0.02 * speed;

    if (!prefersReducedMotion) {
      const mix = 1 - Math.pow(0.001, dt); // frame-rate independent-ish smoothing
      if (pointerHasMoved) {
        group.rotation.y = group.rotation.y * (1 - mix) + targetRotY * mix;
        group.rotation.x = group.rotation.x * (1 - mix) + targetRotX * mix;
      }
    }

    // Float nodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const phase = i * 0.8;
      const baseY = n.userData.baseY ?? 0;
      n.position.y = baseY + Math.sin(now * 0.001 + phase) * 0.32;
    }

    updateHover();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  function renderOnce() {
    updateHover();
    renderer.render(scene, camera);
  }

  // Initial render
  if (prefersReducedMotion) {
    renderOnce();
  } else {
    requestAnimationFrame(tick);
  }
}

