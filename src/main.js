/* ============================================================
   CINEMATIC BACKGROUND EXPERIENCE — MAIN SCRIPT
   Smooth cursor Lerp, crossfade switcher, intro animation
   ============================================================ */

import './style.css';

// ============================================================
// 1. CONFIGURATION — High-quality background images
// ============================================================

const FALLBACK_IMAGES = [
  {
    url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1920&q=80',
    credit: 'Neon Dreams — Unsplash'
  },
  {
    url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80',
    credit: 'Starry Mountain — Unsplash'
  },
  {
    url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&q=80',
    credit: 'Aurora Borealis — Unsplash'
  },
  {
    url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1920&q=80',
    credit: 'City Lights — Unsplash'
  }
];

// Will be populated by fetchMediaFiles() — fallback if server unreachable
let IMAGES = [...FALLBACK_IMAGES];

// ============================================================
// 2. DOM REFERENCES
// ============================================================

const overlay = document.getElementById('intro-overlay');
const mainContent = document.getElementById('main-content');
const bgContainer = document.getElementById('bg-container');
let slides = document.querySelectorAll('.bg-slide');
const creditEl = document.getElementById('image-credit');
const cursor = document.getElementById('custom-cursor');

let currentIndex = 0;
let isTransitioning = false;

// ============================================================
// Audio state
// ============================================================

let currentAudio = null;
let currentTrackIndex = -1;
let isPlaying = false;
let isMuted = false;
let audioFading = false;
const FADE_DURATION = 500; // ms

const playBtn = document.getElementById('play-btn');
const muteBtn = document.getElementById('mute-btn');
const audioPanel = document.getElementById('audio-panel');
const trackLabel = document.getElementById('track-label');

// ============================================================
// Playlist DOM refs
// ============================================================

const playlistOverlay = document.getElementById('playlist-overlay');
const playlistBackdrop = document.getElementById('playlist-backdrop');
const playlistTracks = document.getElementById('playlist-tracks');
const playlistCloseBtn = document.getElementById('playlist-close-btn');

// ============================================================
// Visualizer state
// ============================================================

let audioContext = null;
let analyserNode = null;
let sourceNode = null;
let gainNode = null;
let vizCanvas = null;
let vizCtx = null;
let vizAnimId = null;
let vizRunning = false;
let prevFreqBins = null;
let vizDots = null;
const BAR_COUNT = 48;
const VIZ_SMOOTHING = 0.65;

// ============================================================
// Playlist state
// ============================================================

let musicTracks = [];        // Array of { fileName, displayName, url, index }
let isPlaylistOpen = false;

// ============================================================
// Auto-Save state keys
// ============================================================

const STORAGE_KEY_BG = 'cinematic_bg_index';
const STORAGE_KEY_MUTED = 'cinematic_is_muted';
const STORAGE_KEY_VOLUME = 'cinematic_volume';



// ============================================================
// Audio Panel Auto-Hide — hide after exactly 10s idle
// Show on hover over audio area or press Backslash (\\)
// ============================================================

let audioHideTimer = null;
let audioUIDisabled = false;

// Fixed 10-second duration for consistent behavior
function getAudioHideDuration() {
  return 10000;
}

function showAudioUI() {
  if (document.body.classList.contains('ui-hidden')) return;
  audioUIDisabled = false;
  audioPanel.classList.remove('audio-hidden');
  resetAudioHideTimer();
}

function hideAudioUI() {
  if (audioUIDisabled) return;
  if (!audioPanel.classList.contains('visible')) return; // don't hide before first show
  audioUIDisabled = true;
  audioPanel.classList.add('audio-hidden');
}

function resetAudioHideTimer() {
  if (audioHideTimer) {
    clearTimeout(audioHideTimer);
  }
  audioHideTimer = setTimeout(hideAudioUI, getAudioHideDuration());
}

function initAudioAutoHide() {
  // Hover zone: transparent overlay at audio panel position
  // Shows audio UI when mouse enters the bottom area of the screen
  const audioPanelRect = () => audioPanel ? audioPanel.getBoundingClientRect() : null;

  // Detect mouse movement near the audio panel area
  document.addEventListener('mousemove', (e) => {
    const rect = audioPanelRect();
    if (!rect) return;

    // Define a generous hit zone around the audio panel (250px wider on each side, 120px taller)
    const hitZone = {
      left: rect.left - 250,
      right: rect.right + 250,
      top: rect.top - 120,
      bottom: rect.bottom + 120
    };

    if (
      e.clientX >= hitZone.left &&
      e.clientX <= hitZone.right &&
      e.clientY >= hitZone.top &&
      e.clientY <= hitZone.bottom
    ) {
      // Mouse is over the audio panel area — show UI
      // showAudioUI() internally calls resetAudioHideTimer(), no need to call twice
      showAudioUI();
    } else {
      // Mouse is outside — reset timer
      resetAudioHideTimer();
    }
  });

  // Reset timer on touch interactions
  document.addEventListener('touchstart', () => {
    showAudioUI();
    showImagePlaylist();
    // Only reset timers if UI is not manually hidden — show* functions guard this
    if (!document.body.classList.contains('ui-hidden')) {
      resetAudioHideTimer();
      resetImagePlaylistTimer();
    }
  });
  document.addEventListener('touchmove', () => {
    showAudioUI();
    showImagePlaylist();
    // Only reset timers if UI is not manually hidden
    if (!document.body.classList.contains('ui-hidden')) {
      resetAudioHideTimer();
      resetImagePlaylistTimer();
    }
  });

  // Show both panels on \ key — shows audio + playlist simultaneously
  document.addEventListener('keydown', (e) => {
    if (e.key === '\\') {
      e.preventDefault();
      showAudioUI();
      showImagePlaylist();
      return;
    }
    // Any other key activity resets audio timer only
    resetAudioHideTimer();
  });

  // Start the timer
  resetAudioHideTimer();
}

// ============================================================
// Progress bar & volume slider refs
// ============================================================

const seekBar = document.getElementById('seek-bar');
const seekProgress = document.getElementById('seek-progress');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const volumeSlider = document.getElementById('volume-slider');

let isSeeking = false;

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateProgress() {
  if (!currentAudio || isSeeking) return;
  const pct = (currentAudio.currentTime / (currentAudio.duration || 1)) * 100;
  seekProgress.style.width = `${Math.min(pct, 100)}%`;
  currentTimeEl.textContent = formatTime(currentAudio.currentTime);
}

function updateVolumeSlider() {
  const vol = getVolume();
  volumeSlider.value = vol;
  volumeSlider.style.setProperty('--vol-pct', `${vol * 100}%`);
}

function updateMuteIcon() {
  const muteSvg = muteBtn.querySelector('svg');
  if (isMuted) {
    muteSvg.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    `;
  } else {
    muteSvg.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    `;
  }
}

// ============================================================
// Volume helpers — route through GainNode if available
// ============================================================

function setVolume(v) {
  if (gainNode) {
    gainNode.gain.value = v;
  } else if (currentAudio) {
    currentAudio.volume = v;
  }
}

