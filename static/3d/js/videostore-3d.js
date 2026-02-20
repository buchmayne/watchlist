/**
 * Photorealistic Video Store - Three.js WebGL Implementation
 *
 * Uses global THREE object (loaded via script tag)
 */

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
    store: {
        width: 12,
        depth: 8,
        height: 3.5,
        shelfDepth: 0.45,
        shelfHeight: 2.2,
        shelfWidth: 3.5
    },
    vhs: {
        width: 0.135,
        height: 0.19,
        depth: 0.025,
        gap: 0.01
    },
    camera: {
        fov: 45,
        near: 0.1,
        far: 100,
        startPosition: { x: 0, y: 1.6, z: 4 },
        browsingPosition: { x: 0, y: 1.4, z: 2.2 },
        selectionPosition: { x: 0, y: 1.4, z: 1.5 }
    },
    lighting: {
        ambient: 0.15,
        fluorescentIntensity: 2.5,
        fluorescentColor: 0xfff8e8,
        warmAccent: 0xffa500
    },
    animation: {
        handBrowseSpeed: 0.3,
        cameraTransitionDuration: 1.5
    },
    quality: {
        shadowMapSize: 1024,
        maxAnisotropy: 16
    }
};

// ============================================================================
// Main VideoStore3D Class
// ============================================================================

class VideoStore3D {
    constructor(container, options = {}) {
        this.container = container;
        this.options = { ...CONFIG, ...options };

        // State
        this.isInitialized = false;
        this.isAnimating = false;
        this.movies = [];
        this.vhsBoxes = [];
        this.selectedMovie = null;
        this.selectedVHSIndex = -1;
        this.browsingPath = [];
        this.currentPathIndex = 0;

        // Three.js objects
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();

        // Lighting
        this.fluorescentLights = [];
        this.fluorescentFlickerPhase = [];

        // Environment
        this.floor = null;
        this.ceiling = null;
        this.walls = null;
        this.shelves = [];
        this.shelfGroup = null;

        // Hand
        this.hand = null;

        // Particles
        this.dustParticles = null;

        // Textures
        this.textureLoader = new THREE.TextureLoader();
        this.textures = {};

        // Sound callbacks
        this.onTickSound = null;
        this.onSelectionSound = null;
        this.soundEnabled = true;
    }

    // ========================================================================
    // Initialization
    // ========================================================================

    async init() {
        if (this.isInitialized) return;

        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        this.scene.fog = new THREE.Fog(0x1a1a2e, 5, 15);

        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            this.options.camera.fov,
            this.container.clientWidth / this.container.clientHeight,
            this.options.camera.near,
            this.options.camera.far
        );
        const startPos = this.options.camera.startPosition;
        this.camera.position.set(startPos.x, startPos.y, startPos.z);
        this.camera.lookAt(0, 1.2, 0);

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;

        this.container.appendChild(this.renderer.domElement);

        // Create procedural textures
        this.createProceduralTextures();

        // Build environment
        this.createEnvironment();
        this.createLighting();
        this.createDustParticles();
        this.createHand();

        // Event listeners
        this._onResize = this.onResize.bind(this);
        window.addEventListener('resize', this._onResize);

