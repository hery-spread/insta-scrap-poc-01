# Port File to Apify Actor

## Task
Port a scraping script from TypeScript/JavaScript to Apify Actor format.

**Source file:** `{source_file}`
**Output file:** `src/apify/{platform}-search-apify.js`
**Reference examples:**
- `src/apify/youtube-search-apify.js` (from `src/youtube-search.ts`)
- `src/apify/instagram-search-apify.js` (from `src/instagram-search.ts`)

## Key Changes

### Structure
- Wrap main logic in `async function pageFunction(context)`
- Destructure `{ page, log }` from context
- Replace hardcoded values with template parameters: `%param%`

### Logging
- Replace `console.log()` with `log.info()`
- Convert string interpolation to structured objects
- Example: `console.log(\`Found \${count} items\`)` → `log.info("[Section] Found items", { count })`

### Language
- Convert TypeScript to vanilla JavaScript
- Remove type annotations and interfaces
- Keep all function logic intact

### Template Parameters
- Replace hardcoded configs with `%paramName%` placeholders
- Common params: `%search%`, `%maxResult%`, `%maxDuration%`
- Duration typically: `parseInt("%maxDuration%") * 60 * 1000` (minutes to milliseconds)
- Note: Username can be extracted dynamically via `extractUsername()` function

### Preserve Logic
- Keep all scraping logic unchanged
- Maintain pagination/scrolling approach
- Keep filtering and result processing
- Preserve timeout and limit checks
- Keep delays and wait timers

## Example Transformation
```javascript
// Before
console.log(`Found ${urls.length} posts`);

// After
log.info("[Posts] Found posts", { count: urls.length });
```

## Checklist
- [ ] Wrap in `pageFunction(context)`
- [ ] Replace all `console.log()` with `log.info()`
- [ ] Convert TypeScript syntax to JavaScript
- [ ] Add template parameters (% placeholders)
- [ ] Test all helper functions
- [ ] Return results array