function getVolume() {
  if (gainNode) return gainNode.gain.value;
  if (currentAudio) return currentAudio.volume;
  return 0;
}

// ============================================================
// Media scanner — fetch files from 3 dedicated subdirectories
// images:  server/background_images/
// videos:  server/background_videos/
// music:   server/background_music/
// ============================================================

async function fetchMediaFiles() {
  try {
    // Fetch all 3 media types in parallel
    const [imgRes, vidRes, musRes] = await Promise.all([
      fetch('/api/images'),
      fetch('/api/videos'),
      fetch('/api/music')
    ]);

    if (!imgRes.ok) throw new Error('Server unavailable');

    const { images = [] } = await imgRes.json();
    const { videos = [] } = await vidRes.json();
    const { music = [] } = await musRes.json();

    const hasImages = images.length > 0;
    const hasVideos = videos.length > 0;
    const hasAudio = music.length > 0;

    // ===== BUILD MUSIC TRACKS INDEPENDENTLY =====
    if (hasAudio) {
      musicTracks = music.map((fileName, idx) => ({
        fileName,
        displayName: cleanTrackName(fileName) || `Track ${idx + 1}`,
        url: `/server/background_music/${encodeURIComponent(fileName)}`,
        index: idx
      }));
    }

    // ===== BUILD BACKGROUNDS PURELY (NO MUSIC COUPLING) =====
    if (hasImages || hasVideos) {
      const bgItems = [];

      // Add image backgrounds — files from background_images/
      for (const imgFile of images) {
        bgItems.push({
          url: `/server/background_images/${encodeURIComponent(imgFile)}`,
          credit: imgFile,
          type: 'image'
        });
      }

      // Add video backgrounds — files from background_videos/
      for (const vidFile of videos) {
        bgItems.push({
          url: `/server/background_videos/${encodeURIComponent(vidFile)}`,
          credit: vidFile,
          type: 'video'
        });
      }

      IMAGES = bgItems;
    }
    // else: no local files — use full Unsplash fallback (already set)
  } catch {
    // Cannot reach server — use fallback (already set)
    console.warn('Media server unavailable, using fallback images');
  }
}

// ============================================================
// Dynamically create slides based on IMAGES count
// ============================================================

function initSlides() {
  // Remove old slides
  bgContainer.querySelectorAll('.bg-slide').forEach((el) => el.remove());

  // Create new slides
  IMAGES.forEach((item, i) => {
    const slide = document.createElement('div');
    slide.className = `bg-slide${i === 0 ? ' active' : ''}`;

    if (item.type === 'video') {
      const video = document.createElement('video');
      video.className = 'bg-video';
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = item.url;
      slide.appendChild(video);
    } else {
      // Double-buffering: <img> element with onload for flicker-free crossfade
      const img = document.createElement('img');
      img.className = 'bg-image';
      img.alt = '';
      img.draggable = false;
      img.loading = 'eager';
      slide.appendChild(img);
    }

    bgContainer.appendChild(slide);
  });

  // Update slides reference
  slides = bgContainer.querySelectorAll('.bg-slide');
}

// ============================================================
// 3. INTRO LOADING — Slide-up with liquid blur
// ============================================================

function initIntro() {
  requestAnimationFrame(() => {
    overlay.classList.add('hidden');
  });

  // Show main content after overlay transition completes
  setTimeout(() => {
    mainContent.classList.add('visible');
  }, 400);
}

// ============================================================
// 4. CUSTOM SMOOTH CURSOR — Lerp algorithm
// ============================================================

let mouseX = 0;
let mouseY = 0;
let cursorX = 0;
let cursorY = 0;

function initCursor() {
  const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  if (isTouchDevice) return;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // Add hovering effect on interactive elements
  const interactiveEls = document.querySelectorAll(
    '.img-pl-dot, .credit, h1, .subtitle, .audio-btn, .playlist-track, .playlist-close-btn'
  );

  interactiveEls.forEach((el) => {
    el.addEventListener('mouseenter', () => cursor.classList.add('hovering'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('hovering'));
  });

  // Hide cursor when mouse leaves window
  document.addEventListener('mouseleave', () => {
    cursor.style.opacity = '0';
  });

  document.addEventListener('mouseenter', () => {
    cursor.style.opacity = '1';
  });

  // Lerp animation loop
  function lerp(start, end, factor) {
    return start + (end - start) * factor;
  }

  function animateCursor() {
    cursorX = lerp(cursorX, mouseX, 0.15);
    cursorY = lerp(cursorY, mouseY, 0.15);

    cursor.style.left = `${cursorX}px`;
    cursor.style.top = `${cursorY}px`;

    requestAnimationFrame(animateCursor);
  }

  animateCursor();
}

// ============================================================
// 5. BACKGROUND SWITCHER — Cinematic crossfade
// ============================================================

function preloadImage(url, timeout = 10000) {
  return Promise.race([
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = url;
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeout)
    )
  ]);
}

// Preload all images at startup for instant switching
function preloadAllImages() {
  IMAGES.forEach((item, i) => {
    // Skip index 0 — already loaded as initial background
    if (i > 0 && item.type === 'image') {
      preloadImage(item.url).catch(() => {});
    }
  });
}

function switchBackground(index) {
  // Guard: prevent concurrent transitions + out-of-bounds index
  if (isTransitioning || index === currentIndex) return;
  if (!IMAGES || IMAGES.length === 0) return;
  if (index < 0 || index >= IMAGES.length) return;

  isTransitioning = true;

  const prevIndex = currentIndex;
  currentIndex = index;

  const prevSlide = slides[prevIndex];
  const nextSlide = slides[index];
  const currentItem = IMAGES[index];

  if (!currentItem) {
    showToast('Background item missing — skipping', 'error', 2000);
    isTransitioning = false;
    return;
  }

  function slideIn() {
    // Mark next slide as active (starts crossfading in)
    nextSlide.classList.add('active');

    // Pause previous video if it had one
    const prevVideo = prevSlide.querySelector('.bg-video');
    if (prevVideo) {
      try { prevVideo.pause(); } catch {}
    }

    // Mark previous slide as exiting (fades out)
    prevSlide.classList.remove('active');
    prevSlide.classList.add('exiting');

    // Image playlist dots are updated below via updateImagePlaylistDots()

    // Update new image playlist dots
    updateImagePlaylistDots();

    // Update credit
    creditEl.textContent = currentItem.credit || '';

    // Auto-save state
    saveState();

    // Reset transitioning after crossfade animation completes (~0.25s CSS)
    setTimeout(() => {
      prevSlide.classList.remove('exiting');
      isTransitioning = false;
    }, 300);
  }

  if (currentItem.type === 'video') {
    // Video — wait a frame for video element to be ready
    nextSlide.classList.add('loading');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        nextSlide.classList.remove('loading');
        const video = nextSlide.querySelector('.bg-video');
        if (video) {
          video.currentTime = 0;
          video.play().catch(() => {});
        }
        slideIn();
      });
    });
  } else {
    // Image — double-buffering: use <img> onload for flicker-free crossfade
    const img = nextSlide.querySelector('img');
    if (img) {
      nextSlide.classList.add('loading');

      const loadHandler = () => {
        img.onload = null;
        img.onerror = null;
        nextSlide.classList.remove('loading');
        slideIn();
      };

      const errorHandler = () => {
        img.onload = null;
        img.onerror = null;
        nextSlide.classList.remove('loading');
        creditEl.textContent = 'Failed to load media — showing fallback';
        showToast('Failed to load image — showing fallback', 'error', 3000);
        slideIn();
      };

      img.onload = loadHandler;
      img.onerror = errorHandler;

      // Set a fallback timeout in case image never fires onload/onerror
      setTimeout(() => {
        if (nextSlide.classList.contains('loading')) {
          img.onload = null;
          img.onerror = null;
          nextSlide.classList.remove('loading');
          slideIn();
        }
      }, 10000);

      // Set src — image will load, then onload fires, then crossfade
      img.src = currentItem.url;
    } else {
      // Fallback: no img element found
      slideIn();
    }
  }
}

