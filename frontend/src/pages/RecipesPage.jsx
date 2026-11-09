import AppHeader from "../components/AppHeader.jsx";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

const recipes = [
  {
    name: "Kettle masala noodles",
    keywords: ["maggi", "masala maggi", "kettle noodles", "instant noodles", "cup noodles", "cup noodle"],
    time: "8 minutes",
    description: "A quick, warming bowl for a busy evening.",
    ingredients: ["Instant noodles", "Seasoning", "Mixed vegetables", "Water"],
    steps: ["Boil water in the kettle and pour it over noodles in a heat-safe bowl.", "Cover until soft, then mix in seasoning and vegetables."],
  },
  {
    name: "Overnight-style oats",
    keywords: ["oats", "porridge", "breakfast oats"],
    time: "5 minutes",
    description: "A simple breakfast with no stovetop needed.",
    ingredients: ["Rolled oats", "Milk or water", "Banana", "Nuts"],
    steps: ["Cover oats with hot water or warmed milk.", "Let stand until soft and finish with fruit and nuts."],
  },
  {
    name: "Tomato cup soup",
    keywords: ["soup", "instant soup"],
    time: "6 minutes",
    description: "A comforting snack between study sessions.",
    ingredients: ["Soup sachet", "Hot water", "Crackers", "Black pepper"],
    steps: ["Empty the soup mix into a mug.", "Add hot water gradually, stir well, and let it stand for a minute."],
  },
  {
    name: "Lemon kettle corn",
    keywords: ["corn", "lemon corn"],
    time: "12 minutes",
    description: "A bright, filling snack with a little crunch.",
    ingredients: ["Ready-to-eat boiled corn", "Lemon", "Salt", "Chili powder"],
    steps: ["Warm the corn in a heat-safe bowl with hot water.", "Drain carefully and season with lemon, salt, and chili."],
  },
  {
    name: "Kettle-steamed eggs",
    keywords: ["boiled eggs", "egg", "eggs"],
    time: "12 minutes",
    description: "A simple protein-rich option; follow appliance and food-safety guidance.",
    ingredients: ["Eggs", "Water", "Salt", "Black pepper"],
    steps: ["Place eggs in a heat-safe vessel and cover fully with hot water.", "Let stand until cooked through, then cool before peeling and seasoning."],
  },
  {
    name: "Instant masala pasta",
    keywords: ["instant pasta", "kettle pasta", "macaroni", "kettle macaroni"],
    time: "10 minutes",
    description: "A quick one-bowl variation for an easy snack.",
    ingredients: ["Instant pasta", "Seasoning", "Hot water", "Dried herbs"],
    steps: ["Put pasta in a heat-safe bowl and cover with hot water.", "Cover until tender, drain carefully if needed, and add seasoning."],
  },
  {
    name: "Mug tea or coffee",
    keywords: ["tea", "coffee", "hot drink", "chai"],
    time: "5 minutes",
    description: "Prepare an instant hot drink in a mug using kettle-boiled water.",
    ingredients: ["Tea or instant coffee", "Hot water", "Milk or sugar (optional)"],
    steps: ["Boil water in the kettle.", "Add the drink mix to a mug, pour in hot water, and stir."],
  },
];

export default function RecipesPage() {
  const [searchText, setSearchText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const filteredRecipes = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return recipes;
    return recipes.filter((recipe) =>
      [recipe.name, ...recipe.keywords, ...recipe.ingredients]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [searchTerm]);

  function submitSearch(event) {
    event.preventDefault();
    setSearchTerm(searchText.trim());
  }

  function clearSearch() {
    setSearchText("");
    setSearchTerm("");
  }

  function youtubeUrl(query) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} in an electric kettle`)}`;
  }

  return (
    <div className="app-page">
      <AppHeader />
      <main className="dashboard-wrap">
        <section className="dashboard-heading">
          <div>
            <Link className="button button-outline recipe-back-button" to="/student">
              <span aria-hidden="true">←</span> Back to Dashboard
            </Link>
            <p className="eyebrow">QUICK & EASY</p><h1>Kettle-friendly recipes</h1><p className="muted-copy">Simple ideas for a small-space kitchen. Use heat-safe containers and follow your hostel's appliance rules.</p>
          </div>
        </section>
        <section className="recipe-search-section" aria-label="Search recipes">
          <form className="recipe-search-form" onSubmit={submitSearch}>
            <label htmlFor="recipe-search">Find a kettle recipe</label>
            <div className="recipe-search-controls">
              <input
                id="recipe-search"
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Try Maggi, pasta, tea, oats or soup"
              />
              <button className="button button-primary" type="submit">Search</button>
              {searchTerm && <button className="button button-outline" type="button" onClick={clearSearch}>Clear</button>}
            </div>
          </form>
          {searchTerm && (
            <a className="youtube-search-link" href={youtubeUrl(searchTerm)} target="_blank" rel="noopener noreferrer">
              Watch {searchTerm} on YouTube <span aria-hidden="true">↗</span>
            </a>
          )}
        </section>
        <section className="recipe-grid">
          {filteredRecipes.map((recipe, index) => (
            <article className="recipe-card" key={recipe.name}>
              <div className={`recipe-art recipe-art-${index + 1}`} aria-hidden="true"><span>{index + 1}</span></div>
              <div className="recipe-content">
                <div className="recipe-meta"><span>{recipe.time}</span><span>Kettle friendly</span></div>
                <h2>{recipe.name}</h2>
                <p>{recipe.description}</p>
                <details><summary>Ingredients & steps</summary>
                  <h3>Ingredients</h3><ul>{recipe.ingredients.map((item) => <li key={item}>{item}</li>)}</ul>
                  <h3>Steps</h3><ol>{recipe.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                </details>
                <a className="recipe-youtube-link" href={youtubeUrl(searchTerm || recipe.name)} target="_blank" rel="noopener noreferrer">
                  Watch on YouTube <span aria-hidden="true">↗</span>
                </a>
              </div>
            </article>
          ))}
        </section>
        {searchTerm && filteredRecipes.length === 0 && (
          <div className="recipe-empty-state" role="status">
            <h2>No saved recipe matches “{searchTerm}” yet.</h2>
            <p>Try another search, or explore preparation ideas on YouTube.</p>
            <a className="button button-primary" href={youtubeUrl(searchTerm)} target="_blank" rel="noopener noreferrer">
              Watch on YouTube
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
