# Plan: Favorite Projects Feature

## Task Description
Add a small button to each project in the projects list that allows users to favorite projects. Favorited projects should appear at the top of the list, making it easy to access frequently used projects.

## Objective
Enable users to mark projects as favorites with a star button, persist favorites in localStorage, and display favorited projects at the top of the project list.

## Problem Statement
When users have many Claude projects, it becomes difficult to quickly access the ones they use most frequently. The current project list shows all projects in order without any way to prioritize commonly used ones.

## Solution Approach
- Add a star/favorite toggle button to each project item in the sidebar
- Store favorited project paths in localStorage for persistence
- Sort the project list to show favorited projects first
- Style the favorite button to match the existing retro 80s neon arcade theme

## Relevant Files
Use these files to complete the task:

- `public/app.js` - Contains the `searchProjects()` function that renders the project list, and all state/localStorage handling
- `public/style.css` - Contains all styling including the project item styles that need the favorite button styles
- `public/index.html` - No changes needed (project list is dynamically generated)

## Implementation Phases

### Phase 1: Foundation
Add localStorage utilities for managing favorites array

### Phase 2: Core Implementation
Modify project list rendering to include favorite button and sort by favorites

### Phase 3: Integration & Polish
Add CSS styling for the favorite button with neon theme integration

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Add Favorites Storage Utilities
In `public/app.js`, add helper functions after the state object:
- Add `getFavorites()` function to read favorites array from localStorage (returns `[]` if empty)
- Add `toggleFavorite(projectPath)` function to add/remove a path from favorites
- Add `isFavorite(projectPath)` function to check if a project is favorited

```javascript
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem('favoriteProjects') || '[]');
  } catch {
    return [];
  }
}

function toggleFavorite(projectPath) {
  const favorites = getFavorites();
  const index = favorites.indexOf(projectPath);
  if (index === -1) {
    favorites.push(projectPath);
  } else {
    favorites.splice(index, 1);
  }
  localStorage.setItem('favoriteProjects', JSON.stringify(favorites));
  return index === -1; // returns true if now favorited
}

function isFavorite(projectPath) {
  return getFavorites().includes(projectPath);
}
```

### 2. Modify Project List Rendering
In the `searchProjects()` function in `public/app.js`:
- Before rendering, sort projects array so favorites appear first
- Add a favorite button (star icon) to each project item HTML
- The button should show filled star if favorited, outline star if not

Modify the project item HTML template around line 566 to include:
```javascript
// Sort favorites to top
const favorites = getFavorites();
projects.sort((a, b) => {
  const aFav = favorites.includes(a.path);
  const bFav = favorites.includes(b.path);
  if (aFav && !bFav) return -1;
  if (!aFav && bFav) return 1;
  return 0;
});

projectList.innerHTML = projects.map(p => {
  const favored = isFavorite(p.path);
  return `
    <div class="project-item" data-name="${escapeAttr(p.name)}" data-path="${escapeAttr(p.path)}">
      <button class="favorite-btn${favored ? ' active' : ''}" data-path="${escapeAttr(p.path)}" aria-label="${favored ? 'Unfavorite' : 'Favorite'}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="${favored ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </button>
      <span class="session-count">${p.sessionCount}</span>
      <span class="project-name">${escapeHtml(p.displayName)}</span>
      <span class="project-path">${escapeHtml(p.path)}</span>
    </div>
  `;
}).join('');
```

### 3. Add Event Handler for Favorite Button
After rendering the project list, add click handler for favorite buttons:
- The handler should stop propagation (so clicking favorite doesn't select the project)
- Toggle the favorite status
- Update the button appearance
- Re-sort and re-render the list

```javascript
projectList.querySelectorAll('.favorite-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const path = btn.dataset.path;
    const nowFavorited = toggleFavorite(path);
    // Re-render to update order and button state
    searchProjects(projectSearch.value);
  });
});
```

### 4. Add CSS Styles for Favorite Button
In `public/style.css`, add styles for the favorite button:
- Position it on the left side of the project item
- Use neon yellow/gold color for favorited state
- Add hover effects consistent with the theme
- Ensure touch-friendly size for mobile

```css
.favorite-btn {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-dimmer);
  cursor: pointer;
  border-radius: 4px;
  transition: color 0.2s, transform 0.1s;
  z-index: 1;
}

.favorite-btn:hover {
  color: var(--neon-orange);
  transform: translateY(-50%) scale(1.1);
}

.favorite-btn.active {
  color: var(--neon-orange);
}

.favorite-btn.active:hover {
  color: var(--neon-red);
}

/* Adjust project-item to accommodate favorite button */
.project-item {
  position: relative;
  padding-left: 44px;
}
```

### 5. Validate Implementation
- Open the app in browser
- Navigate to the project list
- Click the star button on a project - should turn orange/filled
- Verify the favorited project moves to the top of the list
- Refresh the page - favorites should persist
- Click the star again to unfavorite - should move back to original position
- Test on mobile viewport to ensure touch targets are adequate

## Testing Strategy
1. **Unit Testing:**
   - Test `getFavorites()` returns empty array when no favorites
   - Test `toggleFavorite()` adds and removes paths correctly
   - Test `isFavorite()` returns correct boolean

2. **Integration Testing:**
   - Verify favorite button click toggles state
   - Verify favorites persist across page reloads
   - Verify favorited projects sort to top
   - Verify clicking favorite doesn't trigger project selection

3. **Edge Cases:**
   - Empty project list
   - All projects favorited
   - No projects favorited
   - LocalStorage unavailable/full

## Acceptance Criteria
- [ ] Star button appears on each project item in the sidebar
- [ ] Clicking star toggles favorite state (filled/outline star)
- [ ] Favorited projects appear at the top of the project list
- [ ] Favorites persist across page reloads (stored in localStorage)
- [ ] Clicking the star button does NOT select the project
- [ ] Button styling matches the retro neon theme (orange/gold for active)
- [ ] Touch-friendly button size on mobile (minimum 32px)

## Validation Commands
Execute these commands to validate the task is complete:

- Open `http://localhost:3000` in browser (or wherever the app runs)
- Open DevTools > Application > Local Storage - verify `favoriteProjects` key appears after favoriting
- Test responsive design at mobile breakpoint (< 768px)
- Verify no console errors when toggling favorites

## Notes
- This is a client-side only change - no backend modifications required
- The favorites are stored per-browser (localStorage), not per-user account
- If backend storage is needed later, favorites could be synced via API
- Consider adding a "Favorites" section header in the list if there are favorited projects (optional enhancement)