function nextBackground() {
  const next = (currentIndex + 1) % IMAGES.length;
  switchBackground(next);
}

function prevBackground() {
  const prev = (currentIndex - 1 + IMAGES.length) % IMAGES.length;
  switchBackground(prev);
}

function randomBackground() {
  let random;
  do {
    random = Math.floor(Math.random() * IMAGES.length);
  } while (random === currentIndex && IMAGES.length > 1);
  switchBackground(random);
}

// ============================================================
// 7. KEYBOARD NAVIGATION
// ============================================================

function initKeyboardNav() {
  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        nextBackground();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        prevBackground();
        break;
      case ' ':
        e.preventDefault();
        togglePlay();
        break;
      case 'r':
      case 'R':
        e.preventDefault();
        randomBackground();
        break;
      case 'm':
      case 'M':
        e.preventDefault();
        toggleMute();
        break;
      case '1': case '2': case '3': case '4':
      case '5': case '6': case '7': case '8': case '9': {
        const num = parseInt(e.key, 10) - 1;
        if (num < IMAGES.length) switchBackground(num);
        break;
      }
    }
  });
}

// ============================================================
// 8. INIT — Boot everything
// ============================================================

async function init() {
  // Fetch media files from server first
  await fetchMediaFiles();

  // Dynamically create slides based on IMAGES count
  initSlides();

  // Set initial background — use <img> onload for flicker-free first load
  if (IMAGES[0].type === 'video') {
    const video = slides[0].querySelector('.bg-video');
    if (video) {
      video.play().catch(() => {});
    }
    creditEl.textContent = IMAGES[0].credit;
  } else {
    const img = slides[0].querySelector('img');
    if (img) {
      img.onload = () => {
        img.onload = null;
        creditEl.textContent = IMAGES[0].credit;
      };
      img.src = IMAGES[0].url;
    }
  }
  // Preload all remaining images (into browser cache) for instant switching later
  preloadAllImages();

  initCursor();
  initKeyboardNav();

  // Start intro animation on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIntro);
  } else {
    initIntro();
  }

  // Audio event listeners
  playBtn.addEventListener('click', (e) => { createRipple(e); togglePlay(); });
  muteBtn.addEventListener('click', (e) => { createRipple(e); toggleMute(); });


  // Seek bar and thumb — add cursor hover effect
  seekBar.addEventListener('mouseenter', () => cursor.classList.add('hovering'));
  seekBar.addEventListener('mouseleave', () => cursor.classList.remove('hovering'));
  document.querySelector('.seek-thumb')?.addEventListener('mouseenter', () => cursor.classList.add('hovering'));
  document.querySelector('.seek-thumb')?.addEventListener('mouseleave', () => cursor.classList.remove('hovering'));

  // Volume slider cursor
  volumeSlider.addEventListener('mouseenter', () => cursor.classList.add('hovering'));
  volumeSlider.addEventListener('mouseleave', () => cursor.classList.remove('hovering'));

  // Seek bar — click or drag to seek
  seekBar.addEventListener('mousedown', (e) => {
    if (!currentAudio || !currentAudio.duration) return;
    isSeeking = true;
    seekBar.classList.add('dragging');
    const rect = seekBar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    currentAudio.currentTime = pct * currentAudio.duration;
    seekProgress.style.width = `${pct * 100}%`;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isSeeking) return;
    const rect = seekBar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    currentAudio.currentTime = pct * currentAudio.duration;
    seekProgress.style.width = `${pct * 100}%`;
  });

  document.addEventListener('mouseup', () => {
    if (isSeeking) {
      isSeeking = false;
      seekBar.classList.remove('dragging');
    }
  });

  // Volume slider
  volumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    volumeSlider.style.setProperty('--vol-pct', `${val * 100}%`);

    if (val > 0 && isMuted) {
      isMuted = false;
      muteBtn.classList.remove('active');
      updateMuteIcon();
    }
    if (val === 0 && !isMuted) {
      isMuted = true;
      muteBtn.classList.add('active');
      updateMuteIcon();
    }
    if (!isMuted) {
      preMuteVolume = val;
    }
  });

  // Initialize volume slider position
  updateVolumeSlider();

  // Save state when user leaves / refreshes the page
  window.addEventListener('beforeunload', saveState);

  // Show audio panel after intro
  setTimeout(() => {
    audioPanel.classList.remove('audio-hidden');
    audioPanel.classList.add('visible');
  }, 600);

  // Fetch slogan from server settings
  await fetchSlogan();

  // Fetch lyrics (from server or use fallbacks)
  fetchLyrics();

  // Build iOS-style playlist from music list
  await initPlaylist();

  // Initialize visualizer canvas BEFORE any audio setup
  initVisualizer();

  // Restore previously saved state FIRST (background index, mute, volume)
  const restoredBg = restoreState();

  // If a saved background was found, switch to it (visuals ONLY — no audio change)
  if (restoredBg > 0 && restoredBg < IMAGES.length) {
    await switchBackground(restoredBg);
  }

  // Initialize first music track independently (no background coupling)
  if (musicTracks.length > 0 && currentTrackIndex === -1) {
    switchTrack(0);
  }

  // Initialize Image Playlist (top-right dot indicators with max-5 scroll)
  initImagePlaylist();

  // Initialize Image Full Playlist Dropdown (grid menu button)
  initImageFullPlaylist();

  // Initialize Audio Auto-Hide (10-11s idle)
  initAudioAutoHide();

  // Initialize Image Playlist Auto-Hide (10s idle, independent from audio)
  initImagePlaylistAutoHide();

  // Initialize UI Toggle (hide all UI / show all UI)
  initUiToggle();

  // Show welcome toast after intro
  setTimeout(() => {
    const count = IMAGES.length;
    const audioCount = musicTracks.length;
    const msg = audioCount > 0
      ? `🎬 ${count} scenes • ${audioCount} music tracks • press \\ to show player`
      : `🎬 ${count} scenes • put music in server/background_music/ folder`;
    showToast(msg, 'success', 4000);
  }, 2000);
}

