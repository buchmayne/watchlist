.PHONY: run stop scrape install clean reset-db help

# Run the FastAPI application
run:
	uv run main.py

# Stop the local server (kills process on port 8000)
stop:
	@lsof -ti:8000 | xargs kill -9 2>/dev/null || echo "No server running on port 8000"

# Run the Letterboxd scraper to fetch movie titles
scrape:
	uv run scrape_movies_from_letterboxd.py

# Install dependencies
install:
	uv sync

# Clean generated files (keeps database intact)
clean:
	rm -f movie_titles.json movie_titles.csv

# Reset database (WARNING: deletes all data including tags)
reset-db:
	rm -f movies.db

# Scrape and run the app
refresh: scrape run

help:
	@echo "Available commands:"
	@echo "  make run       - Run the FastAPI application"
	@echo "  make stop      - Stop the local server (port 8000)"
	@echo "  make scrape    - Run the scraper to fetch movie titles"
	@echo "  make install   - Install dependencies with uv"
	@echo "  make clean     - Remove generated JSON/CSV files"
	@echo "  make reset-db  - Delete the database (WARNING: loses all tags)"
	@echo "  make refresh   - Scrape new titles and run the app"
