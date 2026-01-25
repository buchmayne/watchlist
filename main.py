from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from typing import List, Optional
import sqlite3
import json
import os
from contextlib import contextmanager
import uvicorn

app = FastAPI(title="Movie Tagger", description="Tag and organize your movie collection")

# Setup templates
templates = Jinja2Templates(directory="templates")

# Database setup
DATABASE = 'movies.db'

# Pydantic models
class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(default="#3b82f6", pattern=r"^#[0-9A-Fa-f]{6}$")
    weight: float = Field(default=1.0, ge=0.0, le=10.0)

class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    weight: Optional[float] = Field(None, ge=0.0, le=10.0)

class Category(BaseModel):
    id: int
    name: str
    color: str
    weight: float = 1.0

class MovieTagsUpdate(BaseModel):
    category_ids: List[int] = Field(default=[])

class Movie(BaseModel):
    id: int
    title: str
    category_names: Optional[str] = None
    category_colors: Optional[str] = None

class MovieWithTags(BaseModel):
    id: int
    title: str
    tags: List[Category] = []

# Database utilities
@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    """Initialize the database with required tables."""
    with get_db() as conn:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS movies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT UNIQUE NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                color TEXT DEFAULT '#3b82f6',
                weight REAL DEFAULT 1.0
            );
            
            CREATE TABLE IF NOT EXISTS movie_categories (
                movie_id INTEGER,
                category_id INTEGER,
                PRIMARY KEY (movie_id, category_id),
                FOREIGN KEY (movie_id) REFERENCES movies (id),
                FOREIGN KEY (category_id) REFERENCES categories (id)
            );
        ''')
        
        # Add weight column to existing categories table if it doesn't exist
        try:
            conn.execute('ALTER TABLE categories ADD COLUMN weight REAL DEFAULT 1.0')
            conn.commit()
        except sqlite3.OperationalError:
            # Column already exists
            pass
        
        conn.commit()

def load_movies_from_file(filename='movie_titles.json'):
    """Load only new movies from the scraped JSON file into database.

    Handles title format changes (e.g., 'Movie' -> 'Movie (2020)') by updating
    existing entries rather than creating duplicates.
    """
    import re

    if not os.path.exists(filename):
        print(f"No {filename} found. Run the scraper first.")
        return

    with open(filename, 'r', encoding='utf-8') as f:
        titles = json.load(f)

    year_pattern = re.compile(r'^(.+?)\s*\((\d{4})\)$')

    with get_db() as conn:
        # Get existing titles mapped by normalized name (without year)
        existing_movies = {}
        for row in conn.execute('SELECT id, title FROM movies').fetchall():
            existing_movies[row['title']] = row['id']
            # Also map by title without year for matching
            match = year_pattern.match(row['title'])
            if match:
                existing_movies[match.group(1).strip()] = row['id']

        added = 0
        updated = 0

        for title in titles:
            if title in existing_movies:
                # Exact match exists, skip
                continue

            # Check if title without year exists (e.g., "Movie" when adding "Movie (2020)")
            match = year_pattern.match(title)
            if match:
                base_title = match.group(1).strip()
                if base_title in existing_movies:
                    # Update existing entry to include year
                    movie_id = existing_movies[base_title]
                    conn.execute('UPDATE movies SET title = ? WHERE id = ?', (title, movie_id))
                    updated += 1
                    continue

            # New movie, insert it
            try:
                conn.execute('INSERT INTO movies (title) VALUES (?)', (title,))
                added += 1
            except sqlite3.Error as e:
                print(f"Error inserting {title}: {e}")

        conn.commit()

    print(f"Found {len(titles)} movies in file: added {added} new, updated {updated} existing")

# Routes
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Main page showing all movies with tagging interface."""
    with get_db() as conn:
        # Get all movies with their categories
        movies_data = conn.execute('''
            SELECT m.id, m.title,
                   GROUP_CONCAT(c.name) as category_names,
                   GROUP_CONCAT(c.color) as category_colors
            FROM movies m
            LEFT JOIN movie_categories mc ON m.id = mc.movie_id
            LEFT JOIN categories c ON mc.category_id = c.id
            GROUP BY m.id, m.title
            ORDER BY m.title
        ''').fetchall()
        
        movies = [dict(row) for row in movies_data]
        
        # Get all categories
        categories_data = conn.execute('SELECT * FROM categories ORDER BY name').fetchall()
        categories = [dict(row) for row in categories_data]
    
    return templates.TemplateResponse("index.html", {
        "request": request, 
        "movies": movies, 
        "categories": categories
    })

@app.get("/categories", response_class=HTMLResponse)
async def manage_categories(request: Request):
    """Page for managing categories."""
    with get_db() as conn:
        categories_data = conn.execute('SELECT * FROM categories ORDER BY name').fetchall()
        categories = [dict(row) for row in categories_data]
    
    return templates.TemplateResponse("categories.html", {
        "request": request, 
        "categories": categories
    })

@app.get("/api/categories", response_model=List[Category])
async def get_categories():
    """Get all categories."""
    with get_db() as conn:
        categories_data = conn.execute('SELECT id, name, color, COALESCE(weight, 1.0) as weight FROM categories ORDER BY name').fetchall()
        return [Category(**dict(row)) for row in categories_data]

@app.post("/api/categories", response_model=dict)
async def create_category(category: CategoryCreate):
    """Create a new category."""
    try:
        with get_db() as conn:
            cursor = conn.execute(
                'INSERT INTO categories (name, color, weight) VALUES (?, ?, ?)', 
                (category.name, category.color, category.weight)
            )
            conn.commit()
            return {"success": True, "id": cursor.lastrowid}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Category already exists")

@app.put("/api/categories/{category_id}")
async def update_category(category_id: int, category_update: CategoryUpdate):
    """Update a category."""
    with get_db() as conn:
        # Check if category exists
        category = conn.execute('SELECT id FROM categories WHERE id = ?', (category_id,)).fetchone()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
        
        # Build update query dynamically
        updates = []
        params = []
        
        if category_update.name is not None:
            updates.append("name = ?")
            params.append(category_update.name)
        
        if category_update.color is not None:
            updates.append("color = ?")
            params.append(category_update.color)
            
        if category_update.weight is not None:
            updates.append("weight = ?")
            params.append(category_update.weight)
        
        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")
        
        params.append(category_id)
        query = f"UPDATE categories SET {', '.join(updates)} WHERE id = ?"
        
        try:
            conn.execute(query, params)
            conn.commit()
            return {"success": True}
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="Category name already exists")

@app.delete("/api/categories/{category_id}")
async def delete_category(category_id: int):
    """Delete a category and all its associations."""
    with get_db() as conn:
        # Check if category exists
        category = conn.execute('SELECT id FROM categories WHERE id = ?', (category_id,)).fetchone()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
        
        # Delete associations and category
        conn.execute('DELETE FROM movie_categories WHERE category_id = ?', (category_id,))
        conn.execute('DELETE FROM categories WHERE id = ?', (category_id,))
        conn.commit()
    
    return {"success": True}

@app.get("/api/movies", response_model=List[Movie])
async def get_movies():
    """Get all movies with their tags."""
    with get_db() as conn:
        movies_data = conn.execute('''
            SELECT m.id, m.title,
                   GROUP_CONCAT(c.name) as category_names,
                   GROUP_CONCAT(c.color) as category_colors
            FROM movies m
            LEFT JOIN movie_categories mc ON m.id = mc.movie_id
            LEFT JOIN categories c ON mc.category_id = c.id
            GROUP BY m.id, m.title
            ORDER BY m.title
        ''').fetchall()
        
        return [Movie(**dict(row)) for row in movies_data]

@app.get("/api/movies/{movie_id}/tags", response_model=List[Category])
async def get_movie_tags(movie_id: int):
    """Get current tags for a movie."""
    with get_db() as conn:
        # Check if movie exists
        movie = conn.execute('SELECT id FROM movies WHERE id = ?', (movie_id,)).fetchone()
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")
        
        tags_data = conn.execute('''
            SELECT c.id, c.name, c.color
            FROM categories c
            JOIN movie_categories mc ON c.id = mc.category_id
            WHERE mc.movie_id = ?
        ''', (movie_id,)).fetchall()
    
    return [Category(**dict(tag)) for tag in tags_data]

@app.post("/api/movies/{movie_id}/tags")
async def update_movie_tags(movie_id: int, tags_update: MovieTagsUpdate):
    """Update tags for a movie."""
    with get_db() as conn:
        # Check if movie exists
        movie = conn.execute('SELECT id FROM movies WHERE id = ?', (movie_id,)).fetchone()
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")
        
        # Validate category IDs exist
        if tags_update.category_ids:
            placeholders = ','.join('?' * len(tags_update.category_ids))
            valid_categories = conn.execute(
                f'SELECT COUNT(*) as count FROM categories WHERE id IN ({placeholders})', 
                tags_update.category_ids
            ).fetchone()
            
            if valid_categories['count'] != len(tags_update.category_ids):
                raise HTTPException(status_code=400, detail="One or more category IDs are invalid")
        
        # Remove existing tags
        conn.execute('DELETE FROM movie_categories WHERE movie_id = ?', (movie_id,))
        
        # Add new tags
        for category_id in tags_update.category_ids:
            conn.execute(
                'INSERT INTO movie_categories (movie_id, category_id) VALUES (?, ?)', 
                (movie_id, category_id)
            )
        conn.commit()
    
    return {"success": True}

@app.get("/api/movies/random", response_model=Movie)
async def get_random_movie(category_ids: Optional[str] = None, exclude_untagged: bool = False, use_weights: bool = True):
    """Get a random movie from the collection, optionally filtered by categories with weighted selection."""
    import random
    
    # Get all movies that match the criteria
    base_query = '''
        SELECT DISTINCT m.id, m.title,
               GROUP_CONCAT(c.name) as category_names,
               GROUP_CONCAT(c.color) as category_colors
        FROM movies m
        LEFT JOIN movie_categories mc ON m.id = mc.movie_id
        LEFT JOIN categories c ON mc.category_id = c.id
    '''
    
    conditions = []
    params = []
    
    # Filter by categories if specified
    if category_ids:
        try:
            cat_ids = [int(x.strip()) for x in category_ids.split(',')]
            placeholders = ','.join('?' * len(cat_ids))
            conditions.append(f'''
                m.id IN (
                    SELECT DISTINCT movie_id 
                    FROM movie_categories 
                    WHERE category_id IN ({placeholders})
                )
            ''')
            params.extend(cat_ids)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid category IDs")
    
    # Exclude untagged movies if requested
    if exclude_untagged:
        conditions.append('''
            m.id IN (
                SELECT DISTINCT movie_id 
                FROM movie_categories
            )
        ''')
    
    # Build final query
    if conditions:
        base_query += ' WHERE ' + ' AND '.join(conditions)
    
    base_query += ' GROUP BY m.id, m.title'
    
    with get_db() as conn:
        movies_data = conn.execute(base_query, params).fetchall()
        
        if not movies_data:
            raise HTTPException(status_code=404, detail="No movies found matching criteria")
        
        # If not using weights or no category filter, just pick randomly
        if not use_weights or not category_ids:
            selected_movie = random.choice(movies_data)
            return Movie(**dict(selected_movie))
        
        # Weighted selection based on category weights
        movie_weights = []
        
        for movie_row in movies_data:
            movie_id = movie_row['id']
            
            # Get weights for this movie's categories that match the filter
            weight_query = '''
                SELECT AVG(COALESCE(c.weight, 1.0)) as avg_weight
                FROM movie_categories mc
                JOIN categories c ON mc.category_id = c.id
                WHERE mc.movie_id = ? AND c.id IN ({})
            '''.format(','.join('?' * len(cat_ids)))
            
            weight_result = conn.execute(weight_query, [movie_id] + cat_ids).fetchone()
            avg_weight = weight_result['avg_weight'] if weight_result['avg_weight'] else 1.0
            movie_weights.append(avg_weight)
        
        # Weighted random selection
        total_weight = sum(movie_weights)
        if total_weight <= 0:
            # Fallback to uniform selection if all weights are 0
            selected_movie = random.choice(movies_data)
        else:
            rand_val = random.uniform(0, total_weight)
            cumulative_weight = 0
            
            for i, weight in enumerate(movie_weights):
                cumulative_weight += weight
                if rand_val <= cumulative_weight:
                    selected_movie = movies_data[i]
                    break
            else:
                # Fallback (shouldn't happen)
                selected_movie = movies_data[-1]
        
        return Movie(**dict(selected_movie))

@app.get("/api/movies/search/{query}", response_model=List[Movie])
async def search_movies(query: str):
    """Search movies by title."""
    with get_db() as conn:
        movies_data = conn.execute('''
            SELECT m.id, m.title,
                   GROUP_CONCAT(c.name) as category_names,
                   GROUP_CONCAT(c.color) as category_colors
            FROM movies m
            LEFT JOIN movie_categories mc ON m.id = mc.movie_id
            LEFT JOIN categories c ON mc.category_id = c.id
            WHERE m.title LIKE ?
            GROUP BY m.id, m.title
            ORDER BY m.title
        ''', (f'%{query}%',)).fetchall()
        
        return [Movie(**dict(row)) for row in movies_data]

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize database and load movies on startup."""
    print("Initializing database...")
    init_db()
    print("Loading movies from file...")
    load_movies_from_file()
    print("Movie Tagger API ready!")

# For development
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)