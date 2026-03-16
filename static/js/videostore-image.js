/**
 * VideoStoreImage - 2D image-based video store visualization
 * Uses a photorealistic base shelf image with CSS-positioned movie poster overlays
 */
class VideoStoreImage {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            baseImagePath: '/static/empty_base_shelf_image.png',
            positionsPath: '/static/dvd-positions.json',
            posterSize: 'w185', // TMDB poster size
            browsingDuration: 4000, // Total browsing animation time in ms
            ...options
        };

        this.positions = [];
        this.posterElements = [];
        this.isInitialized = false;
        this.currentHighlightIndex = -1;
        this.animationFrame = null;

        // Sound callbacks (to be set by parent)
        this.onTickSound = null;
        this.onSelectionSound = null;
        this.soundEnabled = true;
    }

    /**
     * Initialize the video store - load image and positions
     */
    async init() {
        if (this.isInitialized) return;

        try {
            // Load DVD positions from JSON
            await this.loadDVDPositions();

            // Create the container structure
            this.createContainerStructure();

            // Preload the base image
            await this.preloadImage(this.options.baseImagePath);

            this.isInitialized = true;
        } catch (error) {
            console.error('VideoStoreImage initialization failed:', error);
            throw error;
        }
    }

    /**
     * Load DVD case positions from JSON configuration
     */
    async loadDVDPositions() {
        try {
            const response = await fetch(this.options.positionsPath);
            if (!response.ok) {
                throw new Error(`Failed to load positions: ${response.status}`);
            }
            const data = await response.json();
            this.positions = data.positions;
            this.imageWidth = data.imageWidth;
            this.imageHeight = data.imageHeight;
        } catch (error) {
            console.error('Error loading DVD positions:', error);
            throw error;
        }
    }

    /**
     * Create the container structure with base image
     */
    createContainerStructure() {
        this.container.innerHTML = '';
        this.container.classList.add('videostore-image-container');

        // Create base image element
        this.baseImage = document.createElement('img');
        this.baseImage.src = this.options.baseImagePath;
        this.baseImage.alt = 'Video Store Shelf';
        this.baseImage.className = 'videostore-base-image';
        this.baseImage.draggable = false;

        // Create overlay container for posters
        this.overlayContainer = document.createElement('div');
        this.overlayContainer.className = 'videostore-overlay-container';

        this.container.appendChild(this.baseImage);
        this.container.appendChild(this.overlayContainer);
    }

    /**
     * Preload an image and return a promise
     */
    preloadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
            img.src = src;
        });
    }

    /**
     * Create a poster overlay element for a movie at a given position
     */
    createPosterOverlay(movie, position, index) {
        const overlay = document.createElement('div');
        overlay.className = 'poster-overlay';
        overlay.dataset.index = index;

        // Calculate percentage-based positions for responsiveness
        const leftPercent = (position.x / this.imageWidth) * 100;
        const topPercent = (position.y / this.imageHeight) * 100;
        const widthPercent = (position.width / this.imageWidth) * 100;
        const heightPercent = (position.height / this.imageHeight) * 100;

        overlay.style.left = `${leftPercent}%`;
        overlay.style.top = `${topPercent}%`;
        overlay.style.width = `${widthPercent}%`;
        overlay.style.height = `${heightPercent}%`;

        // Apply perspective transforms
        const transforms = [];
        if (position.skewX) transforms.push(`skewX(${position.skewX}deg)`);
        if (position.skewY) transforms.push(`skewY(${position.skewY}deg)`);
        if (position.scaleX !== 1 || position.scaleY !== 1) {
            transforms.push(`scale(${position.scaleX || 1}, ${position.scaleY || 1})`);
        }
        if (transforms.length > 0) {
            overlay.style.transform = transforms.join(' ');
        }

        // Create poster image
        const img = document.createElement('img');
        img.className = 'poster-image';
        img.alt = movie.title;
        img.draggable = false;

        // Use TMDB w185 size for smaller posters (sufficient for ~50px overlays)
        if (movie.posterUrl) {
            // Replace w500 with w185 for smaller file size
            img.src = movie.posterUrl.replace('/w500/', `/${this.options.posterSize}/`);
        } else {
            // Use placeholder with hue rotation
            img.src = '/static/placeholder_movie_poster.jpg';
            const hueRotation = (index * 24) % 360;
            img.style.filter = `hue-rotate(${hueRotation}deg)`;
        }

        overlay.appendChild(img);
        return overlay;
    }

    /**
     * Populate the shelves with movie posters
     */
    populateShelvesWithMovies(movies, selectedMovie) {
        this.overlayContainer.innerHTML = '';
        this.posterElements = [];

        const numPositions = this.positions.length;

        // Create a shuffled copy of movies (already unique from API)
        let displayMovies = [...movies];

        // Shuffle for visual variety
        for (let i = displayMovies.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [displayMovies[i], displayMovies[j]] = [displayMovies[j], displayMovies[i]];
        }

        // Trim to fit available positions
        displayMovies = displayMovies.slice(0, numPositions);

        // Find the selected movie (guaranteed to be in the list from API)
        let selectedIndex = displayMovies.findIndex(m => m.title === selectedMovie.title);

        this.displayedMovies = displayMovies;
        this.selectedMovieIndex = selectedIndex;

        // Create poster overlays
        displayMovies.forEach((movie, index) => {
            const position = this.positions[index];
            const overlay = this.createPosterOverlay(movie, position, index);
            this.overlayContainer.appendChild(overlay);
            this.posterElements.push(overlay);
        });

        // Preload poster images
        this.preloadPosters(displayMovies);

        return selectedIndex;
    }

    /**
     * Preload poster images for smoother animation
     */
    async preloadPosters(movies) {
        const promises = movies.map(movie => {
            if (movie.posterUrl) {
                const src = movie.posterUrl.replace('/w500/', `/${this.options.posterSize}/`);
                return this.preloadImage(src).catch(() => null);
            }
            return Promise.resolve();
        });

        await Promise.all(promises);
    }

    /**
     * Start the browsing animation sequence
     */
    async startBrowsingAnimation(movies, selectedMovie, onComplete) {
        if (!this.isInitialized) {
            await this.init();
        }

        // Convert movies to consistent format
        const formattedMovies = movies.map(m => ({
            title: m.title,
            posterUrl: m.posterUrl || m.poster_url || '',
            color: m.color || '#5E81AC'
        }));

        // Populate shelves
        const finalIndex = this.populateShelvesWithMovies(formattedMovies, selectedMovie);

        // Generate browsing path
        const path = this.generateBrowsingPath(finalIndex);

        // Animate browsing
        await this.animateBrowsing(path, onComplete);
    }

    /**
     * Generate an organic browsing path that ends at the selected movie
     */
    generateBrowsingPath(finalIndex) {
        const path = [];
        const numPositions = this.positions.length;

        // Group positions by row for natural browsing
        const rows = {};
        this.positions.forEach((pos, idx) => {
            if (!rows[pos.row]) rows[pos.row] = [];
            rows[pos.row].push(idx);
        });

        const rowNumbers = Object.keys(rows).map(Number).sort();
        const numRows = rowNumbers.length;

        // Determine final row and column
        const finalPosition = this.positions[finalIndex];
        const finalRow = finalPosition.row;
        const finalRowPositions = rows[finalRow];
        const finalColIndex = finalRowPositions.indexOf(finalIndex);

        // Start from a random position
        let currentRow = rowNumbers[Math.floor(Math.random() * Math.min(2, numRows))];
        let currentRowPositions = rows[currentRow];
        let currentColIndex = Math.floor(Math.random() * currentRowPositions.length);

        // Build browsing path
        const maxSteps = 15;

        for (let step = 0; step < maxSteps; step++) {
            const currentIndex = rows[currentRow][currentColIndex];
            path.push(currentIndex);

            const stepsRemaining = maxSteps - step;

            if (stepsRemaining <= 3) {
                // Move toward the final position
                if (currentRow !== finalRow) {
                    const direction = finalRow > currentRow ? 1 : -1;
                    const nextRowIdx = rowNumbers.indexOf(currentRow) + direction;
                    if (nextRowIdx >= 0 && nextRowIdx < rowNumbers.length) {
                        currentRow = rowNumbers[nextRowIdx];
                        currentRowPositions = rows[currentRow];
                        // Adjust column index to stay in bounds
                        currentColIndex = Math.min(currentColIndex, currentRowPositions.length - 1);
                    }
                } else if (currentColIndex !== finalColIndex) {
                    currentColIndex += (finalColIndex > currentColIndex) ? 1 : -1;
                }
            } else {
                // Natural browsing - mostly horizontal with occasional row changes
                const moveType = Math.random();

                if (moveType < 0.7) {
                    // Move horizontally
                    const direction = Math.random() < 0.5 ? -1 : 1;
                    currentColIndex = Math.max(0, Math.min(currentRowPositions.length - 1, currentColIndex + direction));
                } else if (moveType < 0.9) {
                    // Change row
                    const direction = Math.random() < 0.5 ? -1 : 1;
                    const nextRowIdx = rowNumbers.indexOf(currentRow) + direction;
                    if (nextRowIdx >= 0 && nextRowIdx < rowNumbers.length) {
                        currentRow = rowNumbers[nextRowIdx];
                        currentRowPositions = rows[currentRow];
                        currentColIndex = Math.min(currentColIndex, currentRowPositions.length - 1);
                    }
                }
                // 10% chance to pause (no movement)
            }
        }

        // Ensure final position is the selected movie
        path.push(finalIndex);

        return path;
    }

    /**
     * Animate the browsing highlight along the path
     */
    animateBrowsing(path, onComplete) {
        return new Promise((resolve) => {
            let currentStep = 0;
            const totalSteps = path.length;

            const getDelay = (step) => {
                const progress = step / totalSteps;
                // Base delay with gradual slowdown
                const baseDelay = 250 + (progress * 200);
                const variation = Math.random() * 100 - 50;

                // Extra pause near the end
                if (progress > 0.85) {
                    return baseDelay + 300 + variation;
                }

                return baseDelay + variation;
            };

            const step = () => {
                // Clear previous highlight
                this.posterElements.forEach(el => {
                    el.classList.remove('highlighted');
                });

                const positionIndex = path[currentStep];
                this.highlightPosition(positionIndex);

                // Play tick sound
                if (this.onTickSound && this.soundEnabled) {
                    const pitch = 500 + (currentStep / totalSteps) * 200 + Math.random() * 50;
                    this.onTickSound(pitch);
                }

                currentStep++;

                if (currentStep < totalSteps) {
                    setTimeout(step, getDelay(currentStep));
                } else {
                    // Final selection
                    setTimeout(() => {
                        this.selectMovie(positionIndex);

                        // Complete callback after selection animation
                        setTimeout(() => {
                            if (onComplete) onComplete();
                            resolve();
                        }, 800);
                    }, 400);
                }
            };

            // Start after a brief delay
            setTimeout(step, 300);
        });
    }

    /**
     * Highlight a position during browsing
     */
    highlightPosition(index) {
        this.currentHighlightIndex = index;

        if (this.posterElements[index]) {
            this.posterElements[index].classList.add('highlighted');
        }
    }

    /**
     * Handle final movie selection animation
     */
    selectMovie(index) {
        if (this.onSelectionSound && this.soundEnabled) {
            this.onSelectionSound();
        }

        const element = this.posterElements[index];
        if (element) {
            element.classList.remove('highlighted');
            element.classList.add('selected');
        }
    }

    /**
     * Reset for next animation run
     */
    reset() {
        this.posterElements.forEach(el => {
            el.classList.remove('highlighted', 'selected');
        });
        this.currentHighlightIndex = -1;

        // Clear overlays
        if (this.overlayContainer) {
            this.overlayContainer.innerHTML = '';
        }
        this.posterElements = [];
    }

    /**
     * Full cleanup and disposal
     */
    dispose() {
        this.reset();

        if (this.container) {
            this.container.innerHTML = '';
            this.container.classList.remove('videostore-image-container');
        }

        this.isInitialized = false;
        this.positions = [];
        this.baseImage = null;
        this.overlayContainer = null;
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.VideoStoreImage = VideoStoreImage;
}
