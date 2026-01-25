import cloudscraper
from bs4 import BeautifulSoup
import time
import json
import csv
from typing import List


class LetterboxdTitleScraper:
    def __init__(self):
        self.scraper = cloudscraper.create_scraper()

    def scrape_titles(self, list_url: str) -> List[str]:
        """Extract movie titles from a Letterboxd list."""
        titles = []
        page = 1

        while True:
            page_url = f"{list_url}page/{page}/" if page > 1 else list_url
            print(f"Scraping page {page}...")

            try:
                response = self.scraper.get(page_url, timeout=10)
                response.raise_for_status()
                soup = BeautifulSoup(response.content, "html.parser")
            except Exception as e:
                print(f"Failed to fetch {page_url}: {e}")
                break

            # Find all movie poster containers
            poster_list = soup.find("ul", class_="poster-list")
            if not poster_list:
                print(f"No poster list found on page {page}")
                break

            poster_items = poster_list.find_all("li", class_="posteritem")
            if not poster_items:
                print(f"No movies found on page {page}")
                break

            page_titles = []
            for item in poster_items:
                # Title is in the data attribute of the react component div
                react_div = item.find("div", class_="react-component")
                if react_div and react_div.get("data-item-full-display-name"):
                    page_titles.append(react_div.get("data-item-full-display-name"))

            if not page_titles:
                print("No titles extracted, stopping")
                break

            titles.extend(page_titles)
            print(f"Found {len(page_titles)} titles on page {page}")

            # Check for next page
            pagination = soup.find("div", class_="paginate-pages")
            if pagination:
                next_link = pagination.find("a", class_="next")
                if not next_link:
                    break
            else:
                break

            page += 1
            time.sleep(1)

        return titles

    def save_to_csv(self, titles: List[str], filename: str = "movie_titles.csv"):
        """Save titles to CSV file."""
        with open(filename, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(["title"])  # Header
            for title in titles:
                writer.writerow([title])
        print(f"Saved {len(titles)} titles to {filename}")

    def save_to_json(self, titles: List[str], filename: str = "movie_titles.json"):
        """Save titles to JSON file."""
        with open(filename, "w", encoding="utf-8") as jsonfile:
            json.dump(titles, jsonfile, indent=2, ensure_ascii=False)
        print(f"Saved {len(titles)} titles to {filename}")


def main():
    LIST_URL = "https://letterboxd.com/buchmayne/list/blurays/"

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

