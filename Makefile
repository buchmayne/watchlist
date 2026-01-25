.PHONY: run scrape install clean reset-db help

# Run the FastAPI application
run:
	uv run main.py

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
	@echo "  make scrape    - Run the scraper to fetch movie titles"
	@echo "  make install   - Install dependencies with uv"
	@echo "  make clean     - Remove generated JSON/CSV files"
	@echo "  make reset-db  - Delete the database (WARNING: loses all tags)"
	@echo "  make refresh   - Scrape new titles and run the app"