// ============================================================
// 9. AUDIO FUNCTIONS — Fade, Play/Pause, Mute, Ripple
// ============================================================

// ============================================================
// Toast notification system
// ============================================================

let toastTimer = null;

function showToast(message, type = 'info', duration = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  // Clear any existing timer
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  // Reset classes
  toast.className = 'toast';
  if (type === 'error') toast.classList.add('error');
  if (type === 'success') toast.classList.add('success');

  toast.textContent = message;

  // Force reflow for animation restart
  void toast.offsetWidth;

  toast.classList.add('show');

  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    toastTimer = null;
  }, duration);
}

// ============================================================
// Lyrics system — sync with audio
// ============================================================

const lyricsOverlay = document.getElementById('lyrics-overlay');
const lyricsLine = document.getElementById('lyrics-line');
let lyricsData = [];

const LYRICS_FALLBACKS = [
  '✨ Every moment is a work of art',
  '🎵 Let the music guide your soul',
  '🌙 Dancing through the neon night',
  '🌟 Stars align when you dream',
  '💫 Feel the rhythm of the universe',
  '🎬 This is your cinematic moment',
];

async function fetchLyrics() {
  try {
    const res = await fetch('/api/lyrics');
    if (res.ok) {
      const data = await res.json();
      if (data && data.lines) {
        lyricsData = data.lines;
      }
    }
  } catch {
    // Server unavailable — use fallback quotes
  }
}

function cycleLyrics() {
  if (!lyricsOverlay || !lyricsLine) return;

  // Use fallback quotes cycling
  const quote = LYRICS_FALLBACKS[Math.floor(Math.random() * LYRICS_FALLBACKS.length)];
  lyricsLine.textContent = quote;

  lyricsOverlay.classList.add('visible');

  // Remove after animation cycle
  setTimeout(() => {
    lyricsOverlay.classList.remove('visible');
  }, 4000);
}

let lyricsInterval = null;

function startLyricsCycle() {
  stopLyricsCycle();
  // First immediately
  cycleLyrics();
  // Then every 6 seconds
  lyricsInterval = setInterval(cycleLyrics, 6000);
}

function stopLyricsCycle() {
  if (lyricsInterval) {
    clearInterval(lyricsInterval);
    lyricsInterval = null;
  }
  if (lyricsOverlay) {
    lyricsOverlay.classList.remove('visible');
  }
}

function fadeInAudio() {
  if (!currentAudio) return;

  audioFading = true;
  const targetVol = isMuted ? 0 : (volumeSlider ? parseFloat(volumeSlider.value) : 0.8);
  setVolume(0);

  // Resume AudioContext if suspended (browser autoplay policy)
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }

  currentAudio.play().catch(() => {
    // Auto-play may be blocked by browser — user must interact first
    isPlaying = false;
    audioFading = false;
    updatePlayButton();
  });

  if (targetVol <= 0) {
    audioFading = false;
    return;
  }

  const step = targetVol / (FADE_DURATION / 50);

  const fadeInterval = setInterval(() => {
    const current = getVolume();
    if (current + step >= targetVol) {
      setVolume(targetVol);
      clearInterval(fadeInterval);
      audioFading = false;
    } else {
      setVolume(Math.min(targetVol, current + step));
    }
  }, 50);
}

function syncLyrics() {
  // Sync lyrics cycle with audio play state
  if (isPlaying && lyricsData.length > 0) {
    startLyricsCycle();
  } else if (!isPlaying) {
    stopLyricsCycle();
  }
}

function switchTrack(trackIndex) {
  const track = musicTracks[trackIndex];
  const musicSrc = track ? track.url : null;

  // Destroy old audio
  disconnectVisualizer();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }

  // If no track at this index, update label and return
  if (!track || !musicSrc) {
    currentTrackIndex = -1;
    const trackName = (track && track.displayName) || `Track ${trackIndex + 1}`;
    trackLabel.textContent = `${trackName} (no audio)`;
    vizDots?.classList.remove('active');
    stopLyricsCycle();
    showToast(`${trackName} — no audio available`, 'error', 2000);
    return;
  }

  currentTrackIndex = trackIndex;

  // Create new audio
  currentAudio = new Audio(musicSrc);
  currentAudio.loop = true;

  // Attach progress listeners
  currentAudio.addEventListener('timeupdate', updateProgress);
  currentAudio.addEventListener('loadedmetadata', () => {
    totalTimeEl.textContent = formatTime(currentAudio.duration);
    seekProgress.style.width = '0%';
    currentTimeEl.textContent = '0:00';
  });

  // Connect Web Audio visualizer (gainNode is created here)
  connectVisualizer(currentAudio);
  setVolume(isMuted ? 0 : (volumeSlider ? parseFloat(volumeSlider.value) : 0.8));

  // Update track label with human-readable name
  trackLabel.textContent = track.displayName;

  // Update active track in playlist (using music track index)
  updatePlaylistActiveTrack(trackIndex);

  // Restore mute state (gainNode handles it)
  if (isMuted) {
    setVolume(0);
  }

  // Fade in if was playing
  if (isPlaying) {
    fadeInAudio();
  }

  // Sync lyrics cycle
  syncLyrics();

  // Auto-save state
  saveState();
}

function togglePlay() {
  if (!currentAudio) return;

  if (isPlaying) {
    currentAudio.pause();
    isPlaying = false;
    vizDots?.classList.remove('active');
    stopLyricsCycle();
  } else {
    // Resume AudioContext if suspended (browser autoplay policy)
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
    setVolume(isMuted ? 0 : parseFloat(volumeSlider.value));
    currentAudio.play().catch(() => {
      // Browser may block autoplay
    });
    isPlaying = true;
    vizDots?.classList.add('active');
    updateVolumeSlider();
    startLyricsCycle();
  }

  updatePlayButton();

  // Auto-save state
  saveState();
}

let preMuteVolume = 0.8;

function toggleMute() {
  if (!currentAudio) return;

  if (isMuted) {
    // Unmuting — restore previous volume
    isMuted = false;
    const restoreVol = preMuteVolume > 0 ? preMuteVolume : 0.8;
    setVolume(restoreVol);
    if (!gainNode && currentAudio) {
      currentAudio.muted = false;
    }
  } else {
    // Muting — save current volume
    isMuted = true;
    preMuteVolume = getVolume();
    setVolume(0);
    if (!gainNode && currentAudio) {
      currentAudio.muted = true;
    }
  }

  muteBtn.classList.toggle('active', isMuted);
  updateMuteIcon();
  updateVolumeSlider();

  // Auto-save state
  saveState();
}

function updatePlayButton() {
  const playSvg = playBtn.querySelector('svg');
  if (isPlaying) {
    playSvg.innerHTML = `
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    `;
  } else {
    playSvg.innerHTML = `
      <polygon points="6,3 20,12 6,21" />
    `;
  }
}

