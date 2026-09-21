/* ============ NAVBAR SCROLL STATE ============ */
const navbar = document.getElementById('navbar');
const onScrollNav = () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
};
onScrollNav();
window.addEventListener('scroll', onScrollNav, { passive: true });

/* ============ MOBILE MENU ============ */
const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobileMenu');
burger.addEventListener('click', () => {
  const open = mobileMenu.classList.toggle('open');
  burger.classList.toggle('active', open);
  burger.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
});
mobileMenu.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
    burger.classList.remove('active');
    document.body.style.overflow = '';
  });
});

/* ============ CURSOR GLOW ============ */
const cursorGlow = document.getElementById('cursorGlow');
if (window.matchMedia('(pointer: fine)').matches) {
  window.addEventListener('mousemove', (e) => {
    cursorGlow.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%,-50%)`;
    cursorGlow.style.opacity = 0.12;
  }, { passive: true });
}

/* ============ SCROLL REVEAL ============ */
const revealEls = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      const el = entry.target;
      setTimeout(() => el.classList.add('is-visible'), (i % 4) * 90);
      revealObserver.unobserve(el);
    }
  });
}, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
revealEls.forEach(el => revealObserver.observe(el));

/* ============ COUNTERS ============ */
const counters = document.querySelectorAll('.stat__num');
const animateCounter = (el) => {
  const target = parseInt(el.dataset.count, 10);
  const duration = 1400;
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * target);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCounter(entry.target);
      counterObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.6 });
counters.forEach(el => counterObserver.observe(el));

/* ============ TILT CARDS ============ */
const tiltCards = document.querySelectorAll('.tilt-card');
if (window.matchMedia('(pointer: fine)').matches) {
  tiltCards.forEach(card => {
    const inner = card.querySelector('.tilt-card__inner');
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      inner.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 14}deg) translateZ(10px)`;
    });
    card.addEventListener('mouseleave', () => {
      inner.style.transform = 'rotateY(0deg) rotateX(0deg) translateZ(0)';
    });
  });
}

/* ============ CONTACT FORM ============ */
const contactForm = document.getElementById('contactForm');
const formNote = document.getElementById('formNote');
contactForm.addEventListener('submit', (e) => {
  e.preventDefault();
  formNote.textContent = 'Дякуємо! Ми звʼяжемось з тобою найближчим часом.';
  contactForm.reset();
});

/* ============ THREE.JS HERO SCENE ============ */
(function initHero() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const isSmall = window.innerWidth < 720;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(0, 0, isSmall ? 9 : 7.5);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const green = 0x39ff6a;

  const group = new THREE.Group();
  scene.add(group);

  // Central wireframe icosahedron (X-Fit core shape)
  const coreGeo = new THREE.IcosahedronGeometry(2.1, 1);
  const coreMat = new THREE.MeshBasicMaterial({ color: green, wireframe: true, transparent: true, opacity: 0.55 });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  const innerGeo = new THREE.IcosahedronGeometry(1.3, 0);
  const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.18 });
  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  group.add(innerMesh);

  // Orbiting rings (torus)
  const ring1 = new THREE.Mesh(
    new THREE.TorusGeometry(3.1, 0.01, 8, 96),
    new THREE.MeshBasicMaterial({ color: green, transparent: true, opacity: 0.35 })
  );
  ring1.rotation.x = Math.PI / 2.4;
  group.add(ring1);

  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(3.6, 0.008, 8, 96),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 })
  );
  ring2.rotation.x = Math.PI / 1.7;
  ring2.rotation.y = Math.PI / 5;
  group.add(ring2);

  // Particle field
  const particleCount = isSmall ? 220 : 520;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const r = 4 + Math.random() * 6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMat = new THREE.PointsMaterial({ color: green, size: 0.035, transparent: true, opacity: 0.55 });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let mouseX = 0, mouseY = 0;
  window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  const clock = new THREE.Clock();
  let rafId;

  function animate() {
    rafId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    core.rotation.y = t * 0.18;
    core.rotation.x = t * 0.09;
    innerMesh.rotation.y = -t * 0.25;
    innerMesh.rotation.x = t * 0.15;
    ring1.rotation.z = t * 0.12;
    ring2.rotation.z = -t * 0.09;
    particles.rotation.y = t * 0.03;

    group.rotation.y += (mouseX * 0.3 - group.rotation.y) * 0.02;
    group.rotation.x += (-mouseY * 0.2 - group.rotation.x) * 0.02;

    renderer.render(scene, camera);
  }

  if (reducedMotion) {
    renderer.render(scene, camera);
  } else {
    animate();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
    } else if (!reducedMotion) {
      animate();
    }
  });
})();

/* ============ ABOUT SHAPE (lightweight three.js) ============ */
(function initAboutShape() {
  const el = document.getElementById('aboutShape');
  if (!el || typeof THREE === 'undefined') return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
  camera.position.z = 5;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  el.appendChild(renderer.domElement);

  const geo = new THREE.TorusKnotGeometry(1.1, 0.32, 140, 16);
  const mat = new THREE.MeshBasicMaterial({ color: 0x39ff6a, wireframe: true, transparent: true, opacity: 0.6 });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  function resize() {
    const size = el.clientWidth;
    renderer.setSize(size, size, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(el);
  resize();

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    mesh.rotation.x = t * 0.25;
    mesh.rotation.y = t * 0.35;
    renderer.render(scene, camera);
  }

  if (reducedMotion) {
    renderer.render(scene, camera);
  } else {
    animate();
  }
})();
