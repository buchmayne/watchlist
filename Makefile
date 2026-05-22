.PHONY: run stop scrape posters install clean reset-db refresh help

# Run the FastAPI application
run:
	uv run src/main.py

# Stop the local server (kills process on port 8000)
stop:
	@lsof -ti:8000 | xargs kill -9 2>/dev/null || echo "No server running on port 8000"

# Run the Letterboxd scraper to fetch movie titles
scrape:
	uv run src/scrape_movies_from_letterboxd.py

# Fetch posters for movies missing them (requires server to be running)
posters:
	@curl -s -X POST http://localhost:8000/api/movies/fetch-posters | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"Fetched {d['fetched']} posters ({d['failed']} failed, {d['total']} total missing)\")"

# Install dependencies
install:
	uv sync

# Clean generated files (keeps database intact)
clean:
	rm -f data/movie_titles.json data/movie_titles.csv

# Reset database (WARNING: deletes all data including tags)
reset-db:
	rm -f data/movies.db

# Full refresh: scrape new titles, fetch posters, and run the app
refresh:
	$(MAKE) scrape
	@echo "Starting server to fetch posters..."
	@uv run src/main.py & SERVER_PID=$$!; \
	sleep 3; \
	curl -s -X POST http://localhost:8000/api/movies/fetch-posters | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"Fetched {d['fetched']} posters ({d['failed']} failed, {d['total']} total missing)\")"; \
	kill $$SERVER_PID 2>/dev/null; \
	echo "Restarting server..."
	$(MAKE) run

help:
	@echo "Available commands:"
	@echo "  make run       - Run the FastAPI application"
	@echo "  make stop      - Stop the local server (port 8000)"
	@echo "  make scrape    - Run the scraper to fetch movie titles"
	@echo "  make posters   - Fetch posters for movies missing them (server must be running)"
	@echo "  make install   - Install dependencies with uv"
	@echo "  make clean     - Remove generated JSON/CSV files"
	@echo "  make reset-db  - Delete the database (WARNING: loses all tags)"
	@echo "  make refresh   - Full update: scrape, fetch posters, and run the app"