function createRipple(event) {
  const btn = event.currentTarget;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;

  btn.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

// ============================================================
// 10. AUDIO VISUALIZER — Web Audio API frequency bars
// ============================================================

function initVisualizer() {
  vizCanvas = document.getElementById('visualizer-canvas');
  vizCtx = vizCanvas ? vizCanvas.getContext('2d') : null;
  vizDots = document.getElementById('viz-dots');

  if (!vizCanvas || !vizCtx) return;

  resizeVisualizer();
  window.addEventListener('resize', resizeVisualizer);

  // Start idle animation immediately
  startVisualizer();
}

function resizeVisualizer() {
  if (!vizCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const ww = window.innerWidth;
  const hh = 56;
  vizCanvas.width = ww * dpr;
  vizCanvas.height = hh * dpr;
  vizCanvas.style.width = ww + 'px';
  vizCanvas.style.height = hh + 'px';
}

function connectVisualizer(audioEl) {
  if (!vizCanvas || !audioEl) return;
  disconnectVisualizer();

  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    sourceNode = audioContext.createMediaElementSource(audioEl);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 128;
    analyserNode.smoothingTimeConstant = 0.85;

    gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);

    // Route: audio → analyser (for viz data) → gain (for volume) → speakers
    sourceNode.connect(analyserNode);
    analyserNode.connect(gainNode);
    gainNode.connect(audioContext.destination);

    prevFreqBins = new Float32Array(analyserNode.frequencyBinCount);
    vizDots?.classList.remove('active');
  } catch (e) {
    console.warn('Visualizer: could not connect —', e.message);
    sourceNode = null;
    analyserNode = null;
    gainNode = null;
  }
}

function disconnectVisualizer() {
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch {}
    sourceNode = null;
  }
  analyserNode = null;
  gainNode = null;
}

function startVisualizer() {
  if (vizRunning) return;
  vizRunning = true;
  drawVisualizer();
}

function stopVisualizer() {
  vizRunning = false;
  if (vizAnimId) {
    cancelAnimationFrame(vizAnimId);
    vizAnimId = null;
  }
}

function drawVisualizer() {
  if (!vizRunning) return;
  vizAnimId = requestAnimationFrame(drawVisualizer);

  if (!vizCtx || !vizCanvas) return;

  const width = vizCanvas.width;
  const height = vizCanvas.height;
  const dpr = window.devicePixelRatio || 1;

  vizCtx.clearRect(0, 0, width, height);

  if (analyserNode && gainNode && isPlaying) {
    // Real frequency data from playing audio
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserNode.getByteFrequencyData(dataArray);

    // Smooth data with previous frame
    if (prevFreqBins && prevFreqBins.length === bufferLength) {
      for (let i = 0; i < bufferLength; i++) {
        dataArray[i] = prevFreqBins[i] * VIZ_SMOOTHING + dataArray[i] * (1 - VIZ_SMOOTHING);
      }
    }
    prevFreqBins = new Uint8Array(dataArray);

    drawBars(dataArray, bufferLength, width, height, dpr);
  } else {
    // Idle state — gentle wave animation
    drawIdleBars(width, height, dpr);
  }
}

function drawBars(dataArray, bufferLength, width, height, dpr) {
  const barCount = Math.min(BAR_COUNT, bufferLength);
  const spacing = 2 * dpr;
  const totalSpacing = spacing * (barCount - 1);
  const barWidth = (width - totalSpacing) / barCount;
  const radius = Math.min(barWidth / 2, 3 * dpr);

  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor((i / barCount) * bufferLength);
    const value = dataArray[dataIndex] / 255;
    const barHeight = Math.max(1 * dpr, value * height * 0.85);
    const x = i * (barWidth + spacing);
    const y = height - barHeight;

    // Color gradient based on height — cyan ➜ purple ➜ pink
    let r, g, b;
    if (value < 0.3) {
      const t = value / 0.3;
      r = Math.round(0 + t * 123);
      g = Math.round(212 - t * 108);
      b = 255;
    } else if (value < 0.65) {
      const t = (value - 0.3) / 0.35;
      r = Math.round(123 + t * 132);
      g = Math.round(104 - t * 0);
      b = Math.round(238 - t * 39);
    } else {
      const t = (value - 0.65) / 0.35;
      r = 255;
      g = Math.round(110 - t * 40);
      b = Math.round(199 + t * 56);
    }

    vizCtx.globalAlpha = 0.35 + value * 0.65;
    vizCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    vizCtx.beginPath();
    vizCtx.roundRect(x, y, barWidth, barHeight, [radius, radius, 0, 0]);
    vizCtx.fill();
  }
  vizCtx.globalAlpha = 1;
}

function drawIdleBars(width, height, dpr) {
  const now = Date.now() / 1000;
  const barCount = 24;
  const spacing = 2 * dpr;
  const totalSpacing = spacing * (barCount - 1);
  const barWidth = (width - totalSpacing) / barCount;
  const radius = Math.min(barWidth / 2, 3 * dpr);

  for (let i = 0; i < barCount; i++) {
    // Gentle sine wave — subtle breathing effect
    const value = (Math.sin(now * 1.8 + i * 0.35) + 1) / 2 * 0.18 + 0.04;
    const barHeight = Math.max(1 * dpr, value * height);
    const x = i * (barWidth + spacing);
    const y = height - barHeight;

    vizCtx.globalAlpha = 0.15 + value * 0.5;
    vizCtx.fillStyle = 'rgba(123, 104, 238, 0.6)';
    vizCtx.beginPath();
    vizCtx.roundRect(x, y, barWidth, barHeight, [radius, radius, 0, 0]);
    vizCtx.fill();
  }
  vizCtx.globalAlpha = 1;
}

// ============================================================
// 11. iOS-STYLE PLAYLIST — Fetch, Build, Open/Close logic
// ============================================================

// ---------- Clean filename for display ----------
function cleanTrackName(fileName) {
  if (!fileName) return '';
  let name = fileName.replace(/\.(mp3|wav|m4a|ogg)$/i, '');
  // Remove garbage patterns from download sites (case insensitive)
  name = name.replace(/savetik\.?\s*io/gi, '');
  name = name.replace(/www\./gi, '');
  name = name.replace(/\.com/gi, '');
  name = name.replace(/y2mate|ytmp3|yt1s|ssyoutube|mp3juice/gi, '');
  // Remove long number sequences (6+ digits — likely download IDs)
  name = name.replace(/\d{6,}/g, '');
  // Remove bracketed garbage like [song], (cover), {id}
  name = name.replace(/[\[\](){}\u005B\u005D]/g, ' ');
  // Replace separators with spaces
  name = name.replace(/[_\-.]/g, ' ');
  // Collapse multiple spaces
  name = name.replace(/\s+/g, ' ').trim();
  // Capitalize first letter of each word
  name = name.replace(/\b\w/g, c => c.toUpperCase());
  return name;
}