        this.isInitialized = true;
    }

    // ========================================================================
    // Procedural Textures
    // ========================================================================

    createProceduralTextures() {
        // Wood texture
        this.textures.wood = this.createWoodTexture();
        // Floor texture
        this.textures.floor = this.createFloorTexture();
        // Ceiling texture
        this.textures.ceiling = this.createCeilingTexture();
    }

    createWoodTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Wood base
        const gradient = ctx.createLinearGradient(0, 0, 512, 512);
        gradient.addColorStop(0, '#5c3d2e');
        gradient.addColorStop(0.3, '#4a3020');
        gradient.addColorStop(0.6, '#3d2518');
        gradient.addColorStop(1, '#4a3020');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);

        // Wood grain lines
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 512; i += 3) {
            ctx.beginPath();
            ctx.moveTo(0, i + Math.sin(i * 0.05) * 8);
            ctx.lineTo(512, i + Math.sin(i * 0.05 + 2) * 8);
            ctx.stroke();
        }

        // Add some knots
        for (let k = 0; k < 3; k++) {
            const kx = Math.random() * 400 + 50;
            const ky = Math.random() * 400 + 50;
            const gradient2 = ctx.createRadialGradient(kx, ky, 0, kx, ky, 20);
            gradient2.addColorStop(0, 'rgba(30,20,10,0.6)');
            gradient2.addColorStop(1, 'rgba(60,40,25,0)');
            ctx.fillStyle = gradient2;
            ctx.beginPath();
            ctx.arc(kx, ky, 20, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    createFloorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Dark carpet
        ctx.fillStyle = '#2a2a3e';
        ctx.fillRect(0, 0, 512, 512);

        // Carpet texture
        for (let i = 0; i < 8000; i++) {
            const shade = Math.random() * 30 - 15;
            ctx.fillStyle = `rgb(${42 + shade}, ${42 + shade}, ${62 + shade})`;
            ctx.fillRect(
                Math.random() * 512,
                Math.random() * 512,
                2 + Math.random() * 2,
                2 + Math.random() * 2
            );
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    createCeilingTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Acoustic tile base
        ctx.fillStyle = '#d8d4cc';
        ctx.fillRect(0, 0, 256, 256);

        // Dot pattern
        ctx.fillStyle = '#c0bdb5';
        for (let x = 4; x < 256; x += 8) {
            for (let y = 4; y < 256; y += 8) {
                ctx.beginPath();
                ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    // ========================================================================
    // Environment Creation
    // ========================================================================

    createEnvironment() {
        this.createFloor();
        this.createCeiling();
        this.createWalls();
        this.createShelves();
        this.createNeonSign();
    }

    createFloor() {
        const { store } = this.options;
        const geometry = new THREE.PlaneGeometry(store.width, store.depth);

        this.textures.floor.repeat.set(4, 3);

        const material = new THREE.MeshStandardMaterial({
            map: this.textures.floor,
            roughness: 0.85,
            metalness: 0.0
        });

        this.floor = new THREE.Mesh(geometry, material);
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.receiveShadow = true;
        this.scene.add(this.floor);
    }

    createCeiling() {
        const { store } = this.options;
        const geometry = new THREE.PlaneGeometry(store.width, store.depth);

        this.textures.ceiling.repeat.set(6, 4);

        const material = new THREE.MeshStandardMaterial({
            map: this.textures.ceiling,
            roughness: 0.9,
            metalness: 0.0
        });

        this.ceiling = new THREE.Mesh(geometry, material);
        this.ceiling.position.y = store.height;
        this.ceiling.rotation.x = Math.PI / 2;
        this.ceiling.receiveShadow = true;
        this.scene.add(this.ceiling);
    }

    createWalls() {
        const { store } = this.options;
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x1e1e32,
            roughness: 0.7,
            metalness: 0.0
        });

        // Back wall
        const backWall = new THREE.Mesh(
            new THREE.PlaneGeometry(store.width, store.height),
            wallMaterial
        );
        backWall.position.set(0, store.height / 2, -store.depth / 2);
        backWall.receiveShadow = true;
        this.scene.add(backWall);

        // Left wall
        const leftWall = new THREE.Mesh(
            new THREE.PlaneGeometry(store.depth, store.height),
            wallMaterial
        );
        leftWall.position.set(-store.width / 2, store.height / 2, 0);
        leftWall.rotation.y = Math.PI / 2;
        leftWall.receiveShadow = true;
        this.scene.add(leftWall);

        // Right wall
        const rightWall = new THREE.Mesh(
            new THREE.PlaneGeometry(store.depth, store.height),
            wallMaterial
        );
        rightWall.position.set(store.width / 2, store.height / 2, 0);
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.receiveShadow = true;
        this.scene.add(rightWall);

        this.walls = { backWall, leftWall, rightWall };
    }

    createNeonSign() {
        const { store } = this.options;

        // Create "STAFF PICKS" sign
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, 512, 128);

        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ff00de';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#ff88ff';
        ctx.fillText('STAFF PICKS', 256, 64);
        ctx.shadowBlur = 10;
        ctx.fillText('STAFF PICKS', 256, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true
        });

        const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.3),
            material
        );
        sign.position.set(0, 2.5, -store.depth / 2 + 0.02);
        this.scene.add(sign);

        // Glow light
        const signLight = new THREE.PointLight(0xff00de, 0.5, 3);
        signLight.position.set(0, 2.5, -store.depth / 2 + 0.5);
        this.scene.add(signLight);
    }

    createShelves() {
        const { store, vhs } = this.options;

        this.shelfGroup = new THREE.Group();

        const shelfWidth = store.shelfWidth;
        const shelfDepth = store.shelfDepth;
        const shelfHeight = store.shelfHeight;
        const numShelves = 3;
        const shelfThickness = 0.03;

        this.textures.wood.repeat.set(2, 0.5);

        const woodMaterial = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            roughness: 0.75,
            metalness: 0.0
        });

        // Side panels
        const sidePanelGeometry = new THREE.BoxGeometry(shelfThickness, shelfHeight, shelfDepth);

        const leftPanel = new THREE.Mesh(sidePanelGeometry, woodMaterial);
        leftPanel.position.set(-shelfWidth / 2 - shelfThickness / 2, shelfHeight / 2, 0);
        leftPanel.castShadow = true;
        leftPanel.receiveShadow = true;
        this.shelfGroup.add(leftPanel);

        const rightPanel = new THREE.Mesh(sidePanelGeometry, woodMaterial);
        rightPanel.position.set(shelfWidth / 2 + shelfThickness / 2, shelfHeight / 2, 0);
        rightPanel.castShadow = true;
        rightPanel.receiveShadow = true;
        this.shelfGroup.add(rightPanel);

        // Back panel
        const backPanel = new THREE.Mesh(
            new THREE.BoxGeometry(shelfWidth, shelfHeight, shelfThickness / 2),
            woodMaterial
        );
        backPanel.position.set(0, shelfHeight / 2, -shelfDepth / 2);
        backPanel.receiveShadow = true;
        this.shelfGroup.add(backPanel);

        // Horizontal shelves
        const shelfPlankGeometry = new THREE.BoxGeometry(shelfWidth, shelfThickness, shelfDepth);

        for (let i = 0; i <= numShelves; i++) {
            const shelfY = i * 0.45 + 0.6;
            const shelfMesh = new THREE.Mesh(shelfPlankGeometry, woodMaterial.clone());
            shelfMesh.position.set(0, shelfY, 0);
            shelfMesh.castShadow = true;
            shelfMesh.receiveShadow = true;
            this.shelfGroup.add(shelfMesh);

            this.shelves.push({
                mesh: shelfMesh,
                y: shelfY + shelfThickness / 2 + vhs.height / 2,
                z: 0
            });
        }

        this.shelfGroup.position.set(0, 0, -store.depth / 2 + shelfDepth / 2 + 0.5);
        this.scene.add(this.shelfGroup);
    }

    // ========================================================================
    // Lighting
    // ========================================================================

    createLighting() {
        const { store, lighting } = this.options;

        // Ambient
        const ambient = new THREE.AmbientLight(0x404060, lighting.ambient);
        this.scene.add(ambient);

        // Fluorescent lights
        const tubePositions = [
            { x: -1.5, z: -1 },
            { x: 1.5, z: -1 },
            { x: 0, z: 1 }
        ];

        tubePositions.forEach((pos, index) => {
            // Emissive tube
            const tubeGeometry = new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8);
            const tubeMaterial = new THREE.MeshBasicMaterial({
                color: lighting.fluorescentColor
            });

            const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
            tube.rotation.z = Math.PI / 2;
            tube.position.set(pos.x, store.height - 0.1, pos.z);
            this.scene.add(tube);

            // Fixture
            const fixture = new THREE.Mesh(
                new THREE.BoxGeometry(1.4, 0.08, 0.15),
                new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.3 })
            );
            fixture.position.set(pos.x, store.height - 0.04, pos.z);
            fixture.castShadow = true;
            this.scene.add(fixture);

            // Light
            const light = new THREE.PointLight(
                lighting.fluorescentColor,
                lighting.fluorescentIntensity,
                6
            );
            light.position.set(pos.x, store.height - 0.15, pos.z);
            light.castShadow = true;
            light.shadow.mapSize.width = this.options.quality.shadowMapSize;
            light.shadow.mapSize.height = this.options.quality.shadowMapSize;
            this.scene.add(light);

            this.fluorescentLights.push({
                tube,
                light,
                baseIntensity: lighting.fluorescentIntensity,
                material: tubeMaterial
            });
            this.fluorescentFlickerPhase.push(Math.random() * Math.PI * 2);
        });

        // Warm accent
        const warmLight = new THREE.PointLight(lighting.warmAccent, 0.3, 8);
        warmLight.position.set(-store.width / 3, 2, store.depth / 4);
        this.scene.add(warmLight);
    }

    updateFluorescentFlicker(time) {
        this.fluorescentLights.forEach((light, index) => {
            const phase = this.fluorescentFlickerPhase[index];
            let flicker = 1.0;
            flicker += Math.sin(time * 2 + phase) * 0.02;
            flicker += Math.sin(time * 7 + phase * 2) * 0.01;

            const flickerChance = Math.sin(time * 0.5 + phase) * 0.5 + 0.5;
            if (flickerChance > 0.98) {
                flicker *= 0.7 + Math.random() * 0.3;
            }

            light.light.intensity = light.baseIntensity * flicker;
        });
    }

    // ========================================================================
    // Dust Particles
    // ========================================================================

    createDustParticles() {
        const { store } = this.options;
        const particleCount = 300;

        const positions = new Float32Array(particleCount * 3);
        const velocities = [];

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * store.width;
            positions[i * 3 + 1] = Math.random() * store.height;
            positions[i * 3 + 2] = (Math.random() - 0.5) * store.depth;

            velocities.push({
                x: (Math.random() - 0.5) * 0.002,
                y: Math.random() * 0.001 - 0.0005,
                z: (Math.random() - 0.5) * 0.002
            });
        }

        this.dustVelocities = velocities;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: 0xffffee,
            size: 0.015,
            transparent: true,
            opacity: 0.4,
            sizeAttenuation: true,
            blending: THREE.AdditiveBlending
        });

        this.dustParticles = new THREE.Points(geometry, material);
        this.scene.add(this.dustParticles);
    }

    updateDustParticles() {
        if (!this.dustParticles) return;

        const positions = this.dustParticles.geometry.attributes.position.array;
        const { store } = this.options;

        for (let i = 0; i < this.dustVelocities.length; i++) {
            const vel = this.dustVelocities[i];
            positions[i * 3] += vel.x;
            positions[i * 3 + 1] += vel.y;
            positions[i * 3 + 2] += vel.z;

            // Wrap
            if (positions[i * 3] > store.width / 2) positions[i * 3] = -store.width / 2;
            if (positions[i * 3] < -store.width / 2) positions[i * 3] = store.width / 2;
            if (positions[i * 3 + 1] > store.height) positions[i * 3 + 1] = 0;
            if (positions[i * 3 + 1] < 0) positions[i * 3 + 1] = store.height;
            if (positions[i * 3 + 2] > store.depth / 2) positions[i * 3 + 2] = -store.depth / 2;
            if (positions[i * 3 + 2] < -store.depth / 2) positions[i * 3 + 2] = store.depth / 2;
        }

        this.dustParticles.geometry.attributes.position.needsUpdate = true;
    }

    // ========================================================================
    // Hand
    // ========================================================================

    createHand() {
        const handGroup = new THREE.Group();

        const skinMaterial = new THREE.MeshStandardMaterial({
            color: 0xf5d0b5,
            roughness: 0.7,
            metalness: 0.0
        });

        // Palm
        const palm = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.1, 0.03),
            skinMaterial
        );
        handGroup.add(palm);

        // Fingers
        const fingerGeometry = new THREE.CylinderGeometry(0.01, 0.008, 0.07, 8);
        const fingerPositions = [
            { x: -0.025, y: 0.08, rot: -0.1 },
            { x: -0.008, y: 0.085, rot: -0.05 },
            { x: 0.008, y: 0.085, rot: 0.05 },
            { x: 0.025, y: 0.08, rot: 0.1 }
        ];

        fingerPositions.forEach(pos => {
            const finger = new THREE.Mesh(fingerGeometry, skinMaterial);
            finger.position.set(pos.x, pos.y, 0);
            finger.rotation.z = pos.rot;
            finger.rotation.x = -0.3;
            handGroup.add(finger);
        });

        // Thumb
        const thumb = new THREE.Mesh(
            new THREE.CylinderGeometry(0.012, 0.01, 0.05, 8),
            skinMaterial
        );
        thumb.position.set(-0.05, 0.02, 0.01);
        thumb.rotation.z = Math.PI / 3;
        thumb.rotation.x = -0.2;
        handGroup.add(thumb);

        // Wrist
        const wrist = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.15, 0.04),
            skinMaterial
        );
        wrist.position.set(0, -0.1, 0);
        handGroup.add(wrist);

        handGroup.rotation.x = -Math.PI / 6;
        handGroup.position.set(0, 1.2, 0.5);
        handGroup.visible = false;

        this.hand = handGroup;
        this.scene.add(handGroup);
    }

    // ========================================================================
    // VHS Boxes
    // ========================================================================

    createVHSBox(movie, index) {
        const { vhs } = this.options;
        const group = new THREE.Group();
        group.userData = { movie, index, isHighlighted: false, isSelected: false };

        // Case
        const plasticMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a2e,
            roughness: 0.35,
            metalness: 0.1
        });

        const caseMesh = new THREE.Mesh(
            new THREE.BoxGeometry(vhs.width, vhs.height, vhs.depth),
            plasticMaterial
        );
        caseMesh.castShadow = true;
        caseMesh.receiveShadow = true;
        group.add(caseMesh);

        // Poster
        const posterMaterial = this.createPosterMaterial(movie, index);
        const posterMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(vhs.width * 0.95, vhs.height * 0.95),
            posterMaterial
        );
        posterMesh.position.z = vhs.depth / 2 + 0.001;
        group.add(posterMesh);

        // Spine
        const spineColor = this.getGenreColor(movie);
        const spineMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(spineColor),
            roughness: 0.5,
            metalness: 0.0
        });
        const spineMesh = new THREE.Mesh(
            new THREE.BoxGeometry(vhs.depth * 0.8, vhs.height * 0.9, 0.002),
            spineMaterial
        );
        spineMesh.rotation.y = Math.PI / 2;
        spineMesh.position.x = -vhs.width / 2 - 0.001;
        group.add(spineMesh);

        group.userData.caseMesh = caseMesh;
        group.userData.posterMesh = posterMesh;
        group.userData.originalPosition = new THREE.Vector3();

        return group;
    }

    createPosterMaterial(movie, index) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 384;
        const ctx = canvas.getContext('2d');

        if (movie.posterUrl) {
            // Load real poster
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = movie.posterUrl;

            // For now, use placeholder while loading
            this.drawPlaceholderPoster(ctx, movie, index);

            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;

            img.onload = () => {
                ctx.drawImage(img, 0, 0, 256, 384);
                texture.needsUpdate = true;
            };

            return new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.4,
                metalness: 0.0
            });
        } else {
            this.drawPlaceholderPoster(ctx, movie, index);

            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;

            return new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.4,
                metalness: 0.0
            });
        }
    }

    drawPlaceholderPoster(ctx, movie, index) {
        const baseColor = this.getGenreColor(movie);
        const color = new THREE.Color(baseColor);
        const hsl = {};
        color.getHSL(hsl);

        // Background gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, 384);
        color.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + 0.1));
        gradient.addColorStop(0, '#' + color.getHexString());
        color.setHSL(hsl.h, hsl.s, Math.max(0, hsl.l - 0.1));
        gradient.addColorStop(1, '#' + color.getHexString());
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 384);

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const words = movie.title.split(' ');
        let lines = [];
        let currentLine = '';

        words.forEach(word => {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            if (ctx.measureText(testLine).width > 220) {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        });
        if (currentLine) lines.push(currentLine);

        const lineHeight = 28;
        const startY = 192 - (lines.length - 1) * lineHeight / 2;

        lines.forEach((line, i) => {
            ctx.fillText(line, 128, startY + i * lineHeight);
        });
    }

    getGenreColor(movie) {
        if (movie.color) return movie.color;
        const colors = ['#5E81AC', '#88C0D0', '#A3BE8C', '#EBCB8B', '#D08770', '#BF616A', '#B48EAD', '#81A1C1'];
        return colors[Math.abs(movie.title.length) % colors.length];
    }

    populateShelvesWithMovies(movies) {
        const { vhs } = this.options;

        // Clear existing
        this.vhsBoxes.forEach(box => this.scene.remove(box));
        this.vhsBoxes = [];
        this.movies = movies;

        const shelfWidth = this.options.store.shelfWidth;
        const boxWidth = vhs.width + vhs.gap;
        const boxesPerShelf = Math.floor(shelfWidth / boxWidth);

        const usableShelves = this.shelves.slice(1, 4);
        const totalBoxes = boxesPerShelf * usableShelves.length;

        // Shuffle movies
        let displayMovies = [...movies];
        while (displayMovies.length < totalBoxes) {
            displayMovies = displayMovies.concat([...movies]);
        }
        for (let i = displayMovies.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [displayMovies[i], displayMovies[j]] = [displayMovies[j], displayMovies[i]];
        }
        displayMovies = displayMovies.slice(0, totalBoxes);

        let movieIndex = 0;
        const startX = -(boxesPerShelf - 1) * boxWidth / 2;

        usableShelves.forEach((shelf, shelfIndex) => {
            for (let i = 0; i < boxesPerShelf; i++) {
                if (movieIndex >= displayMovies.length) break;

                const movie = displayMovies[movieIndex];
                const box = this.createVHSBox(movie, movieIndex);

                const x = startX + i * boxWidth;
                const y = shelf.y;
                const z = this.shelfGroup.position.z + vhs.depth / 2 + 0.02;

                box.position.set(x, y, z);
                box.userData.originalPosition.copy(box.position);
                box.userData.shelfIndex = shelfIndex;
                box.userData.positionOnShelf = i;

                this.scene.add(box);
                this.vhsBoxes.push(box);
                movieIndex++;
            }
        });

        return displayMovies;
    }

    // ========================================================================
    // Animation
    // ========================================================================

    generateBrowsingPath(finalIndex) {
        const path = [];
        const finalBox = this.vhsBoxes[finalIndex];
        if (!finalBox) return [0];

        const finalShelf = finalBox.userData.shelfIndex;
        const finalPos = finalBox.userData.positionOnShelf;
        const boxesPerShelf = Math.floor(this.options.store.shelfWidth / (this.options.vhs.width + this.options.vhs.gap));

        let currentShelf = Math.floor(Math.random() * 3);
        let currentPos = Math.floor(Math.random() * boxesPerShelf);

        const maxSteps = 12;

        for (let step = 0; step < maxSteps; step++) {
            const currentBox = this.vhsBoxes.find(box =>
                box.userData.shelfIndex === currentShelf &&
                box.userData.positionOnShelf === currentPos
            );

            if (currentBox) {
                path.push(this.vhsBoxes.indexOf(currentBox));
            }

            const stepsRemaining = maxSteps - step;

            if (stepsRemaining <= 3) {
                if (currentShelf !== finalShelf) {
                    currentShelf += (finalShelf > currentShelf) ? 1 : -1;
                } else if (currentPos !== finalPos) {
                    currentPos += (finalPos > currentPos) ? 1 : -1;
                }
            } else {
                const moveType = Math.random();
                if (moveType < 0.7) {
                    const direction = Math.random() < 0.5 ? -1 : 1;
                    currentPos = Math.max(0, Math.min(boxesPerShelf - 1, currentPos + direction));
                } else if (moveType < 0.9) {
                    const direction = Math.random() < 0.5 ? -1 : 1;
                    currentShelf = Math.max(0, Math.min(2, currentShelf + direction));
                }
            }
        }

        path.push(finalIndex);
        return path;
    }

    async animateBrowsing(path, onComplete) {
        this.hand.visible = true;
        this.browsingPath = path;
        this.currentPathIndex = 0;

        // Move camera
        await this.animateCamera(this.options.camera.browsingPosition, 1.0);

        // Animate through path
        for (let i = 0; i < path.length; i++) {
            const boxIndex = path[i];
            const box = this.vhsBoxes[boxIndex];
            if (!box) continue;

            // Clear previous
            this.vhsBoxes.forEach(b => this.setBoxHighlight(b, false));
            this.setBoxHighlight(box, true);

            // Move hand
            const targetPos = box.position.clone();
            targetPos.z += 0.15;
            targetPos.y -= 0.05;
            await this.animateHandTo(targetPos, 0.3 + (i / path.length) * 0.2);

            // Sound
            if (this.onTickSound && this.soundEnabled) {
                this.onTickSound(600 + (i / path.length) * 200);
            }

            // Pause
            await this.wait(200 + (i / path.length) * 300);
        }

        // Select final
        const finalBox = this.vhsBoxes[path[path.length - 1]];
        if (finalBox) {
            await this.selectBox(finalBox);
        }

        if (onComplete) onComplete();
    }

    setBoxHighlight(box, highlighted) {
        box.userData.isHighlighted = highlighted;
        if (highlighted) {
            box.rotation.y = -0.15;
            box.position.z = box.userData.originalPosition.z + 0.03;
        } else {
            box.rotation.y = 0;
            box.position.z = box.userData.originalPosition.z;
        }
    }

    async selectBox(box) {
        box.userData.isSelected = true;

        if (this.onSelectionSound && this.soundEnabled) {
            this.onSelectionSound();
        }

        const startPos = box.position.clone();
        const endPos = new THREE.Vector3(startPos.x, startPos.y + 0.2, startPos.z + 0.8);

        const duration = 800;
        const startTime = performance.now();

        return new Promise(resolve => {
            const animate = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = this.easeOutCubic(progress);

                box.position.lerpVectors(startPos, endPos, eased);
                box.rotation.y = -0.15 * (1 - eased);
                box.scale.setScalar(1 + eased * 0.3);

                if (progress > 0.7) {
                    const fadeProgress = (progress - 0.7) / 0.3;
                    box.traverse(child => {
                        if (child.material) {
                            child.material.opacity = 1 - fadeProgress;
                            child.material.transparent = true;
                        }
                    });
                }

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    box.visible = false;
                    this.hand.visible = false;
                    resolve();
                }
            };
            animate();
        });
    }

    async animateHandTo(targetPosition, duration) {
        const startPos = this.hand.position.clone();
        const startTime = performance.now();
        const durationMs = duration * 1000;

        return new Promise(resolve => {
            const animate = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / durationMs, 1);
                const eased = this.easeOutQuad(progress);

                this.hand.position.lerpVectors(startPos, targetPosition, eased);
                this.hand.rotation.z = Math.sin(progress * Math.PI) * 0.1;

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            };
            animate();
        });
    }

    async animateCamera(targetPosition, duration) {
        const startPos = this.camera.position.clone();
        const targetVec = new THREE.Vector3(targetPosition.x, targetPosition.y, targetPosition.z);
        const startTime = performance.now();
        const durationMs = duration * 1000;

        return new Promise(resolve => {
            const animate = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(elapsed / durationMs, 1);
                const eased = this.easeInOutCubic(progress);

                this.camera.position.lerpVectors(startPos, targetVec, eased);
                this.camera.lookAt(0, 1.2, this.shelfGroup.position.z);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            };
            animate();
        });
    }

    // ========================================================================
    // Utilities
    // ========================================================================

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    easeOutQuad(t) {
        return t * (2 - t);
    }

    easeOutCubic(t) {
        return (--t) * t * t + 1;
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    }

    // ========================================================================
    // Main Loop
    // ========================================================================

    start() {
        if (this.isAnimating) return;
        this.isAnimating = true;
        this.animate();
    }

    stop() {
        this.isAnimating = false;
    }

    animate() {
        if (!this.isAnimating) return;

        requestAnimationFrame(this.animate.bind(this));

        const time = this.clock.getElapsedTime();

        this.updateFluorescentFlicker(time);
        this.updateDustParticles();

        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    // ========================================================================
    // Public API
    // ========================================================================

    async startBrowsingAnimation(movies, selectedMovie, onComplete) {
        const displayedMovies = this.populateShelvesWithMovies(movies);

        let finalIndex = displayedMovies.findIndex(m => m.title === selectedMovie.title);

        if (finalIndex === -1) {
            finalIndex = Math.floor(Math.random() * this.vhsBoxes.length);
            const box = this.vhsBoxes[finalIndex];
            if (box) {
                box.userData.movie = selectedMovie;
                const newPosterMaterial = this.createPosterMaterial(selectedMovie, finalIndex);
                box.userData.posterMesh.material = newPosterMaterial;
            }
        }

        const path = this.generateBrowsingPath(finalIndex);
        await this.animateBrowsing(path, onComplete);
    }

    reset() {
        const startPos = this.options.camera.startPosition;
        this.camera.position.set(startPos.x, startPos.y, startPos.z);
        this.camera.lookAt(0, 1.2, 0);

        if (this.hand) {
            this.hand.visible = false;
        }

        this.vhsBoxes.forEach(box => {
            box.visible = true;
            box.position.copy(box.userData.originalPosition);
            box.rotation.set(0, 0, 0);
            box.scale.setScalar(1);
            box.traverse(child => {
                if (child.material) {
                    child.material.opacity = 1;
                    child.material.transparent = false;
                }
            });
        });
    }

    dispose() {
        this.stop();
        window.removeEventListener('resize', this._onResize);

        this.scene.traverse(object => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(m => m.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });

        Object.values(this.textures).forEach(texture => texture.dispose());
        this.renderer.dispose();

        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }

        this.isInitialized = false;
    }
}

// Make available globally
window.VideoStore3D = VideoStore3D;
