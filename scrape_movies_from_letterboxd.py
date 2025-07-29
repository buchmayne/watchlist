import requests
from bs4 import BeautifulSoup
import time
import json
import csv
from typing import List

class LetterboxdTitleScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        })
        
    def get_page(self, url: str) -> BeautifulSoup:
        """Fetch and parse a page."""
        try:
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            return BeautifulSoup(response.content, 'html.parser')
        except requests.RequestException as e:
            print(f"Failed to fetch {url}: {e}")
            return None
    
    def scrape_titles(self, list_url: str) -> List[str]:
        """Extract movie titles from a Letterboxd list."""
        titles = []
        page = 1
        
        while True:
            page_url = f"{list_url}page/{page}/" if page > 1 else list_url
            print(f"Scraping page {page}...")
            
            soup = self.get_page(page_url)
            if not soup:
                break
                
            # Find all movie poster containers
            poster_containers = soup.find_all('li', class_='poster-container')
            
            if not poster_containers:
                print(f"No movies found on page {page}")
                break
                
            page_titles = []
            for container in poster_containers:
                title = self.extract_title(container)
                if title:
                    page_titles.append(title)
                    
            if not page_titles:
                print("No titles extracted, stopping")
                break
                
            titles.extend(page_titles)
            print(f"Found {len(page_titles)} titles on page {page}")
            
            # Check for next page
            pagination = soup.find('div', class_='paginate-pages')
            if pagination:
                next_link = pagination.find('a', class_='next')
                if not next_link:
                    break
            else:
                break
                
            page += 1
            time.sleep(1)
            
        return titles
    
    def extract_title(self, container) -> str:
        """Extract movie title from a poster container."""
        try:
            # Find the image element and get title from alt text
            img = container.find('img')
            if img and img.get('alt'):
                return img.get('alt').strip()
                
            # Fallback: look for title in other elements
            title_elem = container.find('h2')
            if title_elem:
                return title_elem.get_text(strip=True)
                
            return None
            
        except Exception as e:
            print(f"Error extracting title: {e}")
            return None
    
    def save_to_csv(self, titles: List[str], filename: str = 'movie_titles.csv'):
        """Save titles to CSV file."""
        with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(['title'])  # Header
            for title in titles:
                writer.writerow([title])
        print(f"Saved {len(titles)} titles to {filename}")
    
    def save_to_json(self, titles: List[str], filename: str = 'movie_titles.json'):
        """Save titles to JSON file."""
        with open(filename, 'w', encoding='utf-8') as jsonfile:
            json.dump(titles, jsonfile, indent=2, ensure_ascii=False)
        print(f"Saved {len(titles)} titles to {filename}")

def main():
    LIST_URL = 'https://letterboxd.com/buchmayne/list/blurays/'
    
    scraper = LetterboxdTitleScraper()
    titles = scraper.scrape_titles(LIST_URL)
    
    if titles:
        print(f"\nScraping complete! Found {len(titles)} movies.")
        
        # Save in multiple formats
        scraper.save_to_csv(titles)
        scraper.save_to_json(titles)
        
    else:
        print("No titles found!")

if __name__ == "__main__":
    main()