// ---------- Get display name for track at given music track index ----------
function getTrackDisplayName(trackIndex) {
  const track = musicTracks[trackIndex];
  return track ? track.displayName : null;
}

// ============================================================
// 12. SLOGAN — Fetch from server/setting.json
// ============================================================

async function fetchSlogan() {
  try {
    const res = await fetch('/api/setting');
    if (!res.ok) throw new Error('Server unavailable');
    const data = await res.json();
    if (data && data.slogan) {
      const subtitleEl = document.querySelector('.subtitle');
      if (subtitleEl) {
        subtitleEl.textContent = `✶ ${data.slogan}`;
      }
      // Update HTML page title as well
      document.title = `${data.slogan} — Cinematic Experience`;
    }
  } catch {
    // Server unavailable — keep default subtitle
    console.warn('Could not fetch slogan from server');
  }
}

// ---------- Fetch music list from server (independent of backgrounds) ----------
async function fetchMusicList() {
  try {
    const res = await fetch('/api/music');
    if (!res.ok) throw new Error('Server unavailable');
    const { music = [] } = await res.json();

    // Build musicTracks array: fully independent from backgrounds
    musicTracks = music.map((fileName, idx) => ({
      fileName,
      displayName: cleanTrackName(fileName) || `Track ${idx + 1}`,
      url: `/server/background_music/${encodeURIComponent(fileName)}`,
      index: idx
    }));
  } catch {
    // Server unavailable — keep whatever was built from fetchMediaFiles
    // musicTracks may already be populated by fetchMediaFiles()
    if (musicTracks.length === 0) {
      musicTracks = [];
    }
  }
}

// ---------- Build playlist UI from musicTracks ----------
function buildPlaylist() {
  if (!playlistTracks) return;

  // Clear existing
  playlistTracks.innerHTML = '';

  if (musicTracks.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'playlist-empty';
    empty.textContent = '🎵 No music tracks available';
    playlistTracks.appendChild(empty);
    return;
  }

  musicTracks.forEach((track, index) => {
    const li = document.createElement('li');
    li.className = 'playlist-track';
    if (track.index === currentTrackIndex) {
      li.classList.add('active-track');
    }
    li.dataset.trackIndex = track.index;

    // Track number
    const numSpan = document.createElement('span');
    numSpan.className = 'playlist-track-num';
    numSpan.textContent = String(index + 1).padStart(2, '0');

    // Play icon indicator
    const iconDiv = document.createElement('div');
    iconDiv.className = 'playlist-track-icon';
    iconDiv.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>`;

    // Track info wrapper
    const infoDiv = document.createElement('div');
    infoDiv.className = 'playlist-track-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'playlist-track-name';
    nameSpan.textContent = track.displayName;

    const subSpan = document.createElement('span');
    subSpan.className = 'playlist-track-sub';
    subSpan.textContent = `Track ${track.index + 1}`;

    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(subSpan);

    // Playing indicator dot
    const indicator = document.createElement('span');
    indicator.className = 'playlist-track-indicator';

    li.appendChild(numSpan);
    li.appendChild(iconDiv);
    li.appendChild(infoDiv);
    li.appendChild(indicator);

    // Click handler — ONLY switch music track, DO NOT change background
    li.addEventListener('click', (e) => {
      e.stopPropagation();
      const trackIdx = track.index;
      if (trackIdx >= 0 && trackIdx < musicTracks.length) {
        // Switch music independently — background stays the same
        if (currentTrackIndex !== trackIdx) {
          switchTrack(trackIdx);
        }
        // Auto-play the selected track
        if (!isPlaying) {
          isPlaying = true;
          updatePlayButton();
          fadeInAudio();
          vizDots?.classList.add('active');
          startLyricsCycle();
          saveState();
        }
      }
      // Auto-close playlist with elegant animation
      closePlaylist();
    });

    playlistTracks.appendChild(li);
  });
}

// ---------- Update active track highlight in playlist (by music track index) ----------
function updatePlaylistActiveTrack(trackIndex) {
  if (!playlistTracks) return;
  const items = playlistTracks.querySelectorAll('.playlist-track');
  items.forEach((item) => {
    const idx = parseInt(item.dataset.trackIndex, 10);
    item.classList.toggle('active-track', idx === trackIndex);
  });
}

// ---------- Open playlist with iOS slide-up animation ----------
function openPlaylist() {
  if (isPlaylistOpen) return;
  isPlaylistOpen = true;

  // Rebuild playlist in case tracks changed
  buildPlaylist();

  // Show overlay — triggers CSS transition
  playlistOverlay.classList.add('visible');

  // Prevent body scroll
  document.body.style.overflow = 'hidden';
}

// ---------- Close playlist with iOS slide-down animation ----------
function closePlaylist() {
  if (!isPlaylistOpen) return;
  isPlaylistOpen = false;

  // Hide overlay — triggers CSS transition (panel slides down, fades out)
  playlistOverlay.classList.remove('visible');

  // Restore body scroll after animation completes
  setTimeout(() => {
    document.body.style.overflow = '';
  }, 550);
}

// ---------- Initialize playlist: fetch, build, wire events ----------
async function initPlaylist() {
  // Fetch music list from server
  await fetchMusicList();

  // Build initial playlist UI
  buildPlaylist();

  // --- Wire event listeners ---

  // Click track label to open playlist
  if (trackLabel) {
    trackLabel.addEventListener('click', (e) => {
      e.stopPropagation();
      openPlaylist();
    });
  }

  // Close button
  if (playlistCloseBtn) {
    playlistCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closePlaylist();
    });
  }

  // Backdrop click to close
  if (playlistBackdrop) {
    playlistBackdrop.addEventListener('click', () => {
      closePlaylist();
    });
  }

  // Escape key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isPlaylistOpen) {
      closePlaylist();
    }
  });
}

// ============================================================
// 13. UI TOGGLE — Hide/show all UI, overrides auto-hide timers
// ============================================================

const uiToggleBtn = document.getElementById('ui-toggle-btn');
const STORAGE_KEY_UI_HIDDEN = 'cinematic_ui_hidden';

function toggleUI() {
  const isHidden = document.body.classList.toggle('ui-hidden');

  // Swap icon: eye → eye-off when hidden
  const svg = uiToggleBtn.querySelector('svg');
  if (isHidden) {
    svg.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    `;
    uiToggleBtn.classList.add('active');
    // Clear auto-hide timers — manual toggle takes precedence
    if (audioHideTimer) clearTimeout(audioHideTimer);
    if (imgPlHideTimer) clearTimeout(imgPlHideTimer);
  } else {
    svg.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    `;
    uiToggleBtn.classList.remove('active');
    // Immediately show both panels (in case auto-hide had previously fired)
    showAudioUI();
    showImagePlaylist();
    // Resume auto-hide timers when showing UI again
    resetAudioHideTimer();
    resetImagePlaylistTimer();
  }

  // Save state
  try {
    localStorage.setItem(STORAGE_KEY_UI_HIDDEN, String(isHidden));
  } catch {}
}

function initUiToggle() {
  if (!uiToggleBtn) return;

  uiToggleBtn.addEventListener('click', (e) => {
    createRipple(e);
    toggleUI();
  });

  // Restore saved state
  try {
    const saved = localStorage.getItem(STORAGE_KEY_UI_HIDDEN);
    if (saved === 'true') {
      document.body.classList.add('ui-hidden');
      const svg = uiToggleBtn.querySelector('svg');
      svg.innerHTML = `
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      `;
      uiToggleBtn.classList.add('active');
      // Clear auto-hide timers
      if (audioHideTimer) clearTimeout(audioHideTimer);
      if (imgPlHideTimer) clearTimeout(imgPlHideTimer);
    }
  } catch {}
}

// ============================================================
// 14. SAVE / RESTORE STATE — localStorage persistence
// ============================================================

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY_BG, String(currentIndex));
    localStorage.setItem(STORAGE_KEY_MUTED, String(isMuted));
    localStorage.setItem(STORAGE_KEY_VOLUME, String(getVolume()));
  } catch {
    // localStorage may be unavailable
  }
}

function restoreState() {
  let restoredBgIndex = -1;
  try {
    const savedBg = localStorage.getItem(STORAGE_KEY_BG);
    if (savedBg !== null) {
      const idx = parseInt(savedBg, 10);
      if (!isNaN(idx) && idx >= 0 && idx < IMAGES.length) {
        currentIndex = idx;
        restoredBgIndex = idx;
      }
    }

    const savedMuted = localStorage.getItem(STORAGE_KEY_MUTED);
    if (savedMuted === 'true') {
      isMuted = true;
      muteBtn.classList.add('active');
      updateMuteIcon();
    }

    const savedVolume = localStorage.getItem(STORAGE_KEY_VOLUME);
    if (savedVolume !== null && volumeSlider) {
      volumeSlider.value = savedVolume;
      volumeSlider.style.setProperty('--vol-pct', `${parseFloat(savedVolume) * 100}%`);
    }
  } catch {
    // localStorage may be unavailable
  }
  return restoredBgIndex;
}

// ============================================================
// 15. MOBILE FORCED LANDSCAPE ROTATION
//     Automatically rotates the entire app to landscape on mobile
//     Flip button toggles between 90° (camera-left) and 270° (camera-right)
// ============================================================

const appWrapper = document.getElementById('app-wrapper');
const flipBtn = document.getElementById('flip-orientation-btn');

let rotateAngle = 90;          // 90 = camera-left, 270 = camera-right
let isForceRotated = false;
let orientationTimer = null;
let orientationResizeTimer = null;

function isMobileDevice() {
  return window.matchMedia('(max-width: 768px)').matches &&
         window.matchMedia('(pointer: coarse)').matches;
}

function isPortrait() {
  return window.innerHeight > window.innerWidth;
}

function applyForcedRotation(angle) {
  if (!appWrapper) return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (angle === 90) {
    // Camera cluster on LEFT side, charging port on RIGHT
    appWrapper.style.transform = `rotate(90deg) translateY(-${vw}px)`;
  } else {
    // Camera cluster on RIGHT side, charging port on LEFT
    appWrapper.style.transform = `rotate(270deg) translateX(-${vh}px)`;
  }
}

function enableForcedLandscape(angle = 90) {
  if (isForceRotated && rotateAngle === angle) return;

  rotateAngle = angle;
  isForceRotated = true;

  document.body.classList.add('force-landscape');
  applyForcedRotation(angle);
}

function disableForcedLandscape() {
  if (!isForceRotated) return;

  isForceRotated = false;
  document.body.classList.remove('force-landscape');

  if (appWrapper) {
    appWrapper.style.transform = '';
  }
}

function toggleFlipOrientation() {
  if (!isForceRotated) return;

  // Toggle between 90° (camera-left) and 270° (camera-right)
  rotateAngle = (rotateAngle === 90) ? 270 : 90;
  applyForcedRotation(rotateAngle);

  // Animate icon with a spin
  const icon = flipBtn?.querySelector('.flip-icon');
  if (icon) {
    icon.style.transition = 'transform 0.4s ease';
    icon.style.transform = 'rotate(360deg)';
    setTimeout(() => {
      icon.style.transform = '';
    }, 400);
  }

  // Show toast feedback
  const dirText = rotateAngle === 90 ? '📱 Cam trái' : '📱 Cam phải';
  showToast(`Đã đảo chiều — ${dirText}`, 'success', 2000);
}

function updateOrientationRotation() {
  const mobile = isMobileDevice();
  const portrait = isPortrait();

  // Cancel pending timers
  if (orientationTimer) {
    clearTimeout(orientationTimer);
    orientationTimer = null;
  }

  if (mobile && portrait) {
    // Force landscape mode after brief delay (avoid flash on page load)
    orientationTimer = setTimeout(() => {
      if (isMobileDevice() && isPortrait()) {
        enableForcedLandscape(rotateAngle);
      }
    }, 300);
  } else if (mobile && !portrait && isForceRotated) {
    // Already in landscape — keep rotation with current angle
    // Re-apply in case viewport changed (address bar hide/show)
    applyForcedRotation(rotateAngle);
  }
}

// Wire up flip button
if (flipBtn) {
  flipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // If not yet force-rotated, enable it first
    if (!isForceRotated) {
      enableForcedLandscape(90);
    }
    toggleFlipOrientation();
  });
}

// Listen for orientation changes and resize
if (typeof window !== 'undefined') {
  window.addEventListener('orientationchange', () => {
    clearTimeout(orientationTimer);
    orientationTimer = setTimeout(updateOrientationRotation, 400);
  });

  window.addEventListener('resize', () => {
    clearTimeout(orientationResizeTimer);
    orientationResizeTimer = setTimeout(updateOrientationRotation, 300);
  });
}

// ============================================================
// 16. MOBILE TOUCH ENHANCEMENTS
// ============================================================

function initMobileEnhancements() {
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (!isTouch) return;

  // Prevent double-tap zoom on buttons (500ms threshold)
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouch < 500) {
      e.preventDefault();
    }
    lastTouch = now;
  }, { passive: false });

  // Prevent pull-to-refresh on the page
  let touchStartY = 0;
  document.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    const deltaY = e.touches[0].clientY - touchStartY;
    // Only prevent if scrolling down from the very top of the page
    if (document.scrollingElement.scrollTop === 0 && deltaY > 0) {
      // Allow natural scrolling within playlist
      const target = e.target;
      if (target && target.closest('.playlist-scroll')) return;
      e.preventDefault();
    }
  }, { passive: false });
}

// ============================================================
// 17. IMAGE PLAYLIST — Top-right corner dot indicators
//     FIXED: Max 5 dots visible, smooth scroll, instant click response
//     Double-buffering via preload + 50ms response guarantee
//     Arrows and dots: 100% reliable click handlers
// ============================================================

let imgPlaylistScrollIndex = 0;
const IMG_PL_MAX_VISIBLE = 5;

function initImagePlaylist() {
  const container = document.getElementById('image-playlist-container');
  const dotsContainer = document.getElementById('img-pl-dots');
  if (!container || !dotsContainer) return;

  // Show container only if there are 2+ images
  if (IMAGES.length >= 2) {
    container.style.display = 'flex';
  } else {
    container.style.display = 'none';
    return;
  }

  // Build dots from current IMAGES array
  buildImagePlaylistDots();

  // Wire arrow buttons — single source of truth for navigation
  // FIXED: removed redundant scrollIndex manipulation that conflicted
  // with ensureImagePlaylistActiveVisible() in updateImagePlaylistDots()
  const prevBtn = document.getElementById('img-pl-prev');
  const nextBtn = document.getElementById('img-pl-next');

  if (prevBtn) {
    // Replace all old listeners with fresh one
    const newPrev = prevBtn.cloneNode(true);
    prevBtn.parentNode.replaceChild(newPrev, prevBtn);
    newPrev.addEventListener('click', (e) => {
      e.preventDefault();
      const prevIdx = (currentIndex - 1 + IMAGES.length) % IMAGES.length;
      // Navigate background immediately — switchBackground handles double-buffering
      switchBackground(prevIdx);
      // updateImagePlaylistDots() is called inside switchBackground()
      // which calls ensureImagePlaylistActiveVisible() automatically
      resetImagePlaylistTimer();
      // Also reset audio hide timer — clicking playlist should NOT hide audio
      resetAudioHideTimer();
    });
  }

  if (nextBtn) {
    const newNext = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(newNext, nextBtn);
    newNext.addEventListener('click', (e) => {
      e.preventDefault();
      const nextIdx = (currentIndex + 1) % IMAGES.length;
      switchBackground(nextIdx);
      resetImagePlaylistTimer();
      resetAudioHideTimer();
    });
  }
}

function buildImagePlaylistDots() {
  const dotsContainer = document.getElementById('img-pl-dots');
  if (!dotsContainer) return;

  dotsContainer.innerHTML = '';

  const count = IMAGES.length;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('button');
    dot.className = `img-pl-dot${i === currentIndex ? ' active' : ''}`;
    dot.setAttribute('aria-label', `Switch to background ${i + 1}`);
    // FIXED: Direct switchBackground call with robust guard
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (i === currentIndex) return; // skip if same
      switchBackground(i);
      // updateImagePlaylistDots() is called inside switchBackground()
      resetImagePlaylistTimer();
      resetAudioHideTimer();
    });
    dotsContainer.appendChild(dot);
  }

  // Initial scroll position: keep active dot in view
  ensureImagePlaylistActiveVisible();
  renderImagePlaylistDots();
}

function updateImagePlaylistDots() {
  const dotsContainer = document.getElementById('img-pl-dots');
  if (!dotsContainer) return;

  // Update active class on each dot
  const dots = dotsContainer.querySelectorAll('.img-pl-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === currentIndex);
  });

  // Auto-scroll to keep active dot visible
  ensureImagePlaylistActiveVisible();
  renderImagePlaylistDots();
}

function ensureImagePlaylistActiveVisible() {
  const total = IMAGES.length;
  if (total <= IMG_PL_MAX_VISIBLE) {
    imgPlaylistScrollIndex = 0;
    return;
  }

  // If active dot is to the left of the visible range, scroll left
  if (currentIndex < imgPlaylistScrollIndex) {
    imgPlaylistScrollIndex = currentIndex;
  }
  // If active dot is to the right of the visible range, scroll right
  else if (currentIndex >= imgPlaylistScrollIndex + IMG_PL_MAX_VISIBLE) {
    imgPlaylistScrollIndex = currentIndex - IMG_PL_MAX_VISIBLE + 1;
  }

  // Clamp
  const maxStart = Math.max(0, total - IMG_PL_MAX_VISIBLE);
  if (imgPlaylistScrollIndex > maxStart) {
    imgPlaylistScrollIndex = maxStart;
  }
}

function renderImagePlaylistDots() {
  const dotsContainer = document.getElementById('img-pl-dots');
  if (!dotsContainer) return;

  const dots = dotsContainer.querySelectorAll('.img-pl-dot');

  // Smooth slide: use transformX on the container itself
  // Calculate offset: each dot is 7px + 0.35rem gap (~12.6px total)
  const dotSize = 5;
  const gapSize = parseFloat(getComputedStyle(dotsContainer).gap) || 5.6;
  const step = dotSize + gapSize;
  const offset = imgPlaylistScrollIndex * step;

  // Apply smooth translation
  dotsContainer.style.transform = `translateX(-${offset}px)`;
  dotsContainer.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

  // All dots stay rendered — container overflow:hidden clips them
  // Just ensure they all have proper opacity for those in view
  dots.forEach((dot, i) => {
    if (i >= imgPlaylistScrollIndex && i < imgPlaylistScrollIndex + IMG_PL_MAX_VISIBLE) {
      dot.style.opacity = '1';
      dot.style.pointerEvents = 'auto';
    } else {
      dot.style.opacity = '0.15';
      dot.style.pointerEvents = 'none';
    }
  });
}

// ============================================================
// 18. IMAGE PLAYLIST AUTO-HIDE — 10s idle timer
//     FIXED: Synchronized with audio auto-hide
//     Shows on \ key or hover on top-right corner
//     Clicking playlist does NOT hide/interrupt audio
// ============================================================

let imgPlHideTimer = null;

function showImagePlaylist() {
  if (document.body.classList.contains('ui-hidden')) return;
  const container = document.getElementById('image-playlist-container');
  if (!container) return;
  container.classList.remove('playlist-hidden');
  resetImagePlaylistTimer();
}

function hideImagePlaylist() {
  const container = document.getElementById('image-playlist-container');
  if (!container) return;
  container.classList.add('playlist-hidden');
}

function resetImagePlaylistTimer() {
  if (imgPlHideTimer) {
    clearTimeout(imgPlHideTimer);
  }
  imgPlHideTimer = setTimeout(hideImagePlaylist, 10000);
}

function initImagePlaylistAutoHide() {
  const container = document.getElementById('image-playlist-container');
  if (!container) return;

  // Show on mouse hover over the top-right corner of the screen
  // Use requestAnimationFrame throttling for performance
  let rafId = null;
  document.addEventListener('mousemove', (e) => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const x = e.clientX;
      const y = e.clientY;
      // Active zone: top-right 250x250px area (increased from 220 for better UX)
      if (x > window.innerWidth - 250 && y < 250) {
        showImagePlaylist();
      }
    });
  });

  // Start the initial timer
  resetImagePlaylistTimer();
}

// ============================================================
// BOOT — Start everything
// ============================================================

function boot() {
  init();

  // Mobile forced landscape rotation (replaces old orientation prompt)
  updateOrientationRotation();
  initMobileEnhancements();

  // initVisualizer() is called inside init() — no need to call twice
}

boot();
